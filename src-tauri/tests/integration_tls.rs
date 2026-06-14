/*
 * Prairie - a desktop GUI client for BisonDB
 * Copyright (C) 2026 Abdullah Masood
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
//! End-to-end: drive the real Prairie client against a real bisond over TLS +
//! authentication. Skips (passes) when the bisond binary isn't available, so
//! it never blocks a checkout without one.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use bson::doc;
use prairie_lib::client::{BisonConnection, ClientError, TlsConfig, TlsMode, TlsState};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

fn bisond_binary() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("BISOND_PATH") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    let name = if cfg!(windows) {
        "bisond.exe"
    } else {
        "bisond"
    };
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(name);
    p.exists().then_some(p)
}

fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn parse_fingerprint(line: &str) -> Option<String> {
    let idx = line.find("--tls-pin")?;
    let tok = line[idx + "--tls-pin".len()..].split_whitespace().next()?;
    (tok.len() == 64 && tok.chars().all(|c| c.is_ascii_hexdigit())).then(|| tok.to_string())
}

#[tokio::test]
async fn tls_auth_crud_against_real_bisond() {
    let Some(binary) = bisond_binary() else {
        eprintln!("skipping: bisond binary not found (set BISOND_PATH or copy-sidecar)");
        return;
    };

    let dir = std::env::temp_dir().join(format!("prairie_e2e_{}", free_port()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let port = free_port();

    let mut child = Command::new(&binary)
        .args([
            "--dir",
            dir.to_str().unwrap(),
            "--port",
            &port.to_string(),
            "--quiet",
            "--tls-self-signed",
            "--init-admin",
            "admin",
        ])
        .env("BISONDB_ADMIN_PASSWORD", "secret123")
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn bisond");

    // Read the self-signed fingerprint from the startup banner.
    let stderr = child.stderr.take().unwrap();
    let mut lines = BufReader::new(stderr).lines();
    let mut fingerprint = None;
    for _ in 0..100 {
        match tokio::time::timeout(Duration::from_secs(3), lines.next_line()).await {
            Ok(Ok(Some(line))) => {
                if let Some(fp) = parse_fingerprint(&line) {
                    fingerprint = Some(fp);
                    break;
                }
            }
            _ => break,
        }
    }
    let fingerprint = fingerprint.expect("read TLS fingerprint from bisond banner");
    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });

    let tls = TlsConfig {
        mode: TlsMode::Pin(fingerprint),
        hostname: "localhost".into(),
    };

    // Connect (with retries while the listener comes up).
    let mut conn = None;
    for _ in 0..30 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        if let Ok(c) = BisonConnection::connect(
            "127.0.0.1",
            port,
            Duration::from_millis(500),
            Some(tls.clone()),
        )
        .await
        {
            conn = Some(c);
            break;
        }
    }
    let mut conn = conn.expect("connect to bisond over TLS");
    assert_eq!(conn.tls, TlsState::Verified, "pinned cert => verified");

    // serverStatus before auth: protocol v2 + security flags.
    let status = conn.command(doc! {"cmd": "serverStatus"}).await.unwrap();
    assert_eq!(status.get_i32("protocolVersion").unwrap(), 2);
    let security = status.get_document("security").unwrap();
    assert!(security.get_bool("auth").unwrap());
    assert!(security.get_bool("tls").unwrap());

    // A data command before login is rejected.
    match conn.command(doc! {"cmd": "listCollections"}).await {
        Err(ClientError::Server { code, .. }) => assert_eq!(code, "AuthRequired"),
        other => panic!("expected AuthRequired, got {other:?}"),
    }

    // Authenticate, then CRUD works.
    conn.authenticate("admin", "secret123")
        .await
        .expect("login");
    assert!(conn.roles.iter().any(|r| r == "admin"));
    conn.command(doc! {"cmd": "createCollection", "coll": "things"})
        .await
        .unwrap();
    conn.command(doc! {"cmd": "insert", "coll": "things", "documents": [{"x": 1i32}]})
        .await
        .unwrap();
    let found = conn.find("things", doc! {}, 0, 0).await.unwrap();
    assert_eq!(found.len(), 1);

    // Wrong password is a generic AuthFailed.
    let mut bad = BisonConnection::connect(
        "127.0.0.1",
        port,
        Duration::from_millis(500),
        Some(tls.clone()),
    )
    .await
    .unwrap();
    match bad.authenticate("admin", "WRONG").await {
        Err(ClientError::Server { code, .. }) => assert_eq!(code, "AuthFailed"),
        other => panic!("expected AuthFailed, got {other:?}"),
    }

    let _ = child.start_kill();
    let _ = std::fs::remove_dir_all(&dir);
}

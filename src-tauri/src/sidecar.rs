//! Local bisond lifecycle: spawn the bundled server on a free port for
//! "open local database", kill it on disconnect / app exit.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::client::{BisonConnection, ClientError};

#[derive(Default)]
pub struct SidecarManager {
    /// connection id -> child process serving it
    pub children: Mutex<HashMap<u64, Child>>,
}

/// Finds the bundled bisond binary: BISOND_PATH env override, next to the
/// app executable, then the dev-time src-tauri/bin/ copy.
pub fn bisond_path() -> Result<PathBuf, ClientError> {
    let name = if cfg!(windows) { "bisond.exe" } else { "bisond" };
    if let Ok(env) = std::env::var("BISOND_PATH") {
        let p = PathBuf::from(env);
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join(name);
            if p.exists() {
                return Ok(p);
            }
        }
    }
    let dev = PathBuf::from("bin").join(name);
    if dev.exists() {
        return Ok(dev);
    }
    Err(ClientError::Other(
        "bisond binary not found (set BISOND_PATH or run the copy-sidecar script)".into(),
    ))
}

/// Picks a free ephemeral port by binding to :0 and releasing it.
fn free_port() -> Result<u16, ClientError> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

/// Spawns bisond for `db_dir`, waits until it answers ping (~2s of retries),
/// and returns (child, connected client, port).
pub async fn start_local(db_dir: &str) -> Result<(Child, BisonConnection, u16), ClientError> {
    let binary = bisond_path()?;
    let port = free_port()?;
    let child = Command::new(&binary)
        .args(["--dir", db_dir, "--port", &port.to_string(), "--quiet"])
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| ClientError::Other(format!("cannot start {}: {e}", binary.display())))?;

    let mut last = String::from("no attempts");
    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        match BisonConnection::connect("127.0.0.1", port, Duration::from_millis(500)).await {
            Ok(mut conn) => match conn.command(bson::doc! {"cmd": "ping"}).await {
                Ok(_) => return Ok((child, conn, port)),
                Err(e) => last = e.to_string(),
            },
            Err(e) => last = e.to_string(),
        }
    }
    Err(ClientError::Other(format!("local bisond did not become ready: {last}")))
}

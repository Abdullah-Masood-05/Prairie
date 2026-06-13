//! Local bisond lifecycle: spawn the bundled server on a free port for
//! "open local database", kill it on disconnect / app exit.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tokio::process::{Child, Command};

use crate::client::{BisonConnection, ClientError};

/// Tracks spawned bisond children. A std (not tokio) Mutex so the kill path
/// also works synchronously from the tauri RunEvent::Exit handler — that is
/// what reaps sidecars when the window is closed.
#[derive(Default)]
pub struct SidecarManager {
    children: Mutex<HashMap<u64, Child>>,
}

impl SidecarManager {
    pub fn track(&self, conn_id: u64, child: Child) {
        self.children.lock().unwrap().insert(conn_id, child);
    }

    pub fn kill(&self, conn_id: u64) {
        if let Some(mut child) = self.children.lock().unwrap().remove(&conn_id) {
            let _ = child.start_kill();
        }
    }

    /// Kills every tracked sidecar; called on app exit.
    pub fn kill_all(&self) {
        let mut children = self.children.lock().unwrap();
        for (_, child) in children.iter_mut() {
            let _ = child.start_kill();
        }
        children.clear();
    }
}

/// Finds the bundled bisond binary across dev and bundled layouts. Order:
/// BISOND_PATH override → Tauri resource dir (production, `bin/*` resource) →
/// paths derived from the running executable (dev: the exe is at
/// `src-tauri/target/<profile>/`, so `../../bin/` reaches `src-tauri/bin/`) →
/// working-directory fallbacks.
pub fn bisond_path(app: &tauri::AppHandle) -> Result<PathBuf, ClientError> {
    use tauri::Manager;

    let name = if cfg!(windows) { "bisond.exe" } else { "bisond" };
    let mut tried: Vec<PathBuf> = Vec::new();
    let check = |p: PathBuf, tried: &mut Vec<PathBuf>| -> Option<PathBuf> {
        if p.exists() {
            Some(p)
        } else {
            tried.push(p);
            None
        }
    };

    if let Ok(env) = std::env::var("BISOND_PATH") {
        if let Some(p) = check(PathBuf::from(env), &mut tried) {
            return Ok(p);
        }
    }

    // Production: declared as a `bin/*` resource in tauri.conf.json.
    if let Ok(res) = app.path().resource_dir() {
        for cand in [res.join("bin").join(name), res.join(name)] {
            if let Some(p) = check(cand, &mut tried) {
                return Ok(p);
            }
        }
    }

    // Relative to the running executable.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for cand in [
                dir.join(name),                       // flat bundle: next to the exe
                dir.join("bin").join(name),           // bin/ beside the exe
                dir.join("../../bin").join(name),     // dev: target/<profile>/ → src-tauri/bin
                dir.join("../../../bin").join(name),  // dev safety net for deeper nesting
            ] {
                if let Some(p) = check(cand, &mut tried) {
                    return Ok(p);
                }
            }
        }
    }

    // Working-directory fallbacks (covers `tauri dev` cwd = project root).
    for cand in [
        PathBuf::from("bin").join(name),
        PathBuf::from("src-tauri").join("bin").join(name),
    ] {
        if let Some(p) = check(cand, &mut tried) {
            return Ok(p);
        }
    }

    let searched = tried
        .iter()
        .map(|p| p.display().to_string())
        .collect::<Vec<_>>()
        .join("\n  ");
    Err(ClientError::Other(format!(
        "bisond binary not found. Set BISOND_PATH, or run `bun run copy-sidecar`. Searched:\n  {searched}"
    )))
}

/// Picks a free ephemeral port by binding to :0 and releasing it.
fn free_port() -> Result<u16, ClientError> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

/// Spawns bisond for `db_dir`, waits until it answers ping (~2s of retries),
/// and returns (child, connected client, port).
pub async fn start_local(
    app: &tauri::AppHandle,
    db_dir: &str,
) -> Result<(Child, BisonConnection, u16), ClientError> {
    let binary = bisond_path(app)?;
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

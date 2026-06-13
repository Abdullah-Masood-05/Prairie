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
//! #[tauri::command] surface. bson::Document <-> serde_json via relaxed
//! Extended JSON, so the frontend consistently sees {"$oid": ...} shapes.

use bson::{doc, Bson, Document};
use serde::Serialize;
use tauri::{Emitter, State};

use crate::client::{BisonConnection, ClientError, ConnectionManager};
use crate::convert;
use crate::sidecar::{self, SidecarManager};

type CmdResult<T> = Result<T, String>;

fn err(e: ClientError) -> String {
    e.to_string()
}

fn parse_filter(filter_json: &str) -> Result<Document, String> {
    let json: serde_json::Value =
        serde_json::from_str(filter_json).map_err(|e| format!("invalid filter JSON: {e}"))?;
    convert::json_to_doc(json).map_err(err)
}

fn doc_to_json(d: &Document) -> serde_json::Value {
    Bson::Document(d.clone()).into_relaxed_extjson()
}

/// Wire-protocol revision this build of Prairie speaks.
pub const SUPPORTED_PROTOCOL: i32 = 1;

#[derive(Serialize)]
pub struct ConnectionInfo {
    pub conn_id: u64,
    pub label: String,
    pub server_version: String,
    pub local: bool,
    pub protocol_version: i32,
    pub protocol_supported: bool,
}

async fn describe(conn: &mut BisonConnection) -> Result<(String, i32), ClientError> {
    let status = conn.command(doc! {"cmd": "serverStatus"}).await?;
    let version = status.get_str("version").unwrap_or("?").to_string();
    // Servers older than BisonDB 1.0.0 do not report protocolVersion.
    let protocol = status.get_i32("protocolVersion").unwrap_or(0);
    Ok((version, protocol))
}

#[tauri::command]
pub async fn connect_remote(
    host: String,
    port: u16,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<ConnectionInfo> {
    let mut conn = BisonConnection::connect(&host, port, std::time::Duration::from_secs(5))
        .await
        .map_err(err)?;
    let (server_version, protocol_version) = describe(&mut conn).await.map_err(err)?;
    let label = format!("{host}:{port}");
    let conn_id = manager.register(conn).await;
    Ok(ConnectionInfo {
        conn_id,
        label,
        server_version,
        local: false,
        protocol_version,
        protocol_supported: protocol_version == SUPPORTED_PROTOCOL,
    })
}

#[tauri::command]
pub async fn open_local(
    app: tauri::AppHandle,
    path: String,
    create_if_missing: bool,
    manager: State<'_, ConnectionManager>,
    sidecars: State<'_, SidecarManager>,
) -> CmdResult<ConnectionInfo> {
    if !std::path::Path::new(&path).exists() {
        if create_if_missing {
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        } else {
            return Err(format!("database folder does not exist: {path}"));
        }
    }
    let (child, mut conn, _port) = sidecar::start_local(&app, &path).await.map_err(err)?;
    let (server_version, protocol_version) = describe(&mut conn).await.map_err(err)?;
    let conn_id = manager.register(conn).await;
    sidecars.track(conn_id, child);
    Ok(ConnectionInfo {
        conn_id,
        label: path,
        server_version,
        local: true,
        protocol_version,
        protocol_supported: protocol_version == SUPPORTED_PROTOCOL,
    })
}

#[tauri::command]
pub async fn disconnect(
    conn_id: u64,
    manager: State<'_, ConnectionManager>,
    sidecars: State<'_, SidecarManager>,
) -> CmdResult<()> {
    manager.remove(conn_id).await;
    sidecars.kill(conn_id);
    Ok(())
}

// ---- recent-connections persistence (tauri appData, not localStorage) -----

fn recents_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("recent-connections.json"))
}

#[tauri::command]
pub async fn load_recents(app: tauri::AppHandle) -> CmdResult<serde_json::Value> {
    let path = recents_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::Value::Array(vec![]));
    }
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_recents(app: tauri::AppHandle, recents: serde_json::Value) -> CmdResult<()> {
    let path = recents_path(&app)?;
    std::fs::write(path, serde_json::to_string_pretty(&recents).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_collections(
    conn_id: u64,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<Vec<String>> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp =
        conn.lock().await.command(doc! {"cmd": "listCollections"}).await.map_err(err)?;
    Ok(resp
        .get_array("collections")
        .map(|a| a.iter().filter_map(|b| b.as_str().map(String::from)).collect())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn db_stats(
    conn_id: u64,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<serde_json::Value> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn.lock().await.command(doc! {"cmd": "dbStats"}).await.map_err(err)?;
    Ok(doc_to_json(&resp))
}

#[tauri::command]
pub async fn create_collection(
    conn_id: u64,
    name: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<bool> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "createCollection", "coll": name})
        .await
        .map_err(err)?;
    Ok(resp.get_bool("created").unwrap_or(false))
}

#[tauri::command]
pub async fn drop_collection(
    conn_id: u64,
    name: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<bool> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "dropCollection", "coll": name})
        .await
        .map_err(err)?;
    Ok(resp.get_bool("dropped").unwrap_or(false))
}

#[derive(Serialize)]
pub struct FindResult {
    pub docs: Vec<serde_json::Value>,
    pub count: usize,
    pub ms: f64,
}

#[tauri::command]
pub async fn find(
    conn_id: u64,
    coll: String,
    filter_json: String,
    limit: usize,
    skip: usize,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<FindResult> {
    let filter = parse_filter(&filter_json)?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let begun = std::time::Instant::now();
    let docs = conn.lock().await.find(&coll, filter, limit, skip).await.map_err(err)?;
    let ms = begun.elapsed().as_secs_f64() * 1000.0;
    Ok(FindResult {
        count: docs.len(),
        docs: docs.iter().map(doc_to_json).collect(),
        ms,
    })
}

#[tauri::command]
pub async fn count(
    conn_id: u64,
    coll: String,
    filter_json: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<i64> {
    let filter = parse_filter(&filter_json)?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "explain", "coll": coll, "filter": filter})
        .await
        .map_err(err)?;
    Ok(resp
        .get_document("plan")
        .ok()
        .and_then(|p| p.get_i64("docsReturned").ok())
        .unwrap_or(0))
}

#[tauri::command]
pub async fn insert(
    conn_id: u64,
    coll: String,
    docs_json: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<Vec<String>> {
    let json: serde_json::Value =
        serde_json::from_str(&docs_json).map_err(|e| format!("invalid JSON: {e}"))?;
    let docs: Vec<Document> = match json {
        serde_json::Value::Array(items) => items
            .into_iter()
            .map(convert::json_to_doc)
            .collect::<Result<_, _>>()
            .map_err(err)?,
        other => vec![convert::json_to_doc(other).map_err(err)?],
    };
    let array: Vec<Bson> = docs.into_iter().map(Bson::Document).collect();
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "insert", "coll": coll, "documents": array})
        .await
        .map_err(err)?;
    Ok(resp
        .get_array("insertedIds")
        .map(|a| {
            a.iter()
                .filter_map(|b| match b {
                    Bson::ObjectId(oid) => Some(oid.to_hex()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn update_one(
    conn_id: u64,
    coll: String,
    filter_json: String,
    set_json: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<bool> {
    let filter = parse_filter(&filter_json)?;
    let set = parse_filter(&set_json)?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "updateOne", "coll": coll, "filter": filter,
                       "update": {"$set": set}})
        .await
        .map_err(err)?;
    Ok(resp.get_bool("matched").unwrap_or(false))
}

#[tauri::command]
pub async fn delete_many(
    conn_id: u64,
    coll: String,
    filter_json: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<i64> {
    let filter = parse_filter(&filter_json)?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "deleteMany", "coll": coll, "filter": filter})
        .await
        .map_err(err)?;
    Ok(resp.get_i64("deletedCount").unwrap_or(0))
}

#[tauri::command]
pub async fn delete_by_id(
    conn_id: u64,
    coll: String,
    oid_hex: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<i64> {
    let oid = bson::oid::ObjectId::parse_str(&oid_hex)
        .map_err(|e| format!("invalid ObjectId: {e}"))?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "deleteMany", "coll": coll, "filter": {"_id": oid}})
        .await
        .map_err(err)?;
    Ok(resp.get_i64("deletedCount").unwrap_or(0))
}

#[tauri::command]
pub async fn create_index(
    conn_id: u64,
    coll: String,
    field: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<i64> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "createIndex", "coll": coll, "field": field})
        .await
        .map_err(err)?;
    Ok(resp.get_i64("docsIndexed").unwrap_or(0))
}

#[tauri::command]
pub async fn drop_index(
    conn_id: u64,
    coll: String,
    field: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<()> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    conn.lock()
        .await
        .command(doc! {"cmd": "dropIndex", "coll": coll, "field": field})
        .await
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub async fn list_indexes(
    conn_id: u64,
    coll: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<Vec<String>> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn
        .lock()
        .await
        .command(doc! {"cmd": "listIndexes", "coll": coll})
        .await
        .map_err(err)?;
    Ok(resp
        .get_array("indexes")
        .map(|a| a.iter().filter_map(|b| b.as_str().map(String::from)).collect())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn explain(
    conn_id: u64,
    coll: String,
    filter_json: String,
    limit: usize,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<serde_json::Value> {
    let filter = parse_filter(&filter_json)?;
    let mut req = doc! {"cmd": "explain", "coll": coll, "filter": filter};
    if limit != 0 {
        req.insert("limit", limit as i64);
    }
    let conn = manager.get(conn_id).await.map_err(err)?;
    let resp = conn.lock().await.command(req).await.map_err(err)?;
    Ok(resp.get_document("plan").map(doc_to_json).unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
pub async fn compact(
    conn_id: u64,
    coll: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<()> {
    let conn = manager.get(conn_id).await.map_err(err)?;
    conn.lock()
        .await
        .command(doc! {"cmd": "compact", "coll": coll})
        .await
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub async fn import_file(
    app: tauri::AppHandle,
    conn_id: u64,
    coll: String,
    path: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<convert::ImportSummary> {
    let docs = convert::read_documents(std::path::Path::new(&path)).map_err(err)?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let mut guard = conn.lock().await;
    let summary = convert::import_documents(&mut guard, &coll, docs, |done, total| {
        let _ = app.emit("import-progress", serde_json::json!({"done": done, "total": total}));
    })
    .await
    .map_err(err)?;
    Ok(summary)
}

#[tauri::command]
pub async fn export_file(
    conn_id: u64,
    coll: String,
    filter_json: String,
    path: String,
    format: String,
    manager: State<'_, ConnectionManager>,
) -> CmdResult<usize> {
    let filter = parse_filter(&filter_json)?;
    let conn = manager.get(conn_id).await.map_err(err)?;
    let docs = conn.lock().await.find(&coll, filter, 0, 0).await.map_err(err)?;
    convert::write_documents(std::path::Path::new(&path), &docs, &format).map_err(err)?;
    Ok(docs.len())
}

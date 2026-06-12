pub mod client;
pub mod commands;
pub mod convert;
pub mod sidecar;

use client::ConnectionManager;
use sidecar::SidecarManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ConnectionManager::default())
        .manage(SidecarManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::connect_remote,
            commands::open_local,
            commands::disconnect,
            commands::list_collections,
            commands::db_stats,
            commands::create_collection,
            commands::drop_collection,
            commands::find,
            commands::count,
            commands::insert,
            commands::update_one,
            commands::delete_many,
            commands::delete_by_id,
            commands::create_index,
            commands::drop_index,
            commands::list_indexes,
            commands::explain,
            commands::compact,
            commands::import_file,
            commands::export_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prairie");
}

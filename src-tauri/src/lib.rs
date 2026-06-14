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
            commands::load_recents,
            commands::save_recents,
            commands::authenticate,
            commands::bootstrap_admin,
            commands::logout,
            commands::create_user,
            commands::drop_user,
            commands::change_password,
            commands::list_users,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Prairie")
        .run(|app, event| {
            // Window-close ends up here as Exit: reap every bisond sidecar so
            // closing the app never leaks server processes.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                app.state::<SidecarManager>().kill_all();
            }
        });
}

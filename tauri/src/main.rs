// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Not on mobile, which starts from lib.rs, though cargo still builds this bin there
    #[cfg(desktop)]
    app_lib::run(tauri::generate_context!());
}

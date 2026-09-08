mod reference_webview;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(reference_webview::ReferenceState::default())
        .invoke_handler(tauri::generate_handler![
            reference_webview::sync_reference_webview
        ])
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

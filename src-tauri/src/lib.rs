mod reference_webview;
mod openai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(reference_webview::ReferenceState::default())
        .manage(openai::StreamState::default())
        .invoke_handler(tauri::generate_handler![
            reference_webview::sync_reference_webview,
            reference_webview::reference_browser_action,
            openai::has_openai_key,
            openai::set_openai_key,
            openai::delete_openai_key,
            openai::stream_openai_chat,
            openai::cancel_openai_stream
        ])
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

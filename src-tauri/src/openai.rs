use futures_util::{future::{select, Either}, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, time::{Duration, Instant}};
use tauri::{ipc::Channel, Manager, Webview};

const SERVICE: &str = "io.github.dendencat.shakyo";
const ACCOUNT: &str = "openai-api-key";
const ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

#[derive(Default)]
pub struct StreamState(Mutex<HashMap<String, Arc<CancelToken>>>);

struct CancelToken { flag: AtomicBool, started: AtomicBool, notify: tokio::sync::Notify, created: Instant }
impl CancelToken {
    fn new() -> Self { Self { flag: AtomicBool::new(false), started: AtomicBool::new(false), notify: tokio::sync::Notify::new(), created: Instant::now() } }
    fn cancel(&self) { self.flag.store(true, Ordering::Relaxed); self.notify.notify_one(); }
    fn cancelled(&self) -> bool { self.flag.load(Ordering::Relaxed) }
}

#[derive(Deserialize, Serialize)]
pub struct Message { role: String, content: String }

#[derive(Clone, Serialize)]
#[serde(tag = "kind", content = "text", rename_all = "lowercase")]
pub enum StreamEvent { Delta(String), Done, Error(String) }

fn authorized(view: &Webview) -> Result<(), String> {
    if view.label() != "main" || view.window().label() != "main" {
        return Err("この操作はメイン画面からのみ利用できます。".into());
    }
    let url = view.url().map_err(|_| "呼び出し元を確認できませんでした。")?;
    let dev = view.config().build.dev_url.as_ref();
    if !((cfg!(debug_assertions) && dev.is_some_and(|v| url.origin() == v.origin()))
        || (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost") && url.port().is_none())) {
        return Err("この操作はアプリ画面からのみ利用できます。".into());
    }
    Ok(())
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| "OSの資格情報ストアを利用できません。".into())
}

async fn stored_key() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        match entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("OSの資格情報ストアを読み取れません。".into()),
        }
    }).await.map_err(|_| "資格情報を読み取れません。".to_string())?
}

#[tauri::command]
pub async fn has_openai_key(view: Webview) -> Result<bool, String> {
    authorized(&view)?;
    Ok(stored_key().await?.is_some())
}

#[tauri::command]
pub async fn set_openai_key(view: Webview, key: String) -> Result<(), String> {
    authorized(&view)?;
    if key.len() > 1024 || key.trim().is_empty() || key.contains(['\n', '\r']) {
        return Err("APIキーの形式を確認してください。".into());
    }
    tauri::async_runtime::spawn_blocking(move || entry()?.set_password(&key).map_err(|_| "APIキーを保存できませんでした。".to_string()))
        .await.map_err(|_| "APIキーを保存できませんでした。".to_string())?
}

#[tauri::command]
pub async fn delete_openai_key(view: Webview) -> Result<(), String> {
    authorized(&view)?;
    tauri::async_runtime::spawn_blocking(|| match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("APIキーを削除できませんでした。".to_string()),
    }).await.map_err(|_| "APIキーを削除できませんでした。".to_string())?
}

#[tauri::command]
pub async fn cancel_openai_stream(view: Webview, state: tauri::State<'_, StreamState>, id: String) -> Result<(), String> {
    authorized(&view)?;
    if id.len() != 36 || !id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') { return Err("リクエストIDが正しくありません。".into()); }
    let mut streams = state.0.lock().map_err(|_| "状態を取得できません。")?;
    streams.retain(|_, token| token.started.load(Ordering::Relaxed) || token.created.elapsed() < Duration::from_secs(120));
    if streams.len() >= 8 && !streams.contains_key(&id) { return Err("同時に実行できる解説の上限に達しました。".into()); }
    streams.entry(id).or_insert_with(|| Arc::new(CancelToken::new())).cancel();
    Ok(())
}

#[tauri::command]
pub async fn stream_openai_chat(
    view: Webview, state: tauri::State<'_, StreamState>, id: String,
    model: String, messages: Vec<Message>, reasoning_effort: String,
    on_event: Channel<StreamEvent>,
) -> Result<(), String> {
    authorized(&view)?;
    validate(&id, &model, &messages, &reasoning_effort)?;
    let cancelled = {
        let mut streams = state.0.lock().map_err(|_| "状態を取得できません。")?;
        streams.retain(|_, token| token.started.load(Ordering::Relaxed) || token.created.elapsed() < Duration::from_secs(120));
        if streams.len() >= 4 && !streams.contains_key(&id) { return Err("同時に実行できる解説の上限に達しました。".into()); }
        streams.entry(id.clone()).or_insert_with(|| Arc::new(CancelToken::new())).clone()
    };
    if cancelled.started.swap(true, Ordering::Relaxed) { return Err("リクエストIDが重複しています。".into()); }
    let result = match stored_key().await {
        Ok(Some(key)) if !cancelled.cancelled() =>
            send_stream(&key, &model, &messages, &reasoning_effort, &on_event, &cancelled).await,
        Ok(Some(_)) => Ok(()),
        Ok(None) => Err("OpenAI APIキーが未設定です。".into()),
        Err(message) => Err(message),
    };
    state.0.lock().map_err(|_| "状態を取得できません。")?.remove(&id);
    match result {
        Ok(()) => { let _ = on_event.send(StreamEvent::Done); }
        Err(message) => { let _ = on_event.send(StreamEvent::Error(message)); }
    }
    Ok(())
}

fn validate(id: &str, model: &str, messages: &[Message], effort: &str) -> Result<(), String> {
    if id.len() != 36 || !id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') { return Err("リクエストIDが正しくありません。".into()); }
    if !["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-6-astra"].contains(&model) {
        return Err("選択したモデルは利用できません。".into());
    }
    if !["none", "low", "medium", "high", "xhigh", "max"].contains(&effort) { return Err("解説の深さが正しくありません。".into()); }
    if messages.is_empty() || messages.len() > 32 || messages.iter().any(|m| !["system", "user", "assistant"].contains(&m.role.as_str()) || m.content.len() > 100_000)
        || messages.iter().map(|m| m.content.len()).sum::<usize>() > 200_000 {
        return Err("解説の入力が長すぎるか正しくありません。".into());
    }
    Ok(())
}

async fn send_stream(key: &str, model: &str, messages: &[Message], effort: &str, channel: &Channel<StreamEvent>, cancelled: &CancelToken) -> Result<(), String> {
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(15))
        .build().map_err(|_| "通信を開始できませんでした。")?;
    let mut include_effort = true;
    let response = loop {
        let mut body = serde_json::json!({"model": model, "messages": messages, "stream": true});
        if include_effort { body["reasoning_effort"] = serde_json::json!(effort); }
        let notified = cancelled.notify.notified();
        if cancelled.cancelled() { return Ok(()); }
        let request = tokio::time::timeout(Duration::from_secs(15), client.post(ENDPOINT).bearer_auth(key).json(&body).send());
        futures_util::pin_mut!(notified, request);
        let response = match select(notified, request).await {
            Either::Left(_) => return Ok(()),
            Either::Right((response, _)) => response.map_err(|_| "接続がタイムアウトしました。".to_string())?.map_err(|_| "OpenAI APIに接続できませんでした。")?,
        };
        if response.status().as_u16() == 400 && include_effort {
            let Some(text) = read_bounded_error_body(response.bytes_stream(), cancelled, Duration::from_secs(15)).await? else {
                return Ok(());
            };
            if text.contains("reasoning_effort") { include_effort = false; continue; }
            return Err("OpenAI APIエラー（HTTP 400）。".into());
        }
        break response;
    };
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 => "APIキーが無効です。設定画面で確認してください。".into(),
            429 => "利用制限に達しました。しばらく待ってから再試行してください。".into(),
            status => format!("OpenAI APIエラー（HTTP {status}）。"),
        });
    }
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut output_bytes = 0usize;
    loop {
        let notified = cancelled.notify.notified();
        if cancelled.cancelled() { return Ok(()); }
        let receive = tokio::time::timeout(Duration::from_secs(60), stream.next());
        futures_util::pin_mut!(notified, receive);
        let chunk = match select(notified, receive).await {
            Either::Left(_) => return Ok(()),
            Either::Right((chunk, _)) => chunk.map_err(|_| "応答が途絶えたため中断しました。".to_string())?,
        };
        let Some(chunk) = chunk else { break; };
        let chunk = chunk.map_err(|_| "応答の受信に失敗しました。")?;
        buffer.extend_from_slice(&chunk);
        if buffer.len() > 1_000_000 { return Err("応答が大きすぎます。".into()); }
        for line in take_lines(&mut buffer) {
            let Some(data) = line.strip_prefix("data:") else { continue; };
            let data = data.trim();
            if data == "[DONE]" { return Ok(()); }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = value.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                    output_bytes += delta.len();
                    if output_bytes > 1_000_000 { return Err("応答が大きすぎます。".into()); }
                    channel.send(StreamEvent::Delta(delta.to_string())).map_err(|_| "解説画面を更新できませんでした。")?;
                }
            }
        }
    }
    Ok(())
}

// A failed API response can be arbitrarily large or never finish. Read only enough to
// identify the reasoning_effort rejection, under one deadline for the entire body.
async fn read_bounded_error_body<S, B, E>(stream: S, cancelled: &CancelToken, max_wait: Duration) -> Result<Option<String>, String>
where
    S: Stream<Item = Result<B, E>>,
    B: AsRef<[u8]>,
{
    futures_util::pin_mut!(stream);
    let deadline = tokio::time::Instant::now() + max_wait;
    let mut body = Vec::new();
    loop {
        let notified = cancelled.notify.notified();
        if cancelled.cancelled() { return Ok(None); }
        let receive = tokio::time::timeout_at(deadline, stream.next());
        futures_util::pin_mut!(notified, receive);
        let chunk = match select(notified, receive).await {
            Either::Left(_) => return Ok(None),
            Either::Right((chunk, _)) => chunk.map_err(|_| "APIエラー応答がタイムアウトしました。".to_string())?,
        };
        let Some(chunk) = chunk else { return Ok(Some(String::from_utf8_lossy(&body).into_owned())); };
        let chunk = chunk.map_err(|_| "APIエラー応答を読み取れませんでした。")?;
        if chunk.as_ref().len() > 16 * 1024 - body.len() {
            return Err("APIエラー応答が大きすぎます。".into());
        }
        body.extend_from_slice(chunk.as_ref());
    }
}

fn take_lines(buffer: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(pos) = buffer.iter().position(|byte| *byte == b'\n') {
        lines.push(String::from_utf8_lossy(&buffer[..pos]).trim_end_matches('\r').to_string());
        buffer.drain(..=pos);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_untrusted_requests() {
        let message = Message { role: "user".into(), content: "x".into() };
        assert!(validate("00000000-0000-0000-0000-000000000000", "gpt-5.6-luna", &[message], "none").is_ok());
        assert!(validate("bad", "gpt-5.6-luna", &[], "none").is_err());
        assert!(validate("00000000-0000-0000-0000-000000000000", "other", &[], "none").is_err());
    }
    #[test]
    fn waits_for_complete_utf8_sse_line() {
        let bytes = "data: 日本語\n".as_bytes();
        let split = 8; // inside the first Japanese UTF-8 character
        let mut buffer = bytes[..split].to_vec();
        assert!(take_lines(&mut buffer).is_empty());
        buffer.extend_from_slice(&bytes[split..]);
        assert_eq!(take_lines(&mut buffer), vec!["data: 日本語"]);
    }
    #[test]
    fn cancellation_before_stream_wait_is_observed() {
        tauri::async_runtime::block_on(async {
            let token = CancelToken::new();
            token.cancel();
            assert!(token.cancelled());
            tokio::time::timeout(Duration::from_millis(10), token.notify.notified()).await.unwrap();
        });
    }
    #[test]
    fn error_body_is_bounded_and_cancelable() {
        tauri::async_runtime::block_on(async {
            let token = Arc::new(CancelToken::new());
            let large = futures_util::stream::iter(vec![Ok::<Vec<u8>, ()>(vec![b'x'; 16 * 1024 + 1])]);
            assert!(read_bounded_error_body(large, &token, Duration::from_secs(1)).await.unwrap_err().contains("大きすぎ"));

            let waiting = futures_util::stream::pending::<Result<Vec<u8>, ()>>();
            let cancel = token.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(1)).await;
                cancel.cancel();
            });
            assert!(read_bounded_error_body(waiting, &token, Duration::from_secs(1)).await.unwrap().is_none());

            let waiting = futures_util::stream::pending::<Result<Vec<u8>, ()>>();
            let fresh = CancelToken::new();
            assert!(read_bounded_error_body(waiting, &fresh, Duration::from_millis(1)).await.unwrap_err().contains("タイムアウト"));
        });
    }
}

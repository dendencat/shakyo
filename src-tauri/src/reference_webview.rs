use std::sync::Mutex;
use tauri::{
    webview::NewWindowResponse, Manager, PhysicalPosition, PhysicalSize, Rect, Url, Webview,
    WebviewBuilder, WebviewUrl,
};

const LABEL: &str = "web-reference";

#[derive(Default)]
pub struct ReferenceState(Mutex<Option<String>>);

#[derive(Clone, serde::Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Bounds {
    fn valid(&self) -> bool {
        [self.x, self.y, self.width, self.height]
            .iter()
            .all(|n| n.is_finite() && *n >= 0.0 && *n <= 100_000.0)
            && self.width >= 1.0
            && self.height >= 1.0
    }

    fn rect(&self) -> Rect {
        Rect {
            position: PhysicalPosition::new(self.x.round() as i32, self.y.round() as i32).into(),
            size: PhysicalSize::new(self.width.round() as u32, self.height.round() as u32).into(),
        }
    }
}

// GtkBox is Tauri's default parent on Linux. Wry captures whether its original
// parent was GtkFixed at creation, so reparenting alone cannot enable set_bounds.
// Use GTK's public layout API instead; Layout ignores child size requests when
// computing its own minimum size, allowing the app window to shrink again.
#[cfg(target_os = "linux")]
mod linux_layout {
    use super::*;
    use gtk::prelude::*;

    const NAME: &str = "shakyo-webview-layout";

    // Commands run off the event loop. Wait for each GTK callback to finish before
    // releasing ReferenceState, so later hide/close/recreate operations cannot
    // overtake an earlier attachment. Callbacks never acquire ReferenceState or
    // call blocking Tauri methods, and GTK objects never cross thread boundaries.
    fn on_gtk(
        view: &Webview,
        action: impl FnOnce(gtk::Widget) -> Result<(), String> + Send + 'static,
    ) -> Result<(), String> {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        view.with_webview(move |platform| {
            let _ = sender.send(action(platform.inner().upcast()));
        })
        .map_err(|_| "Web表示の配置を更新できませんでした。")?;
        receiver
            .recv()
            .map_err(|_| "Web表示の配置を更新できませんでした。")?
    }

    pub fn prepare(main: &Webview) -> Result<(), String> {
        on_gtk(main, |widget| {
            let parent = widget
                .parent()
                .ok_or("メイン画面の配置を取得できませんでした。")?;
            if parent.is::<gtk::Layout>() && parent.widget_name() == NAME {
                return Ok(());
            }
            let container = parent
                .downcast::<gtk::Box>()
                .map_err(|_| "メイン画面の配置に対応していません。")?;
            let allocation = container.allocation();
            let layout = gtk::Layout::new(gtk::Adjustment::NONE, gtk::Adjustment::NONE);
            layout.set_widget_name(NAME);
            layout.set_hexpand(true);
            layout.set_vexpand(true);
            let had_focus = widget.has_focus();
            container.remove(&widget);
            layout.put(&widget, 0, 0);
            container.pack_start(&layout, true, true, 0);
            let weak_main = widget.downgrade();
            layout.connect_size_allocate(move |layout, allocation| {
                if let Some(main) = weak_main.upgrade() {
                    fill_main(layout, &main, allocation.width(), allocation.height());
                }
            });
            fill_main(&layout, &widget, allocation.width(), allocation.height());
            layout.show();
            widget.show();
            if had_focus {
                widget.grab_focus();
            }
            Ok(())
        })
    }

    fn fill_main(layout: &gtk::Layout, main: &gtk::Widget, width: i32, height: i32) {
        let (width, height) = (width.max(1), height.max(1));
        layout.set_size(width as u32, height as u32);
        main.set_size_request(width, height);
        main.size_allocate(&gtk::Allocation::new(0, 0, width, height));
    }

    pub fn show_at(view: &Webview, bounds: &Bounds) -> Result<(), String> {
        let bounds = bounds.clone();
        on_gtk(view, move |widget| {
            let parent = widget
                .parent()
                .ok_or("Web表示の配置を取得できませんでした。")?;
            let layout = if let Ok(layout) = parent.clone().downcast::<gtk::Layout>() {
                layout
            } else {
                let container = parent
                    .downcast::<gtk::Box>()
                    .map_err(|_| "Web表示の配置に対応していません。")?;
                let layout = container
                    .children()
                    .into_iter()
                    .find(|child| child.widget_name() == NAME)
                    .and_then(|child| child.downcast::<gtk::Layout>().ok())
                    .ok_or("Web表示の配置を取得できませんでした。")?;
                widget.hide();
                container.remove(&widget);
                layout.put(&widget, 0, 0);
                layout
            };
            let rect = bounds.rect();
            // The frontend already includes page zoom/devicePixelRatio. GTK uses
            // logical pixels; divide only by the native widget's scale factor.
            let scale = widget.scale_factor() as f64;
            let position = rect.position.to_logical::<i32>(scale);
            let size = rect.size.to_logical::<i32>(scale);
            let (width, height) = (size.width.max(1), size.height.max(1));
            layout.move_(&widget, position.x, position.y);
            widget.set_size_request(width, height);
            widget.show();
            widget.size_allocate(&gtk::Allocation::new(position.x, position.y, width, height));
            Ok(())
        })
    }
}

enum RequestedView {
    Close,
    Hide,
    Show {
        raw_url: String,
        url: Url,
        bounds: Bounds,
    },
}

fn requested_view(url: Option<String>, bounds: Option<Bounds>) -> Result<RequestedView, String> {
    let Some(raw_url) = url else {
        return Ok(RequestedView::Close);
    };
    // Hiding must work even when the input currently contains an invalid URL.
    let Some(bounds) = bounds else {
        return Ok(RequestedView::Hide);
    };
    let parsed = Url::parse(&raw_url).map_err(|_| "URLが正しくありません。")?;
    if !allowed_url(&parsed) {
        return Err(
            "公開されたHTTP(S)のURLを指定してください。ローカルアプリのURLは表示できません。"
                .into(),
        );
    }
    if !bounds.valid() {
        return Err("Web表示のサイズが正しくありません。".into());
    }
    Ok(RequestedView::Show {
        raw_url,
        url: parsed,
        bounds,
    })
}

// Never navigate the untrusted view to app assets, the dev server, or IPC origins.
fn allowed_url(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_end_matches('.');
    !matches!(
        host,
        "localhost" | "tauri.localhost" | "ipc.localhost" | "[::1]" | "0.0.0.0"
    ) && !host.ends_with(".localhost")
        && !host.starts_with("127.")
}

// Async commands run off the event loop: add_child blocks waiting for the main thread.
// Only the trusted app webview can reach this fixed-purpose command. A window check
// alone would also authorize remote children hosted in that same window.
#[tauri::command]
pub async fn sync_reference_webview(
    webview: Webview,
    state: tauri::State<'_, ReferenceState>,
    url: Option<String>,
    bounds: Option<Bounds>,
) -> Result<(), String> {
    if webview.label() != "main" || webview.window().label() != "main" {
        return Err("この操作はメイン画面からのみ利用できます。".into());
    }
    let caller_url = webview
        .url()
        .map_err(|_| "呼び出し元を確認できませんでした。")?;
    let dev_url = webview.config().build.dev_url.as_ref();
    if !trusted_app_url(&caller_url, dev_url) {
        return Err("この操作はアプリ画面からのみ利用できます。".into());
    }
    let mut current = state
        .0
        .lock()
        .map_err(|_| "Web表示の状態を取得できませんでした。")?;
    let window = webview.window();
    let existing = window.get_webview(LABEL);
    let request = requested_view(url, bounds).inspect_err(|_| {
        // An old remote surface must not obscure validation errors or dialogs.
        if let Some(view) = &existing {
            let _ = view.hide();
        }
    })?;
    let RequestedView::Show {
        raw_url,
        url: parsed,
        bounds,
    } = request
    else {
        if let Some(view) = existing {
            match request {
                RequestedView::Close => view
                    .close()
                    .map_err(|_| "Web表示を終了できませんでした。")?,
                _ => view.hide().map_err(|_| "Web表示を隠せませんでした。")?,
            }
        }
        if matches!(request, RequestedView::Close) {
            *current = None;
        }
        return Ok(());
    };
    let view = if let Some(view) = existing {
        if current.as_deref() != Some(&raw_url) {
            view.navigate(parsed)
                .map_err(|_| "Webページを開けませんでした。")?;
            *current = Some(raw_url);
        }
        view
    } else {
        #[cfg(target_os = "linux")]
        linux_layout::prepare(&webview)?;
        #[cfg(not(target_os = "linux"))]
        webview
            .set_auto_resize(true)
            .map_err(|_| "メイン画面のサイズを設定できませんでした。")?;
        let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(parsed))
            .incognito(true)
            .focused(false)
            .on_navigation(allowed_url)
            .on_new_window(|_, _| NewWindowResponse::Deny);
        // Supported platforms start offscreen; Linux uses the GTK adapter below.
        let view = window
            .add_child(
                builder,
                PhysicalPosition::new(-10000, -10000),
                PhysicalSize::new(1, 1),
            )
            .map_err(|_| {
                "内蔵Web表示を作成できませんでした。再試行するか、外部ブラウザで開いてください。"
            })?;
        *current = Some(raw_url);
        view
    };
    #[cfg(target_os = "linux")]
    let positioned = linux_layout::show_at(&view, &bounds);
    #[cfg(not(target_os = "linux"))]
    let positioned = view.set_bounds(bounds.rect()).and_then(|_| view.show());
    if positioned.is_err() {
        let _ = view.hide();
        return Err("Web表示の位置を更新できませんでした。再試行してください。".into());
    }
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserAction {
    Back,
    Forward,
    Reload,
    Location,
    Navigate,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserLocation {
    requested_url: Option<String>,
    url: Option<String>,
}

#[tauri::command]
pub async fn reference_browser_action(
    webview: Webview,
    state: tauri::State<'_, ReferenceState>,
    action: BrowserAction,
    url: Option<String>,
) -> Result<BrowserLocation, String> {
    if webview.label() != "main" || webview.window().label() != "main" {
        return Err("この操作はメイン画面からのみ利用できます。".into());
    }
    let caller = webview
        .url()
        .map_err(|_| "呼び出し元を確認できませんでした。")?;
    if !trusted_app_url(&caller, webview.config().build.dev_url.as_ref()) {
        return Err("この操作はアプリ画面からのみ利用できます。".into());
    }
    let mut current = state
        .0
        .lock()
        .map_err(|_| "Web表示の状態を取得できませんでした。")?;
    let Some(view) = webview.window().get_webview(LABEL) else {
        return Ok(BrowserLocation {
            requested_url: current.clone(),
            url: None,
        });
    };
    // Fixed scripts only: never interpolate page URLs or other untrusted data.
    match action {
        BrowserAction::Back => view.eval("history.back()"),
        BrowserAction::Forward => view.eval("history.forward()"),
        BrowserAction::Reload => view.reload(),
        BrowserAction::Location => Ok(()),
        BrowserAction::Navigate => {
            let raw = url.ok_or("URLを指定してください。")?;
            let parsed = Url::parse(&raw).map_err(|_| "URLが正しくありません。")?;
            if !allowed_url(&parsed) {
                return Err("このURLは表示できません。".into());
            }
            view.navigate(parsed)
                .map_err(|_| "ページを開けませんでした。")?;
            *current = Some(raw);
            Ok(())
        }
    }
    .map_err(|_| "ページを操作できませんでした。")?;
    let url = view
        .url()
        .map_err(|_| "現在のURLを取得できませんでした。")?;
    Ok(BrowserLocation {
        requested_url: current.clone(),
        url: allowed_url(&url).then(|| url.to_string()),
    })
}

fn trusted_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    (cfg!(debug_assertions) && dev_url.is_some_and(|dev| url.origin() == dev.origin()))
        || (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https")
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hide_and_close_do_not_depend_on_url_validity() {
        for url in ["http://localhost:1420", "not a URL", "https://example.com"] {
            assert!(matches!(
                requested_view(Some(url.into()), None),
                Ok(RequestedView::Hide)
            ));
            let shown = requested_view(
                Some(url.into()),
                Some(Bounds {
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 100.0,
                }),
            );
            assert_eq!(shown.is_ok(), url == "https://example.com");
        }
        assert!(matches!(
            requested_view(None, None),
            Ok(RequestedView::Close)
        ));
    }

    #[test]
    fn physical_bounds_convert_to_native_logical_pixels_once() {
        let rect = Bounds {
            x: 25.0,
            y: 51.0,
            width: 801.0,
            height: 401.0,
        }
        .rect();
        let position = rect.position.to_logical::<i32>(2.0);
        let size = rect.size.to_logical::<i32>(2.0);
        assert_eq!((position.x, position.y), (13, 26));
        assert_eq!((size.width, size.height), (401, 201));
        let size = rect.size.to_logical::<i32>(1.0);
        assert_eq!((size.width, size.height), (801, 401));
    }

    #[test]
    fn caller_origin_must_be_the_app() {
        let dev = Url::parse("http://localhost:1420").unwrap();
        for url in [
            "tauri://localhost/",
            "http://tauri.localhost/",
            "https://tauri.localhost/",
        ] {
            assert!(trusted_app_url(&Url::parse(url).unwrap(), Some(&dev)));
        }
        for url in [
            "https://example.com/",
            "http://localhost:9999",
            "https://tauri.localhost.evil.com",
            "file:///index.html",
        ] {
            assert!(!trusted_app_url(&Url::parse(url).unwrap(), Some(&dev)));
        }
        assert_eq!(trusted_app_url(&dev, Some(&dev)), cfg!(debug_assertions));
    }

    #[test]
    fn remote_navigation_is_http_only_and_cannot_reach_app_origins() {
        for url in ["https://github.com/", "http://example.com/article"] {
            assert!(allowed_url(&Url::parse(url).unwrap()));
        }
        for url in [
            "tauri://localhost",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,hi",
            "http://localhost:1420",
            "http://tauri.localhost",
            "http://ipc.localhost",
            "http://LOCALHOST.:1420",
            "http://127.0.0.1:1420",
            "http://[::1]:1420",
            "https://user:secret@example.com",
        ] {
            assert!(!allowed_url(&Url::parse(url).unwrap()), "{url}");
        }
    }

    #[test]
    fn invalid_bounds_are_rejected() {
        let good = Bounds {
            x: 10.0,
            y: 20.0,
            width: 600.0,
            height: 400.0,
        };
        assert!(good.valid());
        assert!(!Bounds {
            x: f64::NAN,
            ..good.clone()
        }
        .valid());
        assert!(!Bounds {
            width: 0.0,
            ..good.clone()
        }
        .valid());
        assert!(!Bounds {
            y: -1.0,
            ..good.clone()
        }
        .valid());
        assert!(!Bounds {
            height: f64::INFINITY,
            ..good
        }
        .valid());
    }
}

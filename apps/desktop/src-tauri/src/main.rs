#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod local_server;
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
static SETUP_BUSY: AtomicBool = AtomicBool::new(false);
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::menu::{Menu, SubmenuBuilder};
use tauri::webview::NewWindowResponse;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerConfig {
    url: String,
    #[serde(default)]
    allow_local_http: bool,
}
fn server_url(config: &ServerConfig) -> Result<Url, String> {
    let url = Url::parse(&config.url).map_err(|_| "Dirección de servidor no válida")?;
    let host = url.host_str().unwrap_or("");
    let local = host == "localhost"
        || host
            .parse::<std::net::Ipv4Addr>()
            .map(|ip| ip.is_private() || ip.is_loopback())
            .unwrap_or(false);
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || host.is_empty()
        || !(url.scheme() == "https"
            || (config.allow_local_http && local && url.scheme() == "http"))
    {
        return Err("Utiliza la raíz HTTPS del servidor; HTTP solo se permite explícitamente en la red local.".into());
    }
    Ok(url)
}
// WebKit checks the opener navigation policy before creating a blank document.
fn allows_document_navigation(url: &Url, origin: &url::Origin) -> bool {
    url.as_str() == "about:blank" || &url.origin() == origin
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![setup_action])
        .setup(|app| {
            let menu = Menu::default(app.handle())?;
            menu.append(
                &SubmenuBuilder::new(app.handle(), "CRM")
                    .text("crm-setup", "Conexión y servidor local")
                    .text("crm-reload", "Recargar")
                    .text("crm-print", "Imprimir / Guardar PDF")
                    .build()?,
            )?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "crm-setup" {
                    let _ = show_setup(app);
                    return;
                }
                if let Some(window) = app
                    .webview_windows()
                    .values()
                    .find(|w| w.is_focused().unwrap_or(false))
                {
                    match event.id().as_ref() {
                        "crm-reload" => {
                            let _ = window.reload();
                        }
                        "crm-print" => {
                            let _ = window.print();
                        }
                        _ => {}
                    }
                }
            });
            let path = app.path().app_config_dir()?.join("server.json");
            let raw = std::fs::read_to_string(&path)
                .ok()
                .or_else(|| option_env!("NEXO_DEFAULT_SERVER_JSON").map(String::from));
            let local = app
                .path()
                .app_config_dir()?
                .join("local-server/.env")
                .exists();
            if let Some(url) = raw
                .and_then(|value| serde_json::from_str::<ServerConfig>(&value).ok())
                .and_then(|config| server_url(&config).ok())
                .filter(|_| !local)
            {
                open_crm(app.handle(), url)?;
            } else {
                show_setup(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("No se pudo abrir NEXO CRM");
}

fn bundled_setup(label: &str, url: &Url) -> bool {
    label == "setup"
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (matches!(url.scheme(), "http" | "https")
                && url.host_str() == Some("tauri.localhost")))
}
fn show_setup(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window("setup") {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("index.html".into()))
        .title("Nexo · Conexión y servidor local")
        .inner_size(720.0, 780.0)
        .min_inner_size(380.0, 600.0)
        .on_navigation(|url| bundled_setup("setup", url))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    Ok(())
}
#[tauri::command]
async fn setup_action(
    window: tauri::WebviewWindow,
    action: String,
    password: Option<String>,
    url: Option<String>,
    allow_local_http: Option<bool>,
) -> Result<serde_json::Value, String> {
    if !bundled_setup(
        window.label(),
        &window.url().map_err(|_| "Origen no permitido")?,
    ) {
        return Err("Solo el asistente local puede gestionar Docker.".into());
    }
    if SETUP_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Hay una operación en curso. Espera a que termine.".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        struct Guard;
        impl Drop for Guard {
            fn drop(&mut self) {
                SETUP_BUSY.store(false, Ordering::SeqCst);
            }
        }
        let _guard = Guard;
        let app = window.app_handle();
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        let local = dir.join("local-server");
        let value = match action.as_str() {
            "status" => serde_json::to_value(local_server::status(&local)).unwrap(),
            "start" => {
                let state =
                    local_server::start(&local, password.as_deref().unwrap_or(""), |message| {
                        let _ = window.eval(&format!(
                            "receiveProgress({})",
                            serde_json::to_string(message).unwrap()
                        ));
                    })?;
                serde_json::to_value(state).unwrap()
            }
            "stop" => serde_json::to_value(local_server::stop(&local)?).unwrap(),
            "open-local" | "connect" => {
                let config = if action == "open-local" {
                    let state = local_server::status(&local);
                    if !state.ready {
                        return Err("Inicia primero tu servidor local.".into());
                    }
                    ServerConfig {
                        url: state.url,
                        allow_local_http: true,
                    }
                } else {
                    ServerConfig {
                        url: url.unwrap_or_default(),
                        allow_local_http: allow_local_http.unwrap_or(false),
                    }
                };
                let target = server_url(&config)?;
                if let Some(w) = app.get_webview_window("main") {
                    if w.url().map_err(|e| e.to_string())?.origin() != target.origin() {
                        return Err(
                            "Cierra la ventana del CRM antes de cambiar de servidor.".into()
                        );
                    }
                    w.set_focus().map_err(|e| e.to_string())?;
                } else {
                    open_crm(app, target).map_err(|e| e.to_string())?;
                }
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                std::fs::write(
                    dir.join("server.json"),
                    serde_json::to_vec(&config).unwrap(),
                )
                .map_err(|e| e.to_string())?;
                window.hide().map_err(|e| e.to_string())?;
                serde_json::json!({"opened":true})
            }
            _ => return Err("Operación no permitida".into()),
        };
        Ok(value)
    })
    .await
    .map_err(|_| "No se pudo completar la operación".to_string())?;
    result
}

fn open_crm(app: &tauri::AppHandle, url: Url) -> tauri::Result<()> {
    let origin = url.origin();
    let popup_origin = origin.clone();
    let handle = app.clone();
    let sequence = AtomicUsize::new(0);
    let print_handle = app.clone();
    let close_handle = app.clone();
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .user_agent("Mozilla/5.0 AppleWebKit/605.1.15 NexoDesktop/0.1")
        .title("NEXO CRM")
        .inner_size(1280.0, 850.0)
        .min_inner_size(360.0, 600.0)
        .on_navigation(move |url| {
            if url.origin() == origin && url.path() == "/__native/print" {
                if let Some(window) = print_handle.get_webview_window("main") {
                    if let Err(error) = window.print() {
                        eprintln!("No se pudo imprimir: {error}");
                    }
                }
                return false;
            }
            allows_document_navigation(url, &origin)
        })
        .on_new_window(move |url, features| {
            if !allows_document_navigation(&url, &popup_origin) {
                return NewWindowResponse::Deny;
            }
            let allowed = popup_origin.clone();
            let label = format!("document-{}", sequence.fetch_add(1, Ordering::Relaxed));
            let window = WebviewWindowBuilder::new(
                &handle,
                label,
                WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .window_features(features)
            .title("Documento · NEXO CRM")
            .on_navigation(move |url| allows_document_navigation(url, &allowed))
            .on_new_window(|_, _| NewWindowResponse::Deny)
            .build();
            match window {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    eprintln!("No se pudo abrir el documento: {error}");
                    NewWindowResponse::Deny
                }
            }
        })
        .build()?;
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = show_setup(&close_handle);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn document_navigation_boundaries() {
        let origin = Url::parse("http://localhost:8080/").unwrap().origin();
        for value in ["about:blank", "http://localhost:8080/presupuestos"] {
            assert!(allows_document_navigation(
                &Url::parse(value).unwrap(),
                &origin
            ));
        }
        for value in [
            "https://example.com",
            "http://localhost:8081/",
            "file:///etc/passwd",
            "data:text/html,test",
            "about:config",
        ] {
            assert!(!allows_document_navigation(
                &Url::parse(value).unwrap(),
                &origin
            ));
        }
    }

    #[test]
    fn setup_is_never_remote() {
        assert!(bundled_setup(
            "setup",
            &Url::parse("tauri://localhost/index.html").unwrap()
        ));
        assert!(!bundled_setup(
            "main",
            &Url::parse("tauri://localhost/index.html").unwrap()
        ));
        for url in [
            "https://crm.example.com",
            "http://localhost:8180",
            "https://tauri.localhost.evil.com",
        ] {
            assert!(!bundled_setup("setup", &Url::parse(url).unwrap()));
        }
    }
    #[test]
    fn server_boundaries() {
        for url in ["https://crm.example.com", "https://192.168.0.10:8443"] {
            assert!(server_url(&ServerConfig {
                url: url.into(),
                allow_local_http: false
            })
            .is_ok());
        }
        for url in [
            "http://example.com",
            "https://user:pass@example.com",
            "file:///etc/passwd",
            "https://example.com/?token=x",
        ] {
            assert!(server_url(&ServerConfig {
                url: url.into(),
                allow_local_http: true
            })
            .is_err());
        }
        assert!(server_url(&ServerConfig {
            url: "http://localhost:8080".into(),
            allow_local_http: true
        })
        .is_ok());
        assert!(server_url(&ServerConfig {
            url: "http://localhost:8080".into(),
            allow_local_http: false
        })
        .is_err());
    }
}

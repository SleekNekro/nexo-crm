#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::{Deserialize, Serialize};
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
        .setup(|app| {
            let menu = Menu::default(app.handle())?;
            menu.append(
                &SubmenuBuilder::new(app.handle(), "CRM")
                    .text("crm-reload", "Recargar")
                    .text("crm-print", "Imprimir / Guardar PDF")
                    .build()?,
            )?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
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
            if let Some(url) = raw
                .and_then(|value| serde_json::from_str::<ServerConfig>(&value).ok())
                .and_then(|config| server_url(&config).ok())
            {
                open_crm(app.handle(), url)?;
            } else {
                let handle = app.handle().clone();
                WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("index.html".into()))
                    .title("Conectar · NEXO CRM Beta")
                    .inner_size(620.0, 580.0)
                    .on_navigation(move |url| {
                        if url.scheme() != "nexo-setup" {
                            return url.scheme() == "tauri"
                                || url.host_str() == Some("tauri.localhost");
                        }
                        let config = ServerConfig {
                            url: url
                                .query_pairs()
                                .find(|(k, _)| k == "url")
                                .map(|(_, v)| v.into_owned())
                                .unwrap_or_default(),
                            allow_local_http: url
                                .query_pairs()
                                .any(|(k, v)| k == "local" && v == "1"),
                        };
                        let app = handle.clone();
                        // Window creation must not block the navigation callback on Windows.
                        std::thread::spawn(move || {
                            let result = (|| -> Result<(), String> {
                                let url = server_url(&config)?;
                                let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
                                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                                std::fs::write(
                                    dir.join("server.json"),
                                    serde_json::to_vec(&config).unwrap(),
                                )
                                .map_err(|e| e.to_string())?;
                                open_crm(&app, url).map_err(|e| e.to_string())?;
                                if let Some(w) = app.get_webview_window("setup") {
                                    let _ = w.close();
                                }
                                Ok(())
                            })();
                            if let Err(message) = result {
                                if let Some(w) = app.get_webview_window("setup") {
                                    let _ = w.eval(&format!(
                                        "showError({})",
                                        serde_json::to_string(&message).unwrap()
                                    ));
                                }
                            }
                        });
                        false
                    })
                    .build()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("No se pudo abrir NEXO CRM");
}

fn open_crm(app: &tauri::AppHandle, url: Url) -> tauri::Result<()> {
    let origin = url.origin();
    let popup_origin = origin.clone();
    let handle = app.clone();
    let sequence = AtomicUsize::new(0);
    let print_handle = app.clone();
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
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

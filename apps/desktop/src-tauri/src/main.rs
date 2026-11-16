#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Deserialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::menu::{Menu, SubmenuBuilder};
use tauri::webview::NewWindowResponse;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

#[derive(Deserialize)]
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
            let config: ServerConfig =
                serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_else(|_| {
                    option_env!("NEXO_DEFAULT_SERVER_JSON")
                        .unwrap_or(include_str!("../../../server.example.json"))
                        .into()
                }))?;
            let url = server_url(&config).map_err(std::io::Error::other)?;
            let origin = url.origin();
            let popup_origin = origin.clone();
            let handle = app.handle().clone();
            let sequence = AtomicUsize::new(0);
            let print_handle = app.handle().clone();
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
        })
        .run(tauri::generate_context!())
        .expect("No se pudo abrir NEXO CRM");
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

//! Only invoked by the bundled setup window. Download locations are never user input.
use crate::{local_server, server_update};
use std::{fs, path::Path, time::Duration};
use tauri_plugin_updater::UpdaterExt;
fn failed() -> String {
    "No se pudo consultar o descargar la actualización. Comprueba Internet y vuelve a intentarlo; tu instalación se conserva.".into()
}
fn trusted_download(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url
            .path()
            .starts_with("/SleekNekro/nexo-crm/releases/download/")
        && url.username().is_empty()
        && url.password().is_none()
}
pub async fn check(app: &tauri::AppHandle, local: &Path) -> Result<serde_json::Value, String> {
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| failed())?;
    let update = updater.check().await.map_err(|_| failed())?;
    if update
        .as_ref()
        .is_some_and(|u| !trusted_download(&u.download_url))
    {
        return Err("El origen de la actualización no es válido.".into());
    }
    Ok(
        serde_json::json!({"client": env!("CARGO_PKG_VERSION"), "next": update.map(|u|u.version), "server": server_update::status(local)}),
    )
}
pub async fn install(
    app: &tauri::AppHandle,
    dir: &Path,
    local: &Path,
    progress: &impl Fn(&str),
) -> Result<serde_json::Value, String> {
    if local.join("update-pending").exists() {
        return Err("Recupera primero el servidor antes de instalar otra versión.".into());
    }
    let lock = local_server::operation_lock(local)?;
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(1800))
        .build()
        .map_err(|_| failed())?;
    let update = updater.check().await.map_err(|_| failed())?;
    if let Some(update) = update {
        if !trusted_download(&update.download_url) {
            return Err("El origen de la actualización no es válido.".into());
        }
        progress("Descargando la aplicación y verificando su firma…");
        // download validates both the signature and signed version before any installation.
        let bytes = update.download(|_, _| {}, || {}).await.map_err(|_| {
            "La descarga o la firma no pudo verificarse. No se ha instalado nada.".to_string()
        })?;
        let marker = dir.join("update-server-after-restart");
        if local.join("initialized").exists() {
            fs::write(&marker, update.version.as_bytes()).map_err(|_| failed())?;
        }
        progress("Instalando la aplicación. Se reiniciará para continuar con el servidor…");
        if update.install(bytes).is_err() {
            let _ = fs::remove_file(marker);
            return Err("No se pudo instalar la aplicación. Vuelve a intentarlo desde una carpeta en la que tengas permiso de escritura.".into());
        }
        drop(lock);
        app.restart();
    }
    drop(lock);
    if server_update::status(local).available {
        let state = server_update::update(local, progress)?;
        Ok(serde_json::json!({"state":state,"done":true}))
    } else {
        Ok(serde_json::json!({"done":true}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downloads_are_confined_to_our_releases() {
        assert!(trusted_download(
            &url::Url::parse(
                "https://github.com/SleekNekro/nexo-crm/releases/download/v1/mac.tar.gz"
            )
            .unwrap()
        ));
        for url in [
            "http://github.com/SleekNekro/nexo-crm/releases/download/v1/a",
            "https://github.com.evil.test/SleekNekro/nexo-crm/releases/download/v1/a",
            "https://github.com/other/repo/releases/download/v1/a",
            "https://user@github.com/SleekNekro/nexo-crm/releases/download/v1/a",
        ] {
            assert!(!trusted_download(&url::Url::parse(url).unwrap()));
        }
    }
}

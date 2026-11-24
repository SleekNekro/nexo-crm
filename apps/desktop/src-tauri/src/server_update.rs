//! A local, version-bound transaction. Never accepts URLs, commands or paths from the WebView.
use crate::local_server::{self, compose, compose_file};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
const COMPONENTS: [&str; 3] = ["app", "pdf", "gateway"];
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current: String,
    pub target: String,
    pub available: bool,
    pub recovery: bool,
}
fn error() -> String {
    "No se pudo completar la actualización. Tus copias se conservan en la configuración local de Nexo.".into()
}
fn images(text: &str) -> Result<BTreeMap<String, String>, String> {
    let mut section = "";
    let mut result = BTreeMap::new();
    for line in text.lines() {
        if !line.starts_with(' ') {
            section = "";
        }
        if line.starts_with("  ") && !line.starts_with("   ") && line.trim_end().ends_with(':') {
            section = line.trim().trim_end_matches(':');
        }
        if line.starts_with("    image:") && COMPONENTS.contains(&section) {
            let image = line.trim().strip_prefix("image:").unwrap().trim();
            if image.contains(['\'', '"', ' ', '$', '#'])
                || !(image.starts_with("ghcr.io/sleeknekro/nexo-crm:")
                    || image.starts_with("nexo-crm:"))
                || result
                    .insert(section.to_string(), image.to_string())
                    .is_some()
            {
                return Err("La configuración de imágenes es personalizada y no puede actualizarse automáticamente.".into());
            }
        }
    }
    if result.len() != 3 {
        return Err("No se reconoce la instalación local. No se han cambiado sus archivos.".into());
    }
    Ok(result)
}
fn version(map: &BTreeMap<String, String>) -> String {
    map.get("app")
        .and_then(|s| s.strip_prefix("ghcr.io/sleeknekro/nexo-crm:app-"))
        .unwrap_or("versión local personalizada")
        .to_string()
}
fn newer_server(current: &BTreeMap<String, String>, target: &BTreeMap<String, String>) -> bool {
    match (
        semver::Version::parse(&version(current)),
        semver::Version::parse(&version(target)),
    ) {
        (Ok(a), Ok(b)) => a > b,
        _ => false,
    }
}
fn candidate(current: &str, target: &str) -> Result<String, String> {
    let old = images(current)?;
    let next = images(target)?;
    if newer_server(&old, &next) {
        return Err(
            "El servidor ya es más reciente que esta aplicación. Actualiza primero la aplicación."
                .into(),
        );
    }
    let mut result = current.to_string();
    for component in COMPONENTS {
        result = result.replace(
            &format!("    image: {}", old[component]),
            &format!("    image: {}", next[component]),
        );
    }
    // The installer owns exactly these four services. Extra writers cannot be safely quiesced.
    let services = current
        .split("services:\n")
        .nth(1)
        .and_then(|s| s.split("\nvolumes:").next())
        .ok_or_else(error)?;
    for line in services
        .lines()
        .filter(|l| l.starts_with("  ") && !l.starts_with("   ") && l.ends_with(':'))
    {
        if !["app", "pdf", "gateway", "db"].contains(&line.trim().trim_end_matches(':')) {
            return Err("Esta instalación tiene servicios adicionales. No se ha modificado; necesita una actualización administrada.".into());
        }
    }
    Ok(result)
}
pub fn status(dir: &Path) -> UpdateStatus {
    let target = images(local_server::COMPOSE).expect("bundled compose");
    let current = fs::read_to_string(dir.join("compose.yaml"))
        .ok()
        .and_then(|s| images(&s).ok());
    UpdateStatus {
        current: current
            .as_ref()
            .map(version)
            .unwrap_or_else(|| "Sin instalar".into()),
        target: version(&target),
        available: dir.join("initialized").exists()
            && current
                .as_ref()
                .map(|c| c != &target && !newer_server(c, &target))
                .unwrap_or(false),
        recovery: dir.join("update-pending").exists(),
    }
}
fn private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| error())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|_| error())?;
    }
    Ok(())
}
fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    // A full disk or power loss must never leave a truncated Compose/journal.
    let temporary = path.with_extension("nexo-tmp");
    let mut f = options.open(&temporary).map_err(|_| error())?;
    f.write_all(bytes)
        .and_then(|_| f.sync_all())
        .map_err(|_| error())?;
    drop(f);
    fs::rename(&temporary, path).map_err(|_| error())?;
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        let _ = fs::File::open(parent).and_then(|f| f.sync_all());
    }
    Ok(())
}
fn backup_path(dir: &Path) -> Result<PathBuf, String> {
    let id = fs::read_to_string(dir.join("update-pending")).map_err(|_| error())?;
    if id.is_empty() || id.len() > 80 || !id.bytes().all(|b| b.is_ascii_digit() || b == b'-') {
        return Err(
            "El registro de recuperación no es válido. No se han cambiado los datos.".into(),
        );
    }
    let backup = dir.join("update-backups").join(id);
    if !backup.join("compose.yaml").is_file() || !backup.join(".env").is_file() {
        return Err(error());
    }
    // Never restore a different project's database after someone changed configuration.
    if fs::read(backup.join(".env")).map_err(|_| error())?
        != fs::read(dir.join(".env")).map_err(|_| error())?
    {
        return Err("La configuración cambió después de la copia. No se restaurarán datos sobre otra instalación.".into());
    }
    Ok(backup)
}
fn wait_ready(dir: &Path) -> bool {
    for _ in 0..30 {
        if local_server::ready(dir) {
            return true;
        }
        thread::sleep(Duration::from_secs(2));
    }
    false
}
fn services_ready(dir: &Path) -> Result<(), String> {
    compose(
        dir,
        &[
            "exec",
            "-T",
            "app",
            "node",
            "-e",
            r#"const http=require('http');const req=http.request({socketPath:'/run/crm-pdf/render.sock',path:'/render',method:'POST',headers:{'Content-Type':'text/html; charset=utf-8'}},r=>{const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>process.exit(r.statusCode===200&&Buffer.concat(chunks).subarray(0,5).toString()==='%PDF-'?0:1))});req.setTimeout(45000,()=>{req.destroy();process.exit(1)});req.on('error',()=>process.exit(1));req.end('<!doctype html><html><body>Nexo update check</body></html>');"#,
        ],
        None,
        60,
    )?;
    for _ in 0..10 {
        if compose(dir,&["exec","-T","gateway","node","-e","fetch('http://127.0.0.1:8080/api/auth',{signal:AbortSignal.timeout(4000)}).then(async r=>process.exit(r.status===200&&(await r.json()).preview===false?0:1)).catch(()=>process.exit(1))"],None,10).is_ok(){return Ok(())}
        thread::sleep(Duration::from_secs(1));
    }
    Err(error())
}
fn cp(dir: &Path, from: &str, to: &str) -> Result<(), String> {
    compose(dir, &["cp", from, to], None, 600).map(|_| ())
}
fn tar(dir: &Path, args: &[&str]) -> Result<(), String> {
    let mut cmd = vec![
        "run",
        "--rm",
        "--no-deps",
        "-T",
        "--entrypoint",
        "tar",
        "app",
    ];
    cmd.extend_from_slice(args);
    compose(dir, &cmd, None, 600).map(|_| ())
}
fn restart_old(dir: &Path, progress: &impl Fn(&str)) -> Result<local_server::Status, String> {
    let backup = backup_path(dir)?;
    progress("Recuperando la versión anterior…");
    // Stop the candidate with its own compose before restoring the old definition.
    compose(dir, &["stop", "gateway", "app", "pdf"], None, 90)?;
    write(
        &dir.join("compose.yaml"),
        &fs::read(backup.join("compose.yaml")).map_err(|_| error())?,
    )?;
    compose(
        dir,
        &["up", "-d", "--wait", "--wait-timeout", "120", "db"],
        None,
        150,
    )?;
    if backup.join("applied").exists() {
        if !backup.join("backup-ready").exists() {
            return Err(error());
        }
        cp(
            dir,
            backup.join("database.dump").to_str().ok_or_else(error)?,
            "db:/tmp/nexo-update-restore.dump",
        )?;
        cp(
            dir,
            backup.join("photos.tar.gz").to_str().ok_or_else(error)?,
            "app:/run/crm-pdf/nexo-update-photos.tar.gz",
        )?;
        tar(dir, &["-tzf", "/run/crm-pdf/nexo-update-photos.tar.gz"])?;
        // Validate both archives before touching the current database.
        compose(
            dir,
            &[
                "exec",
                "-T",
                "db",
                "pg_restore",
                "--list",
                "/tmp/nexo-update-restore.dump",
            ],
            None,
            60,
        )?;
        compose(
            dir,
            &[
                "exec",
                "-T",
                "db",
                "dropdb",
                "-U",
                "crm",
                "--force",
                "--if-exists",
                "crm",
            ],
            None,
            60,
        )?;
        compose(
            dir,
            &[
                "exec", "-T", "db", "createdb", "-U", "crm", "-O", "crm", "crm",
            ],
            None,
            60,
        )?;
        compose(
            dir,
            &[
                "exec",
                "-T",
                "db",
                "pg_restore",
                "-U",
                "crm",
                "-d",
                "crm",
                "--exit-on-error",
                "/tmp/nexo-update-restore.dump",
            ],
            None,
            600,
        )?;
        compose(dir,&["run","--rm","--no-deps","-T","--entrypoint","node","app","-e","const fs=require('fs');for(const n of fs.readdirSync('/app/storage'))fs.rmSync('/app/storage/'+n,{recursive:true,force:true});"],None,120)?;
        tar(
            dir,
            &[
                "-xzf",
                "/run/crm-pdf/nexo-update-photos.tar.gz",
                "--no-same-owner",
                "-C",
                "/app/storage",
            ],
        )?;
    }
    compose(
        dir,
        &["up", "-d", "--no-build", "--pull", "never", "app", "pdf"],
        None,
        150,
    )?;
    if !wait_ready(dir) {
        return Err("La recuperación necesita revisión. Conservamos la copia y el registro; vuelve a pulsar Recuperar servidor.".into());
    }
    compose(
        dir,
        &["up", "-d", "--no-build", "--pull", "never", "gateway"],
        None,
        90,
    )?;
    services_ready(dir)?;
    fs::remove_file(dir.join("update-pending")).map_err(|_| error())?;
    Ok(local_server::status(dir))
}
pub fn recover(dir: &Path, progress: impl Fn(&str)) -> Result<local_server::Status, String> {
    let _lock = local_server::operation_lock(dir)?;
    if !local_server::docker_ready() {
        return Err("Abre Docker Desktop para recuperar tu servidor.".into());
    }
    restart_old(dir, &progress)
}
pub fn update(dir: &Path, progress: impl Fn(&str)) -> Result<local_server::Status, String> {
    update_to(dir, local_server::COMPOSE, progress, |_| Ok(()))
}
fn update_to(
    dir: &Path,
    target: &str,
    progress: impl Fn(&str),
    after_start: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<local_server::Status, String> {
    let _lock = local_server::operation_lock(dir)?;
    if dir.join("update-pending").exists() {
        return Err(
            "Primero pulsa Recuperar servidor para completar la operación anterior.".into(),
        );
    }
    if !dir.join("initialized").exists() || !local_server::docker_ready() {
        return Err("El servidor local debe estar instalado y Docker disponible.".into());
    }
    let old = fs::read_to_string(dir.join("compose.yaml")).map_err(|_| error())?;
    let next = candidate(&old, target)?;
    if images(&old)? == images(target)? {
        return Ok(local_server::status(dir));
    }
    local_server::env(dir)?;
    write(&dir.join("compose.next.yaml"), next.as_bytes())?;
    progress("Descargando la nueva versión. Puedes seguir usando Nexo durante la descarga…");
    compose_file(
        dir,
        "compose.next.yaml",
        &["pull", "app", "pdf", "gateway"],
        None,
        1800,
    )?;
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| error())?
        .as_millis()
        .to_string();
    let backups = dir.join("update-backups");
    private_dir(&backups)?;
    let backup = backups.join(&id);
    private_dir(&backup)?;
    write(&backup.join("compose.yaml"), old.as_bytes())?;
    write(
        &backup.join(".env"),
        &fs::read(dir.join(".env")).map_err(|_| error())?,
    )?;
    write(&dir.join("update-pending"), id.as_bytes())?;
    let apply = (|| -> Result<(), String> {
        progress("Guardando una copia de la base de datos y los archivos. Nexo se pausará unos instantes…");
        compose(
            dir,
            &["up", "-d", "--wait", "--wait-timeout", "120", "db"],
            None,
            150,
        )?;
        compose(dir, &["stop", "gateway", "app", "pdf"], None, 90)?;
        compose(
            dir,
            &[
                "exec",
                "-T",
                "db",
                "pg_dump",
                "-U",
                "crm",
                "-d",
                "crm",
                "-Fc",
                "-f",
                "/tmp/nexo-update.dump",
            ],
            None,
            600,
        )?;
        compose(
            dir,
            &[
                "exec",
                "-T",
                "db",
                "pg_restore",
                "--list",
                "/tmp/nexo-update.dump",
            ],
            None,
            60,
        )?;
        cp(
            dir,
            "db:/tmp/nexo-update.dump",
            backup.join("database.dump").to_str().ok_or_else(error)?,
        )?;
        tar(
            dir,
            &[
                "-czf",
                "/run/crm-pdf/nexo-update-photos.tar.gz",
                "-C",
                "/app/storage",
                ".",
            ],
        )?;
        tar(dir, &["-tzf", "/run/crm-pdf/nexo-update-photos.tar.gz"])?;
        cp(
            dir,
            "app:/run/crm-pdf/nexo-update-photos.tar.gz",
            backup.join("photos.tar.gz").to_str().ok_or_else(error)?,
        )?;
        write(&backup.join("backup-ready"), b"1")?;
        progress("Instalando y comprobando la nueva versión…");
        write(&backup.join("applied"), b"1")?;
        write(&dir.join("compose.yaml"), next.as_bytes())?;
        compose(
            dir,
            &["up", "-d", "--no-build", "--pull", "never", "app", "pdf"],
            None,
            150,
        )?;
        if !wait_ready(dir) {
            return Err(error());
        }
        after_start(dir)?;
        compose(
            dir,
            &["up", "-d", "--no-build", "--pull", "never", "gateway"],
            None,
            90,
        )?;
        services_ready(dir)?;
        fs::remove_file(dir.join("update-pending")).map_err(|_| error())?;
        Ok(())
    })();
    if apply.is_err() {
        return match restart_old(dir,&progress){Ok(_)=>Err("No se pudo instalar la actualización. Se ha recuperado la versión anterior con sus datos. Puedes volver a intentarlo.".into()),Err(_)=>Err("La actualización se interrumpió. La copia está conservada. Pulsa Recuperar servidor; no borres la instalación.".into())};
    }
    progress("Nexo actualizado. Tus datos se han conservado.");
    Ok(local_server::status(dir))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn updates_only_images() {
        let current = local_server::COMPOSE.replace("app-0.2.0-beta.4", "app-0.2.0-beta.3");
        let next = candidate(&current, local_server::COMPOSE).unwrap();
        assert_eq!(next, local_server::COMPOSE);
    }
    #[test]
    fn rejects_unknown_images_and_services() {
        assert!(candidate(
            &local_server::COMPOSE.replace("ghcr.io/sleeknekro/nexo-crm:", "evil.example/app:"),
            local_server::COMPOSE
        )
        .is_err());
        assert!(candidate(
            &local_server::COMPOSE.replace("  app:\n", "  writer:\n    image: writer\n  app:\n"),
            local_server::COMPOSE
        )
        .is_err());
    }
    #[test]
    fn refuses_server_downgrades() {
        let newer = local_server::COMPOSE.replace("0.2.0-beta.4", "9.0.0");
        assert!(candidate(&newer, local_server::COMPOSE).is_err());
    }
    #[test]
    fn failed_write_preserves_working_configuration() {
        let dir = std::env::temp_dir().join(format!("nexo-atomic-update-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("compose.yaml");
        fs::write(&path, "working configuration").unwrap();
        fs::create_dir(path.with_extension("nexo-tmp")).unwrap();
        assert!(write(&path, b"new configuration").is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "working configuration");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn recovery_path_is_confined() {
        let dir = std::env::temp_dir().join(format!("nexo-update-path-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("update-pending"), "../../other").unwrap();
        assert!(backup_path(&dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(test)]
mod integration {
    use super::*;
    fn sql(dir: &Path, query: &str) -> String {
        compose(
            dir,
            &[
                "exec",
                "-T",
                "db",
                "psql",
                "-U",
                "crm",
                "-d",
                "crm",
                "-v",
                "ON_ERROR_STOP=1",
                "-tAc",
                query,
            ],
            None,
            60,
        )
        .unwrap()
    }
    fn node(dir: &Path, code: &str) -> String {
        compose(dir, &["exec", "-T", "app", "node", "-e", code], None, 60).unwrap()
    }
    #[test]
    #[ignore = "Requires Docker; creates and removes only a random disposable Nexo project"]
    fn docker_update_and_restore() {
        let dir = std::env::temp_dir().join(format!(
            "nexo-update-integration-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        local_server::prepare(&dir).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = compose(
                    &self.0,
                    &["down", "--volumes", "--remove-orphans"],
                    None,
                    120,
                );
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(dir.clone());
        let old = local_server::COMPOSE.replace("0.2.0-beta.4", "0.2.0-beta.3");
        fs::write(dir.join("compose.yaml"), &old).unwrap();
        local_server::start(&dir, "disposable-12345", |s| println!("{s}")).unwrap();
        sql(&dir,"CREATE TABLE update_probe (v text); ALTER TABLE update_probe OWNER TO crm_runtime; INSERT INTO update_probe VALUES ('before');");
        node(
            &dir,
            "require('fs').writeFileSync('/app/storage/probe.txt','photo-before')",
        );
        let original_env = fs::read(dir.join(".env")).unwrap();
        assert!(update(&dir, |s| println!("{s}")).unwrap().ready);
        assert_eq!(sql(&dir, "SELECT v FROM update_probe").trim(), "before");
        assert_eq!(
            node(
                &dir,
                "console.log(require('fs').readFileSync('/app/storage/probe.txt','utf8'))"
            )
            .trim(),
            "photo-before"
        );
        assert_eq!(original_env, fs::read(dir.join(".env")).unwrap());
        // A local alias of the current app forces a second transaction without a downgrade.
        let app = images(local_server::COMPOSE).unwrap()["app"].clone();
        let alias = format!("nexo-crm:update-test-{}", std::process::id());
        local_server::run(&["tag", &app, &alias], None, None, 30).unwrap();
        fs::write(
            dir.join("compose.yaml"),
            local_server::COMPOSE.replace(&app, &alias),
        )
        .unwrap();
        let result = update_to(
            &dir,
            local_server::COMPOSE,
            |s| println!("{s}"),
            |dir| {
                sql(dir, "UPDATE update_probe SET v='changed-by-migration'");
                node(dir,"require('fs').writeFileSync('/app/storage/probe.txt','changed-photo');require('fs').writeFileSync('/app/storage/new.txt','new')");
                Err("Simulated failed migration".into())
            },
        );
        assert!(result.err().unwrap().contains("recuperado"));
        assert_eq!(sql(&dir, "SELECT v FROM update_probe").trim(), "before");
        assert_eq!(
            sql(
                &dir,
                "SELECT tableowner FROM pg_tables WHERE tablename='update_probe'"
            )
            .trim(),
            "crm_runtime"
        );
        assert_eq!(
            node(
                &dir,
                "console.log(require('fs').readFileSync('/app/storage/probe.txt','utf8'))"
            )
            .trim(),
            "photo-before"
        );
        assert_eq!(
            node(
                &dir,
                "console.log(require('fs').existsSync('/app/storage/new.txt'))"
            )
            .trim(),
            "false"
        );
        assert!(!dir.join("update-pending").exists());
        assert!(local_server::ready(&dir));
        assert_eq!(original_env, fs::read(dir.join(".env")).unwrap());
        println!("OK: successful update and forced rollback preserve DB, role ownership, files and configuration");
    }
}

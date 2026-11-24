//! Local-only Docker manager. No shell commands or arbitrary paths arrive from the web.
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
pub(crate) const COMPOSE: &str = include_str!("../../../server/compose.yaml");
const SQL: &str = include_str!("../../../server/provision.sql.template");
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub docker: bool,
    pub installed: bool,
    pub has_account: bool,
    pub running: bool,
    pub ready: bool,
    pub url: String,
    pub message: String,
}
fn failure() -> String {
    "No se ha podido completar la operación. Comprueba Docker Desktop, la conexión y el espacio disponible. Puedes volver a intentarlo sin borrar tus datos.".into()
}
fn docker() -> PathBuf {
    let mut paths: Vec<PathBuf> = vec![];
    #[cfg(target_os = "macos")]
    {
        paths.push("/usr/local/bin/docker".into());
        paths.push("/opt/homebrew/bin/docker".into());
        if let Some(home) = std::env::var_os("HOME") {
            paths.push(PathBuf::from(home).join(".docker/bin/docker"));
        }
    }
    #[cfg(target_os = "windows")]
    if let Some(base) = std::env::var_os("ProgramFiles") {
        paths.push(PathBuf::from(base).join("Docker/Docker/resources/bin/docker.exe"));
    }
    paths
        .into_iter()
        .find(|p| p.is_file())
        .unwrap_or_else(|| "docker".into())
}
fn docker_process_path(binary: &Path) -> Result<std::ffi::OsString, String> {
    let mut paths = Vec::new();
    if binary.is_absolute() {
        if let Some(parent) = binary.parent() {
            paths.push(parent.to_path_buf());
        }
    }
    if let Ok(actual) = binary.canonicalize() {
        if let Some(parent) = actual.parent() {
            paths.push(parent.to_path_buf());
        }
    }
    if let Some(current) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&current));
    }
    std::env::join_paths(paths)
        .map_err(|_| "No se ha podido preparar el entorno de Docker Desktop.".into())
}
fn capture(mut pipe: impl Read) -> Vec<u8> {
    let mut result = Vec::new();
    let mut buf = [0u8; 8192];
    while let Ok(n) = pipe.read(&mut buf) {
        if n == 0 {
            break;
        }
        if result.len() < 65536 {
            result.extend_from_slice(&buf[..n]);
        }
    }
    result
}
pub(crate) fn run(
    args: &[&str],
    cwd: Option<&Path>,
    input: Option<&str>,
    seconds: u64,
) -> Result<String, String> {
    let binary = docker();
    let mut cmd = Command::new(&binary);
    cmd.env("PATH", docker_process_path(&binary)?);
    // Compose must use this installation's .env, never unrelated shell settings.
    for key in [
        "COMPOSE_PROJECT_NAME",
        "COMPOSE_FILE",
        "COMPOSE_PROFILES",
        "POSTGRES_PASSWORD",
        "CRM_RUNTIME_PASSWORD",
        "AUTH_ENCRYPTION_KEY",
        "CRM_GATEWAY_TOKEN",
        "CRM_DEPLOYMENT_ID",
        "APP_PORT",
        "ADMIN_PORT",
        "BIND_ADDRESS",
        "CRM_PUBLIC_URL",
        "COOKIE_SECURE",
        "CRM_REMINDER_TOKEN",
    ] {
        cmd.env_remove(key);
    }

    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|_| {
        "Instala y abre Docker Desktop para preparar el servidor local.".to_string()
    })?;
    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    let stdout = thread::spawn(move || capture(out));
    let stderr = thread::spawn(move || capture(err));
    let mut stdin = child.stdin.take().unwrap();
    if let Some(text) = input {
        if stdin.write_all(text.as_bytes()).is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure());
        }
    }
    drop(stdin);
    let start = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) => {}
            Err(_) => break false,
        }
        if start.elapsed().as_secs() > seconds {
            let _ = child.kill();
            let _ = child.wait();
            break false;
        }
        thread::sleep(Duration::from_millis(100));
    };
    let bytes = stdout.join().unwrap_or_default();
    let _ = stderr.join();
    if success {
        Ok(String::from_utf8_lossy(&bytes).trim().to_string())
    } else {
        Err(failure())
    }
}
pub(crate) fn compose(
    dir: &Path,
    args: &[&str],
    input: Option<&str>,
    seconds: u64,
) -> Result<String, String> {
    compose_file(dir, "compose.yaml", args, input, seconds)
}
pub(crate) fn compose_file(
    dir: &Path,
    file: &str,
    args: &[&str],
    input: Option<&str>,
    seconds: u64,
) -> Result<String, String> {
    let values = env(dir)?;
    let project = values.get("COMPOSE_PROJECT_NAME").ok_or_else(failure)?;
    let mut all = vec![
        "compose",
        "--project-name",
        project.as_str(),
        "--env-file",
        ".env",
        "-f",
        file,
    ];
    all.extend_from_slice(args);
    run(&all, Some(dir), input, seconds)
}
fn random() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| failure())?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn parse_env(text: &str) -> Result<BTreeMap<String, String>, String> {
    let values: BTreeMap<_, _> = text
        .lines()
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    if !values
        .get("COMPOSE_PROJECT_NAME")
        .and_then(|v| v.strip_prefix("nexo-local-"))
        .map(|v| v.len() == 12 && v.bytes().all(|b| b.is_ascii_hexdigit()))
        .unwrap_or(false)
    {
        return Err(
            "El identificador del servidor local no es válido. No se han modificado los datos."
                .into(),
        );
    }
    for key in [
        "POSTGRES_PASSWORD",
        "CRM_RUNTIME_PASSWORD",
        "AUTH_ENCRYPTION_KEY",
        "CRM_GATEWAY_TOKEN",
        "CRM_DEPLOYMENT_ID",
    ] {
        if !values
            .get(key)
            .map(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
            .unwrap_or(false)
        {
            return Err("La configuración local está incompleta. No se ha sobrescrito ni borrado ningún dato.".into());
        }
    }
    Ok(values)
}
pub(crate) fn env(dir: &Path) -> Result<BTreeMap<String, String>, String> {
    parse_env(&fs::read_to_string(dir.join(".env")).map_err(|_| failure())?)
}
fn available_ports() -> Result<(u16, u16), String> {
    for port in [8180u16, 8280, 8380, 8480, 8580] {
        if let (Ok(_a), Ok(_b)) = (
            TcpListener::bind(("127.0.0.1", port)),
            TcpListener::bind(("127.0.0.1", port + 2)),
        ) {
            return Ok((port, port + 2));
        }
    }
    Err("Los puertos locales de Nexo están ocupados. Cierra otra instalación de prueba e inténtalo de nuevo.".into())
}
pub(crate) fn prepare(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|_| failure())?;
    if !dir.join(".env").exists() {
        let (port, admin) = available_ports()?;
        let id = random()?;
        let mut content=format!("COMPOSE_PROJECT_NAME=nexo-local-{}\nAPP_PORT={port}\nADMIN_PORT={admin}\nCRM_PUBLIC_URL=http://localhost:{port}\nCRM_DEPLOYMENT_ID={id}\n",&id[..12]);
        for key in [
            "POSTGRES_PASSWORD",
            "CRM_RUNTIME_PASSWORD",
            "AUTH_ENCRYPTION_KEY",
            "CRM_GATEWAY_TOKEN",
        ] {
            content.push_str(&format!("{key}={}\n", random()?));
        }
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        options
            .open(dir.join(".env"))
            .map_err(|_| failure())?
            .write_all(content.as_bytes())
            .map_err(|_| failure())?;
    }
    env(dir)?;
    // Each installer version has its own fixed image tags; it never pulls an arbitrary URL.
    if !dir.join("compose.yaml").exists() {
        fs::write(dir.join("compose.yaml"), COMPOSE).map_err(|_| failure())?;
    }
    Ok(())
}
pub(crate) fn ready(dir: &Path) -> bool {
    compose(dir,&["exec","-T","app","node","-e","fetch('http://127.0.0.1:3000/api/auth',{signal:AbortSignal.timeout(4000)}).then(async r=>process.exit(r.status===200&&(await r.json()).preview===false?0:1)).catch(()=>process.exit(1))"],None,10).is_ok()
}
fn local_endpoint(endpoint: &str) -> bool {
    endpoint.starts_with("unix://") || endpoint.starts_with("npipe://")
}
pub(crate) fn docker_ready() -> bool {
    if std::env::var("DOCKER_HOST")
        .map(|v| !v.is_empty() && !local_endpoint(&v))
        .unwrap_or(false)
    {
        return false;
    }
    if !run(
        &[
            "context",
            "inspect",
            "--format",
            "{{.Endpoints.docker.Host}}",
        ],
        None,
        None,
        10,
    )
    .map(|v| local_endpoint(&v))
    .unwrap_or(false)
    {
        return false;
    }
    run(&["info", "--format", "{{.OSType}}"], None, None, 15)
        .map(|v| v == "linux")
        .unwrap_or(false)
        && run(&["compose", "version"], None, None, 10).is_ok()
}
pub fn status(dir: &Path) -> Status {
    let installed = dir.join(".env").exists();
    let docker = docker_ready();
    let url = env(dir)
        .ok()
        .and_then(|v| v.get("CRM_PUBLIC_URL").cloned())
        .unwrap_or_default();
    let running = docker
        && installed
        && compose(dir, &["ps", "--status", "running", "--services"], None, 15)
            .map(|s| s.lines().any(|v| v == "app"))
            .unwrap_or(false);
    let is_ready = running && dir.join("initialized").exists() && ready(dir);
    let message = if !docker {
        "Instala y abre Docker Desktop (contenedores Linux), y pulsa Comprobar."
    } else if is_ready {
        "Servidor disponible. Puedes abrir Nexo."
    } else if installed {
        "Tu instalación está guardada. Pulsa Iniciar para continuar."
    } else {
        "Todo listo para preparar tu CRM en este ordenador."
    };
    Status {
        docker,
        installed,
        has_account: dir.join("initialized").exists(),
        running,
        ready: is_ready,
        url,
        message: message.into(),
    }
}
pub(crate) fn operation_lock(dir: &Path) -> Result<fs::File, String> {
    fs::create_dir_all(dir).map_err(|_| failure())?;
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(dir.join("operation.lock"))
        .map_err(|_| failure())?;
    file.try_lock().map_err(|_| {
        "Otra ventana de Nexo está gestionando el servidor. Espera a que termine.".to_string()
    })?;
    Ok(file)
}
fn valid_initial_password(password: &str) -> bool {
    (8..=128).contains(&password.encode_utf16().count())
}
pub fn start(dir: &Path, password: &str, progress: impl Fn(&str)) -> Result<Status, String> {
    let _operation = operation_lock(dir)?;
    if dir.join("update-pending").exists() {
        return Err(
            "Hay una actualización interrumpida. Pulsa Recuperar servidor antes de iniciarlo."
                .into(),
        );
    }
    if !status(dir).docker {
        return Err("Abre Docker Desktop y espera a que termine de arrancar.".into());
    }
    if !dir.join("initialized").exists() && !valid_initial_password(password) {
        return Err("Elige una contraseña de 8 a 128 caracteres para la cuenta developer.".into());
    }
    prepare(dir)?;
    progress("Descargando componentes. La primera vez puede tardar varios minutos…");
    if !dir.join("initialized").exists() {
        compose(dir, &["pull"], None, 1800)?;
    }
    progress("Preparando la base de datos…");
    compose(
        dir,
        &["up", "-d", "--wait", "--wait-timeout", "120", "db"],
        None,
        150,
    )?;
    let values = env(dir)?;
    let sql = SQL.replace("__RUNTIME_PASSWORD__", &values["CRM_RUNTIME_PASSWORD"]);
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
        ],
        Some(&sql),
        60,
    )?;
    progress("Iniciando Nexo…");
    compose(dir, &["up", "-d", "--no-build"], None, 120)?;
    let mut ok = false;
    for _ in 0..60 {
        if ready(dir) {
            ok = true;
            break;
        }
        thread::sleep(Duration::from_secs(2));
    }
    if !ok {
        return Err("El servidor tarda en arrancar. Comprueba los recursos de Docker y pulsa Iniciar para reintentarlo.".into());
    }
    progress("Preparando tu cuenta…");
    let payload = serde_json::json!({"password":password}).to_string();
    compose(
        dir,
        &["exec", "-T", "app", "node", "scripts/setup-local-admin.mjs"],
        Some(&payload),
        30,
    )?;
    fs::write(dir.join("initialized"), "1").map_err(|_| failure())?;
    Ok(status(dir))
}
pub fn stop(dir: &Path) -> Result<Status, String> {
    let _operation = operation_lock(dir)?;
    if !docker_ready() {
        return Err("Abre Docker Desktop y selecciona su contexto local.".into());
    }
    if dir.join(".env").exists() {
        compose(dir, &["stop"], None, 90)?;
    }
    Ok(status(dir))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_process_can_find_docker_helpers() {
        let folder = std::env::temp_dir().join("nexo-helper-path-test");
        let path = docker_process_path(&folder.join("docker")).unwrap();
        assert!(std::env::split_paths(&path).any(|p| p == folder));
    }
    #[test]
    fn initial_password_boundaries() {
        assert!(!valid_initial_password("1234567"));
        assert!(valid_initial_password("12345678"));
        assert!(valid_initial_password(&"x".repeat(128)));
        assert!(!valid_initial_password(&"x".repeat(129)));
    }
    #[test]
    fn remote_docker_is_rejected() {
        assert!(local_endpoint("unix:///var/run/docker.sock"));
        assert!(local_endpoint("npipe:////./pipe/dockerDesktopLinuxEngine"));
        assert!(!local_endpoint("ssh://production"));
        assert!(!local_endpoint("tcp://192.168.0.10:2375"));
    }
    #[test]
    fn operations_cannot_overlap() {
        let dir = std::env::temp_dir().join(format!("nexo-lock-test-{}", random().unwrap()));
        let first = operation_lock(&dir).unwrap();
        assert!(operation_lock(&dir).is_err());
        drop(first);
        drop(operation_lock(&dir).unwrap());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn secrets_are_random_hex() {
        let a = random().unwrap();
        assert_eq!(a.len(), 64);
        assert_ne!(a, random().unwrap());
    }
    #[test]
    fn rejects_corrupted_configuration() {
        assert!(parse_env("CRM_RUNTIME_PASSWORD=x' ; DROP DATABASE crm;").is_err());
    }
    #[test]
    fn local_only_and_prebuilt() {
        assert!(!COMPOSE.contains("build:"));
        assert!(!COMPOSE.contains("0.0.0.0"));
        assert!(!COMPOSE.contains("docker.sock"));
        assert!(COMPOSE.contains("127.0.0.1:"));
    }
    #[test]
    fn provisioning_is_unprivileged_and_atomic() {
        assert!(SQL.starts_with("BEGIN;"));
        assert!(SQL.contains("NOSUPERUSER"));
        assert!(SQL.trim_end().ends_with("COMMIT;"));
    }
}

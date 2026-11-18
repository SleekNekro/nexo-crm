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
const COMPOSE: &str = include_str!("../../../server/compose.yaml");
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
fn run(
    args: &[&str],
    cwd: Option<&Path>,
    input: Option<&str>,
    seconds: u64,
) -> Result<String, String> {
    let mut cmd = Command::new(docker());
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
fn compose(dir: &Path, args: &[&str], input: Option<&str>, seconds: u64) -> Result<String, String> {
    let mut all = vec!["compose", "--env-file", ".env", "-f", "compose.yaml"];
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
fn env(dir: &Path) -> Result<BTreeMap<String, String>, String> {
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
fn prepare(dir: &Path) -> Result<(), String> {
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
fn ready(dir: &Path) -> bool {
    compose(dir,&["exec","-T","app","node","-e","fetch('http://127.0.0.1:3000/api/auth',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"],None,10).is_ok()
}
pub fn status(dir: &Path) -> Status {
    let installed = dir.join(".env").exists();
    let docker = run(&["info", "--format", "{{.OSType}}"], None, None, 15)
        .map(|v| v == "linux")
        .unwrap_or(false)
        && run(&["compose", "version"], None, None, 10).is_ok();
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
pub fn start(dir: &Path, password: &str, progress: impl Fn(&str)) -> Result<Status, String> {
    if !status(dir).docker {
        return Err("Abre Docker Desktop y espera a que termine de arrancar.".into());
    }
    if !dir.join("initialized").exists() && !(12..=128).contains(&password.encode_utf16().count()) {
        return Err("Elige una contraseña de 12 a 128 caracteres para la cuenta developer.".into());
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
    if dir.join(".env").exists() {
        compose(dir, &["stop"], None, 90)?;
    }
    Ok(status(dir))
}
#[cfg(test)]
mod tests {
    use super::*;
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
        assert!(SQL.ends_with("COMMIT;\n"));
    }
}

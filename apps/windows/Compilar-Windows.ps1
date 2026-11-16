param([string]$Servidor = 'http://127.0.0.1:8180/')
$ErrorActionPreference = 'Stop'
$uri = [Uri]$Servidor
if (-not $uri.IsAbsoluteUri -or $uri.AbsolutePath -ne '/' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Usa la raíz del servidor, sin rutas ni credenciales.' }
foreach ($tool in @('node', 'npm.cmd', 'cargo', 'rustup')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Falta $tool. Consulta apps/README.md." }
}
$previous = $env:NEXO_DEFAULT_SERVER_JSON
Push-Location (Join-Path $PSScriptRoot '../desktop')
try {
  $env:NEXO_DEFAULT_SERVER_JSON = @{url=$uri.AbsoluteUri;allowLocalHttp=($uri.Scheme -eq 'http')} | ConvertTo-Json -Compress
  & rustup target add x86_64-pc-windows-msvc
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar el destino Rust.' }
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
  & npm.cmd exec -- tauri build --target x86_64-pc-windows-msvc --bundles nsis
  if ($LASTEXITCODE -ne 0) { throw 'La compilación ha fallado; no hay instalador verificado.' }
  Write-Host 'Instalador generado en desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis'
} finally { Pop-Location; $env:NEXO_DEFAULT_SERVER_JSON = $previous }

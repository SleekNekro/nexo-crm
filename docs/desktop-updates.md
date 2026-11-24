# Actualizar Nexo sin comandos

En Mac y Windows, abre **CRM → Conexión, servidor y actualizaciones**. Pulsa **Buscar actualizaciones** y después **Actualizar Nexo**. Guarda los cambios y cierra las ventanas del CRM; deja abierto el asistente.

La primera vez hay que instalar manualmente la beta.5: las versiones anteriores no incluyen este actualizador. A partir de beta.5, el botón descarga las siguientes versiones firmadas. No hace falta abrir la consola ni gestionar contenedores. Docker Desktop debe estar funcionando para actualizar el servidor.

## Qué se actualiza

- La aplicación de escritorio de este ordenador, con firma criptográfica y versión firmada obligatorias.
- Si has usado «Probar en este ordenador», su servidor local: aplicación web, generador de PDF y puerta de acceso. La versión del servidor está fijada dentro de la aplicación firmada; puede ser distinta de la del cliente.
- Si te conectas a un servidor remoto, solo cambia tu aplicación. El servidor se actualiza en el ordenador que lo aloja. Esto no actualiza Docker Desktop ni hace migraciones de versión mayor de PostgreSQL.
- Android no usa este instalador nativo: sigue instalando su APK. La PWA recibe la web de su servidor.

El servidor continúa funcionando durante la descarga. Antes de sustituirlo se detienen las conexiones y se guardan la base de datos, las fotos y la configuración. Si la nueva versión falla en su comprobación de arranque, se intenta recuperar la anterior y restaurar esa copia. Una interrupción deja disponible **Recuperar servidor**. Las copias permanecen en `local-server/update-backups` dentro de la configuración de Nexo; son locales y no sustituyen una copia en otro dispositivo.

Actualizar requiere acceso al ordenador anfitrión. No es una operación expuesta al CRM remoto ni a sus usuarios web. No se admiten direcciones de actualización o comandos proporcionados por la web.

## Publicar futuras versiones (mantenimiento)

1. Incrementar la versión de escritorio en `apps/desktop/package.json`, su lockfile, `src-tauri/Cargo.toml`, `Cargo.lock` y `tauri.conf.json`.
2. Si cambia el servidor, publicar primero las tres imágenes y fijar sus etiquetas en `apps/server/compose.yaml`. No sobrescribir etiquetas publicadas. No bajar la versión del servidor.
3. Ejecutar pruebas nativas y web. La prueba Docker desechable se ejecuta con `cargo test --release docker_update_and_restore -- --ignored --nocapture` en `apps/desktop/src-tauri`.
4. Compilar Mac ARM, Mac Intel y Windows. El paquete de actualización Mac es un `.app.tar.gz` con la aplicación firmada ad hoc; Windows utiliza el instalador NSIS `.exe`.
5. Firmar cada paquete con `tauri signer sign --private-key-path RUTA_PRIVADA --app-version VERSION PAQUETE`. La clave privada se guarda fuera del repositorio; nunca se publica. Conservar una copia segura: perderla impediría actualizar a los usuarios existentes con esta identidad.
6. Subir los paquetes y sus firmas a una release y comprobar sus sumas. Solo después actualizar `apps/updates/beta.json`, con `version`, `pub_date`, `notes` y `platforms` (`darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`), cada una con `url` y `signature`.

El canal beta usa ese manifiesto HTTPS fijo en la rama `main`, porque «latest release» de GitHub excluye las prereleases. El instalador comprueba la firma del paquete y que corresponda a la versión anunciada; rechaza descargas fuera de las releases de este repositorio. La firma de actualización es independiente de la notarización de Apple y de Authenticode de Windows.

## Límites de esta primera versión

No hay actualización automática en segundo plano. El usuario la solicita y acepta la pausa. El actualizador solo administra el Compose local de cuatro servicios creado por Nexo; instalaciones personalizadas con otros servicios necesitan administración propia. Conserva volúmenes, claves y puertos. Una comprobación de arranque no sustituye las pruebas funcionales de cada release.

# Seguridad

Esta edición es una demostración local. No contiene credenciales universales; el arranque genera las claves y la contraseña inicial. No publiques `.env`, copias, fotos ni claves de firma. El análisis de archivos ayuda a detectar errores frecuentes, pero no sustituye la revisión manual.

Antes de usar datos reales o abrir el servicio a Internet, configura HTTPS, cookies seguras, límites de acceso, copias verificadas y monitorización. No expongas PostgreSQL ni el puerto interno de control de la pasarela.

No publiques contraseñas, datos personales o detalles explotables en issues. Si detectas un problema, utiliza el canal privado de contacto del autor en GitHub. No hay compromiso de soporte ni auditoría externa.

## Refuerzo de correo y acceso

Las rutas de inicio de sesión, seguridad, configuración SMTP y envío de presupuestos limitan el tamaño real del cuerpo y su tiempo de lectura; rechazan JSON inválido y tipos de contenido inesperados. La validación del origen rechaza URLs malformadas y requiere HTTPS cuando `COOKIE_SECURE=true`. Los destinatarios SMTP deben ser un único buzón sin grupos, comentarios ni caracteres de control.

Los recordatorios requieren una clave interna de al menos 32 caracteres. Los PDF tienen límites de tamaño, no ejecutan JavaScript y bloquean peticiones de red. Los contenedores de aplicación, pasarela y recordatorios no pueden adquirir nuevos privilegios y no reciben capacidades Linux adicionales; mantienen límites de procesos.

Estos controles no sustituyen HTTPS: en una instalación HTTP las credenciales aún viajan sin cifrado entre el dispositivo y el servidor. Usa HTTPS y `COOKIE_SECURE=true` antes de exponer el CRM fuera de una red de confianza. Chromium se ejecuta sin su sandbox en el contenedor; mantén la imagen actualizada y el proceso sin privilegios. La auditoría de dependencias y las pruebas no equivalen a una auditoría externa completa.

## Refuerzos de la auditoría de noviembre de 2026

- Solo el desarrollador crea o administra cuentas privilegiadas. Un administrador solo puede gestionar cuentas ordinarias cuyos permisos efectivos no superen los suyos; incluye restablecimientos, bajas y reactivaciones.
- Las vistas restringen la lectura en servidor, además del menú. Presupuestos requiere también Tratos, Empresas y Contactos; Pedidos depende de esos permisos. Análisis necesita las vistas comerciales. Los comerciales conservan los datos de operarios necesarios para revisar sus obras asignadas. Los campos ocultos se conservan al guardar otros cambios.
- Las API de escritura limitan el tamaño real y el tiempo de lectura antes de bloquear datos. PostgreSQL limita sentencias, bloqueos y transacciones inactivas.
- `scripts/provision-runtime.py` prepara `crm_runtime` sin privilegios administrativos PostgreSQL. El rol hereda únicamente `crm_owner`, propietario de los objetos de aplicación, no el rol bootstrap `crm`. No puede asumir esos roles ni leer el catálogo de contraseñas o archivos del servidor. El CRM todavía realiza migraciones y provisión de esquemas: conserva DDL sobre sus objetos; no es aislamiento mediante roles por empresa/RLS.
- `pdf` procesa documentos por un socket Unix compartido, sin red, sin credenciales, con raíz de solo lectura y límites de memoria, CPU y procesos. JavaScript y recursos externos se bloquean. Chromium aún usa `--no-sandbox` dentro de ese contenedor aislado. Producción exige `CRM_PDF_SOCKET`; no se degrada silenciosamente al renderizador local.
- `security_events` registra accesos y operaciones de cuentas/2FA, sin contraseñas, códigos ni cuerpos de correo. Retención de 180 días, consultable solo por el desarrollador en `/api/security-events`. No sustituye un registro externo inmutable ni un sistema de alertas.
- En Mi cuenta, el modo dispositivo compartido elimina borradores y fotos sin enviar al cerrar sesión, tras confirmación.
- La CSP de las páginas usa nonces por respuesta; los documentos solo permiten los dos controladores de impresión conocidos mediante hashes. Estilos inline y WebAssembly están permitidos para la interfaz y la conversión de imágenes; JavaScript inline arbitrario no.

### Actualizar un despliegue existente

Haz una copia verificada y conserva la imagen anterior. Ejecuta `python3 scripts/provision-runtime.py --env-file TU_ENV --project TU_PROYECTO` con PostgreSQL arrancado; no compartas el archivo de entorno. Después reconstruye y recrea `pdf`, `app`, `gateway` y `reminders`. No uses `down -v`. Comprueba inicio de sesión, presupuestos/PDF y creación/cambio de espacios.

### HTTPS y recuperación

`compose.https.yaml` activa cookies Secure, publica HTTPS en 8443 y limita la entrada HTTP de la pasarela a loopback. Antes de activarlo, instala y verifica el certificado de confianza en todos los clientes y configura su dirección HTTPS; los clientes nativos restringen la navegación al servidor configurado. No desactives la validación de certificados.

Las copias locales no cubren pérdida o avería del Mac. Se necesita un destino independiente, cifrado y una restauración comprobada. No se presupone que exista ese destino ni que FileVault esté activado. Las claves de recuperación deben custodiarse fuera del conjunto de copias.

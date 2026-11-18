# Comprobaciones de la edición pública

Revisión inicial: 16 de noviembre de 2026.

- TypeScript: `npm run typecheck`, sin errores.
- Dominio y componentes auxiliares: `npm test`, 140 pruebas superadas.
- Compilación web: `npm run build`, completada.
- Publicación: análisis de archivos versionados, revisión manual de marcas/datos y comparación local contra los secretos del entorno de origen, sin coincidencias. Los secretos nunca se incorporan a este repositorio.
- Instalación inicial: PostgreSQL 17 desechable, arranque web, creación de la primera cuenta, bloqueo hasta cambiar la contraseña e inicialización vacía. Los ejemplos comerciales se cargan explícitamente desde el asistente.
- Navegador: panel, Kanban, empresas desplegables, presupuesto, revisión guardada y documento imprimible con marca Nexo. Captura móvil a 390 × 844.

La prueba local de instalación utilizó la web compilada y una base PostgreSQL aislada; no constituye una validación integral del comando Docker en todos los sistemas. La integración continua comprueba código y compilación en Linux. La impresión física, binarios nativos de esta edición, PWA en iPhone y exposición pública con HTTPS requieren pruebas independientes.

## Configuración y datos comerciales (17 de noviembre de 2026)

- 182 pruebas unitarias, incluidas lectura de Excel, campos, etapas, dependencias, permisos, automatizaciones y moneda del PDF.
- Compilación de producción correcta. Se mantienen dos avisos de trazado dinámico de archivos en el almacenamiento de fotos.
- Prueba HTTP en PostgreSQL desechable: importación, fusión, notas, conflictos, configuración, campos en uso, etapas en uso, desactivar/reactivar módulos, moneda congelada, arranque vacío y carga explícita de ejemplos en otro espacio.
- Revisión de pestañas del asistente con Chrome automatizado a 1440 × 1000 y 390 × 844, sin excepciones de JavaScript ni desbordamiento horizontal del documento.
- Auditoría npm sin vulnerabilidades conocidas después de actualizar las dependencias del lector Excel. No equivale a una auditoría de seguridad completa ni certifica todos los dispositivos.

## Beta 0.2.0-beta.1 (18 de noviembre de 2026)

- 182 pruebas web superadas, compilación de producción y TypeScript correctos en GitHub Actions.
- Clientes Tauri compilados para macOS arm64, macOS x86_64 y Windows x64; pruebas Rust superadas en los tres trabajos. [Compilaciones de escritorio](https://github.com/SleekNekro/nexo-crm/actions/runs/44268287858).
- Android: `assembleRelease` y `lintRelease` correctos. [Compilación Android](https://github.com/SleekNekro/nexo-crm/actions/runs/44269396691). El primer intento falló en la descarga de un paquete retirado del SDK; el workflow corregido solicita paquetes explícitos.
- APK alineado y firmado localmente; verificación criptográfica v2/v3 correcta. Paquete `com.nexo.crm.beta`, versión 0.2.0-beta.1, código 3, Android mínimo 8.
- ZIP de ambos Mac: arquitectura y firma ad hoc comprobadas. Arranque del cliente Apple Silicon en Mac real; la inspección automatizada de su ventana no estuvo disponible.
- Instalador NSIS de Windows generado correctamente. Pendiente comprobar esta beta Nexo en un Windows real, así como cámara, sesión y PDF en Android físico. La validación histórica de SATINE no se extrapola a estos binarios.
- Los paquetes descargables tienen sumas SHA-256; ninguna clave de firma ni datos de empresa se incluyen en la publicación.

## Instalación guiada — beta 0.2.0-beta.2 (18 de noviembre de 2026)

- 182 pruebas web y 9 pruebas Rust: validación de servidor, origen exclusivo del asistente, secretos aleatorios, configuración corrupta, bloqueo de operaciones simultáneas y límites de navegación.
- Imágenes AMD64 y ARM64: instalación desechable, creación de la cuenta elegida, inicio de sesión HTTP, rechazo de sobrescritura de la cuenta, rol PostgreSQL sin privilegios de superusuario y conservación tras detener/arrancar. [Ejecución](https://github.com/SleekNekro/nexo-crm/actions/runs/44285289730).
- Asistente en Chrome con IPC simulado a 720 × 900 y 390 × 844: validación de contraseña repetida, campos vaciados al enviar, iniciar/abrir/detener, conservación del estado de la cuenta, conexión remota, ausencia de Docker, sin errores JavaScript ni desbordamiento horizontal. Esta comprobación no sustituye la interacción con el WebView nativo en un equipo real.
- Las claves de la instalación se generan por usuario; no se reutilizan datos, cuentas ni volúmenes de SATINE. La firma Android sigue realizándose localmente.

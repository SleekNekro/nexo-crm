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

- Descarga anónima de los manifiestos app, PDF y gateway comprobada, con variantes AMD64 y ARM64. Los usuarios no necesitan credenciales de GitHub. [Compilación final de clientes](https://github.com/SleekNekro/nexo-crm/actions/runs/44286638883).

## Primera instalación real en Mac — beta 0.2.0-beta.3 (18 de noviembre de 2026)

- Mac Apple Silicon con Docker Desktop ya instalado y funcionando; configuración de Nexo inicialmente ausente. No se reinstaló Docker ni se reinició su servicio.
- Descubierta y corregida la búsqueda del gestor de credenciales de Docker con un PATH reducido como el de Finder. La aplicación incorpora las carpetas del ejecutable de Docker y su destino real al PATH de sus procesos hijos.
- El usuario completó la preparación en la ventana nativa e inició sesión con la contraseña local de ocho caracteres. La cuenta no requiere otro cambio inicial de contraseña.
- Cuatro contenedores y cuatro volúmenes exclusivos, escucha en loopback y configuración privada con permisos 0600. La cuenta se conserva tras detener y arrancar el proyecto. Esta parada/arranque se ejecutó por CLI; no se automatizó el clic del botón nativo.
- Otro CRM activo mantuvo sus contenedores de producción, imágenes, contadores de reinicio y horas de inicio; continuó respondiendo HTTP 200. Sus volúmenes no se comparten con Nexo.
- 182 pruebas web y 11 pruebas Rust superadas. La integración desechable rechaza siete caracteres, permite crear e iniciar sesión con ocho y conserva la cuenta tras reiniciar, tanto en AMD64 como ARM64.
- La prueba no cubre una instalación nueva de Docker Desktop, los avisos de Gatekeeper de una descarga hecha con navegador ni la instalación completa en un Windows físico.

[Clientes beta 3](https://github.com/SleekNekro/nexo-crm/actions/runs/44292541516) · [Pruebas del servidor con ocho caracteres](https://github.com/SleekNekro/nexo-crm/actions/runs/44291293485).

### Plantilla personalizable por empresa (18 de noviembre de 2026)

- 184 pruebas unitarias pasan, incluida la conservación de la identidad y condiciones en la revisión, escape de textos y caducidad configurable con compatibilidad histórica.
- Compilación de producción correcta.
- Prueba manual asistida en la instalación local de Nexo: carga inicial de ejemplos en un espacio vacío; presupuesto nuevo para una empresa, trato automático, dos productos del catálogo y revisión guardada. Base 57,00 €, IVA 11,97 €, total 68,97 €.
- Revisión visual del documento con logo ficticio, colores, datos del cliente, validez y condiciones personalizadas.
- La imagen local de prueba reutiliza las dependencias Linux de beta.3 con la nueva compilación de la aplicación. Esto no constituye una nueva release pública.
- Detectada y corregida una carrera en Chromium: `load` no garantizaba que el logo estuviera decodificado antes de imprimir. El renderizador espera explícitamente `image.decode()`.
- PDF descargado desde `/api/quote-pdf` y renderizado para inspección: logo presente, datos e importes correctos y sin solapamientos.
- Comprobados Mi cuenta y Volver en viewport móvil de 390 px; apertura del documento en la misma ventana, regreso a la ficha del presupuesto y cierre efectivo de la sesión de prueba.
- Comprobados los cinco contenedores de producción SATINE antes y después: mismos identificadores, fechas de arranque y contadores de reinicio. Solo se actualizaron app y PDF del proyecto local Nexo.
- No sustituye una prueba en un iPhone físico instalado como PWA; queda pendiente comprobar allí el diálogo de impresión del sistema.

### Creador de módulos · primera versión (19 de noviembre de 2026)

- 189 pruebas unitarias pasan y compilación de producción correcta.
- Integración contra PostgreSQL desechable: autenticación, permisos por perfil, origen, validación de campos, conflictos de versiones, conservación de campos archivados, borrado lógico, relaciones restringidas y separación entre espacios.
- Publicación de Equipos mediante el asistente en la instalación local de Nexo. Dos registros ficticios relacionados con las empresas y contactos de demostración; no se sustituyen datos existentes.
- El alcance y los límites de esta primera versión están en `docs/custom-modules.md`.

- Prueba de interfaz automatizada en 390 × 844: asistente, plantilla, publicación, alta, consulta, edición, eliminación, retorno y restauración del desplazamiento. Revisión visual adicional del listado y la ficha con los dos equipos ficticios en Nexo local.

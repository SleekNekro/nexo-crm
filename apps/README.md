# Clientes de Nexo CRM

Todos consumen el mismo servidor. Los cambios web llegan desde él; los cambios del contenedor nativo requieren recompilación e instalación. No se incluyen instaladores de la empresa ni firmas privadas.

## macOS y Windows — Tauri 2

Requiere Node.js, Rust y los requisitos nativos de Tauri para cada sistema. En macOS, las herramientas de Xcode; en Windows, MSVC y WebView2.

```bash
cd apps/desktop
npm ci
npm run build:mac
# En Windows:
npm run build:windows
```

La configuración de ejemplo usa `http://localhost:8180`, válida solo cuando el servidor está en ese equipo. Para otro destino ejecuta desde la raíz `node apps/scripts/configure-desktop.mjs https://crm.example.com`. El archivo local generado nunca se publica. También puede fijarse `NEXO_DEFAULT_SERVER_JSON` al compilar. No desactives la comprobación de certificados.

Identificador propio: `com.nexo.crm`. No sustituye una aplicación empresarial instalada. El código de impresión usa el marcador `NexoDesktop/` para activar el diálogo nativo. Los iconos son gráficos nuevos de esta edición.

## Android — Java / WebView

Abre `apps/android` en Android Studio. Se necesitan JDK 17 o posterior, Android SDK 35 y Gradle 8.11.1. El wrapper se incluye para obtener esa versión; Google puede solicitar aceptar sus condiciones al instalar el SDK.

```bash
cd apps/android
./gradlew assembleRelease -PcrmServer=https://crm.example.com
```

Sustituye el dominio por tu servidor. Release exige HTTPS y necesita una clave propia para distribución. El APK no tiene selector local de servidor. No hay APK público compilado en esta edición. Verifica inicio de sesión, fotos, selector de archivos, impresión, botón Atrás y pérdida de red en un teléfono real.

## iPhone — PWA

La web contiene manifiesto e iconos. Para una instalación con las capacidades esperadas en iPhone debe servirse mediante HTTPS con certificado de confianza. Comprueba sesión, archivos y PDF desde Safari y desde la aplicación añadida a inicio.

## Estado

La validación de esta entrega se centra en la web, el dominio y el arranque aislado. Los clientes nativos se publican como código fuente y requieren compilación y pruebas en sus plataformas; no se afirma que esta marca nueva tenga binarios ya validados.

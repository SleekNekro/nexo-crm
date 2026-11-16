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

**Se puede compilar y ejecutar el cliente en Android 8 o posterior, pero no se entrega un APK listo para instalar.** El teléfono muestra el CRM alojado en tu ordenador o servidor. No ejecuta Next.js, Docker ni PostgreSQL y necesita conexión con ese servidor.

### Preparación

1. Arranca Nexo en el ordenador siguiendo el README principal y completa el primer acceso en el navegador.
2. Abre `apps/android` en Android Studio. Configura JDK 17 o posterior y Android SDK 35. El wrapper incluido descarga Gradle 8.11.1; la instalación del SDK puede solicitar aceptar las condiciones de Google.
3. Configura el SDK desde Android Studio o mediante `ANDROID_HOME`. La dirección del servidor se incorpora al compilar con `-PcrmServer`; no hay selector de servidor dentro del APK. Si omites esa propiedad, la aplicación mostrará que la conexión no está configurada.

### Prueba local por USB, sin publicar el servidor

Conecta un teléfono de prueba con depuración USB activada y autoriza ese ordenador en el teléfono. Los comandos `adb` pertenecen a Android SDK Platform-Tools y deben estar disponibles en la terminal. Con Nexo funcionando en el ordenador en el puerto 8180:

```bash
cd apps/android
./gradlew assembleDebug -PcrmServer=http://127.0.0.1:8180
adb devices
adb reverse tcp:8180 tcp:8180
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

En PowerShell, sustituye `./gradlew` por `.\gradlew.bat`. Los comandos suponen un único dispositivo conectado; si hay varios, selecciona uno con `adb -s SERIAL`.

Abre **NEXO CRM** en el teléfono e inicia sesión con la cuenta creada en tu instalación. `adb reverse` dirige el puerto del teléfono al ordenador; sin ese túnel, `127.0.0.1` se refiere al propio teléfono. El servidor debe seguir encendido y puede ser necesario repetir el túnel tras reconectar el dispositivo.

El APK debug se firma automáticamente con una clave de desarrollo. Esta configuración permite HTTP solo para `127.0.0.1`: cambiar la URL a una IP de la red no basta para habilitar HTTP por Wi-Fi. Para usarlo sin el túnel, utiliza un servidor HTTPS accesible y un certificado de confianza. La variante debug admite una CA instalada por el usuario para pruebas; release usa las autoridades del sistema.

### Distribución con tu propio servidor

Configura un servidor Nexo accesible por HTTPS y sustituye el dominio de ejemplo:

```bash
cd apps/android
./gradlew assembleRelease -PcrmServer=https://crm.example.com
```

**Este comando genera una compilación release sin firmar**, porque el repositorio no incorpora una configuración de firma ni claves privadas. No es un instalador listo para repartir. Para obtener el APK instalable, utiliza Android Studio → **Generate Signed Bundle / APK → APK**, configura tu clave y conserva la misma propiedad `crmServer` durante la compilación (por ejemplo, en tu configuración local de Gradle). Guarda la clave fuera del repositorio y respáldala: las actualizaciones necesitan la misma firma y un `versionCode` mayor.

Release exige HTTPS. Antes de distribuir, comprueba inicio/cierre de sesión, fotos, selector de archivos, impresión/PDF, botón Atrás y pérdida de red en un teléfono real. Esta edición no afirma haber superado esas pruebas en todos los dispositivos.

## iPhone — PWA

La web contiene manifiesto e iconos. Para una instalación con las capacidades esperadas en iPhone debe servirse mediante HTTPS con certificado de confianza. Comprueba sesión, archivos y PDF desde Safari y desde la aplicación añadida a inicio.

## Estado

La validación de esta entrega se centra en la web, el dominio y el arranque aislado. Los clientes nativos se publican como código fuente y requieren compilación y pruebas en sus plataformas; no se afirma que esta marca nueva tenga binarios ya validados.

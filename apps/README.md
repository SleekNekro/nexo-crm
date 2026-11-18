# Clientes de Nexo CRM

Todos consumen el mismo servidor. Los cambios web llegan desde él; los cambios del contenedor nativo requieren recompilación e instalación. Los clientes beta están en [Releases](https://github.com/SleekNekro/nexo-crm/releases). No incluyen el servidor, una base de datos local ni un modo sin conexión. No se incluyen instaladores de la empresa ni firmas privadas.

## Instalación guiada desde 0.2.0-beta.2

En Mac y Windows puedes elegir **Probar en este ordenador**. Nexo comprueba Docker Desktop, descarga los componentes ya compilados, prepara una base de datos independiente y crea tu cuenta con la contraseña que elijas. Incluye Iniciar, Detener y Abrir CRM. No necesita Git, Python ni comandos. [Guía paso a paso](../docs/desktop-quickstart.md).

**Tengo un servidor** conserva la conexión directa para equipos y clientes móviles. Las instalaciones locales existentes mantienen sus versiones y sus datos; esta beta no implementa actualización automática del servidor.

## Instalar la beta

1. Instala y arranca el servidor según el README principal; prepara HTTPS para datos reales y móviles.
2. Descarga el ZIP correspondiente al procesador del Mac, el instalador Windows x64 o el APK Android.
3. Mac: descomprime y mueve NEXO CRM a Aplicaciones. Windows: ejecuta el instalador. Android: abre el APK y autoriza esa fuente de instalación.
4. Al abrir por primera vez, escribe la URL de tu servidor e inicia sesión. `localhost` solo sirve si el servidor está en ese mismo ordenador.

Los ZIP de Mac llevan firma ad hoc, sin notarización Apple; Windows no lleva firma comercial. Consulta las [notas de la beta](../docs/release-notes/v0.2.0-beta.1.md) antes de autorizar avisos de seguridad. No desactives las protecciones del sistema globalmente. Android usa una clave exclusiva de Nexo Beta y el identificador `com.nexo.crm.beta`.

Comprueba el archivo con `shasum -a 256 archivo` en macOS, o `Get-FileHash archivo -Algorithm SHA256` en PowerShell, y compara con `SHA256SUMS.txt` de la release.

Si te equivocas al conectar, en Android utiliza **Conexión** (cierra la sesión local). En escritorio, cierra la app y corrige `server.json` mediante el script indicado abajo; también puedes borrar ese archivo para recuperar la pantalla inicial. No borres los datos del servidor.

## macOS y Windows — Tauri 2

Requiere Node.js, Rust y los requisitos nativos de Tauri para cada sistema. En macOS, las herramientas de Xcode; en Windows, MSVC y WebView2.

```bash
cd apps/desktop
npm ci
npm run build:mac
# En Windows:
npm run build:windows
```

La primera apertura permite indicar la URL y autorizar explícitamente HTTP únicamente en una red privada o loopback. Para pruebas en el mismo equipo puedes usar `http://localhost:8180`. Para otro destino ejecuta desde la raíz `node apps/scripts/configure-desktop.mjs https://crm.example.com`. El archivo local generado nunca se publica. También puede fijarse `NEXO_DEFAULT_SERVER_JSON` al compilar. No desactives la comprobación de certificados.

Identificador propio: `com.nexo.crm`. No sustituye una aplicación empresarial instalada. El código de impresión usa el marcador `NexoDesktop/` para activar el diálogo nativo. Los iconos son gráficos nuevos de esta edición.

## Android — Java / WebView

**Hay un APK beta experimental para Android 8 o posterior en Releases.** El teléfono muestra el CRM alojado en tu ordenador o servidor. No ejecuta Next.js, Docker ni PostgreSQL y necesita conexión con ese servidor.

### Preparación

1. Arranca Nexo en el ordenador siguiendo el README principal y completa el primer acceso en el navegador.
2. Abre `apps/android` en Android Studio. Configura JDK 17 o posterior y Android SDK 35. El wrapper incluido descarga Gradle 8.11.1; la instalación del SDK puede solicitar aceptar las condiciones de Google.
3. Configura el SDK desde Android Studio o mediante `ANDROID_HOME`. La dirección se elige en la primera apertura; opcionalmente puedes fijar un valor inicial con `-PcrmServer`.

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

La compilación release necesita firma. El workflow genera un APK sin firmar para su revisión y firma local con `apksigner`; ese artefacto intermedio no es instalable y no debe publicarse. La clave nunca se envía a GitHub ni se incluye en Git o en los artefactos. Para compilar tu variante, crea tu propia clave con alias `nexo-beta` y proporciona las variables de entorno `ANDROID_KEYSTORE_PATH` y `ANDROID_KEYSTORE_PASSWORD`. Conserva una copia segura: las actualizaciones requieren la misma firma y un `versionCode` mayor. No utilices la firma de otra empresa o proyecto.

Release exige HTTPS. Antes de distribuir, comprueba inicio/cierre de sesión, fotos, selector de archivos, impresión/PDF, botón Atrás y pérdida de red en un teléfono real. Esta edición no afirma haber superado esas pruebas en todos los dispositivos.

## iPhone — PWA

La web contiene manifiesto e iconos. Para una instalación con las capacidades esperadas en iPhone debe servirse mediante HTTPS con certificado de confianza. Comprueba sesión, archivos y PDF desde Safari y desde la aplicación añadida a inicio.

## Estado

El workflow `Release beta` comprueba la web, ejecuta las pruebas Rust de escritorio, compila ambos Mac y Windows, y compila y analiza Android. Después se firma el APK localmente, se verifican los paquetes y se publican manualmente con sumas SHA-256. Estas comprobaciones no equivalen a validación funcional de inicio de sesión, cámara y PDF en cada sistema: la beta requiere pruebas reales, especialmente Android.

La publicación se ejecuta manualmente en GitHub Actions. Para una siguiente beta, incrementa las versiones de los paquetes, Cargo, Tauri y Android (también `versionCode`), añade sus notas y crea un nuevo tag al publicar. La opción `android_only` permite recompilar únicamente Android. No reemplaces artefactos de una versión ya publicada.

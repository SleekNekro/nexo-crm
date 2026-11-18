# Probar Nexo sin programar

El asistente está disponible desde **0.2.0-beta.2**, para Mac Intel, Mac Apple Silicon y Windows x64. Android e iPhone se conectan a un servidor existente; no lo instalan en el móvil.

## Primera instalación

1. Descarga la aplicación de tu equipo desde [Releases](https://github.com/SleekNekro/nexo-crm/releases). En Mac, descomprime el ZIP y lleva NEXO CRM a Aplicaciones; en Windows, ejecuta el instalador.
2. Abre Nexo y elige **Probar en este ordenador**.
3. Si falta Docker Desktop, pulsa **Descargar Docker Desktop**. Instálalo siguiendo sus indicaciones y condiciones de licencia; ábrelo y espera a que arranque. En Windows puede pedir WSL2, virtualización o reiniciar el ordenador; utiliza contenedores Linux.
4. Vuelve a Nexo y pulsa **Comprobar**. Elige tu contraseña (de 12 a 128 caracteres), repítela y pulsa **Preparar mi CRM**.
5. Espera a que se descarguen y arranquen los componentes. Necesitas Internet y varios GB libres la primera vez; no hace falta instalar Git, Python ni herramientas de programación.
6. Pulsa **Abrir CRM**. Tu usuario inicial es **developer** y la contraseña es la que acabas de elegir.
7. Dentro del CRM, pulsa **Preparar mi CRM** para configurar tu negocio. Puedes empezar vacío o cargar ejemplos ficticios.

La contraseña elegida se transmite al proceso local por su entrada estándar, nunca como argumento de un comando ni en un archivo. En la base de datos solo se guarda su hash.

## Volver a usarlo

Abre Docker Desktop y Nexo. Pulsa **Iniciar servidor** y después **Abrir CRM**. Si el servidor ya está arrancado, puedes abrirlo directamente.

Desde el CRM, el menú **CRM → Conexión y servidor local** vuelve al panel. Al cerrar la ventana del CRM reaparece el panel. **Detener servidor** conserva cuentas, fotos y datos; cerrar la aplicación no detiene automáticamente el servidor. No borres los volúmenes de Docker si quieres conservar tu instalación.

Si una descarga o el arranque falla, corrige la conexión o el estado de Docker y vuelve a intentarlo. No necesitas borrar la instalación. Si la cuenta ya existe, el asistente no la sobrescribe ni cambia su contraseña.

## ¿Dónde se guarda?

La configuración pertenece a tu usuario del sistema, dentro de la carpeta de configuración de Nexo, subcarpeta `local-server`. Los datos se guardan en volúmenes Docker independientes, con un nombre de proyecto generado para esa instalación. El asistente no detiene otros proyectos Docker.

La prueba escucha únicamente en **este ordenador**. El asistente busca un par de puertos libres y muestra la dirección resultante. No sirve para conectarse directamente desde un móvil u otro PC; para compartir el CRM instala un servidor de red con HTTPS y conecta los clientes con **Tengo un servidor**.

## Límites de esta beta

- Docker Desktop sigue siendo un requisito externo y puede necesitar permisos del sistema para instalarse.
- Mac todavía no tiene notarización de Apple y Windows no tiene firma comercial. Consulta las notas de la release si aparece un aviso; no desactives globalmente la seguridad del sistema.
- El asistente conserva las versiones de servidor de la instalación existente: todavía no realiza migraciones automáticas a nuevas versiones ni ofrece copias de seguridad desde esta pantalla.
- La compilación y las pruebas automatizadas no sustituyen la prueba completa en cada equipo real.

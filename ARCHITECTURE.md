# Arquitectura de Nexo CRM

## Contexto y objetivo

Nexo está orientado a pymes y busca adaptarse a distintos negocios manteniendo una interfaz sencilla. La demostración actual modela una empresa ficticia de construcción/revestimientos: las obras, mediciones y partes responden a ese ejemplo y no son requisitos de todos los sectores.

Las funciones comerciales constituyen una base reutilizable. La configuración de campos, etapas, módulos existentes y reglas comerciales se guarda por empresa. Añadir nuevos tipos de sección o un motor de plugins sigue siendo una evolución prevista.

## Capas

- `src/domain`: modelos, cálculos, transiciones comerciales, permisos y reglas de partes/obras. Funciones comprobables sin interfaz.
- `src/application`: autorización, coordinación de guardados, reglas de negocio y auditoría.
- `src/infrastructure`: PostgreSQL, almacenamiento de fotos, catálogo, sesiones, cifrado y espacios.
- `src/presentation`: pantallas React, formularios, Kanban, hooks y documentos imprimibles.
- `app`: rutas Next.js, API, manifiesto PWA y estilos compartidos.
- `services/gateway`: proxy Node independiente con configuración persistente y control autenticado.
- `apps`: clientes Tauri y Android conectados al servidor.

Es una arquitectura por capas en evolución, no una aplicación totalmente desacoplada: algunos módulos coordinadores aún son grandes y parte del estado se intercambia como colecciones.

## Datos y espacios

Los registros comerciales se persisten en tablas por entidad. Las cuentas y membresías son globales; cada espacio adicional utiliza un esquema de PostgreSQL distinto. El espacio inicial ficticio se llama Nexo. Las fotos viven en almacenamiento separado, con rutas por espacio y autorización al leerlas.

Los permisos se verifican en servidor; ocultar un botón no es una barrera de seguridad. Las cuentas pueden ser desarrollador, administrador, comercial u operario, con permisos personalizados y asignaciones.

## Flujo comercial

Empresa → presupuesto/trato → revisión emitida → enviado/seguimiento → aceptado/pedido → obra opcional.

Las revisiones conservan una instantánea para que un PDF histórico no cambie por ediciones posteriores. Los importes se calculan por partidas, descuento e impuesto. La confirmación de partes alimenta horas/costes y el avance por partidas evita duplicar mediciones acumuladas.

## Sesiones y conexión

Las contraseñas se derivan con scrypt y sal individual. El servidor almacena hashes de tokens de sesión, limita intentos y soporta TOTP. Los secretos TOTP se cifran usando la clave de la instalación.

El repositorio entrega código fuente de los clientes, no instaladores. En Android se compila un APK indicando la dirección del servidor; el backend y PostgreSQL se ejecutan fuera del teléfono.

Los clientes nativos cargan la web del servidor y restringen la navegación. La impresión del documento utiliza el diálogo nativo cuando corresponde. No hay base de datos embebida ni sincronización offline.

La pasarela verifica el destino con una prueba firmada antes de permitir un cambio global. Solo el desarrollador accede al control. Su volumen de configuración y las claves forman parte de una futura estrategia de recuperación; los scripts históricos de copia no cubren automáticamente la configuración del gateway ni un backend remoto.

## Decisiones y límites

- Una sola aplicación web reduce duplicación de lógica entre plataformas.
- PostgreSQL y Docker permiten mover el servicio sin introducir un proveedor obligatorio.
- Los clientes dependen de la disponibilidad de la red y del servidor.
- La demo usa HTTP exclusivamente en localhost. La publicación en Internet requiere HTTPS y revisión operativa.
- No hay actualizador nativo, paquetes firmados de esta edición ni prueba certificada en todas las plataformas.
- El código incluye pruebas automatizadas; eso no sustituye una auditoría ni valida por sí mismo cada dispositivo.

## Importación e historial comercial

`commercial-import.ts` analiza CSV, relaciona columnas y detecta coincidencias; `commercial-merge.ts` prepara la fusión y conserva instantáneas de documentos. Estas funciones del dominio no acceden a la base de datos.

`/api/commercial-data` comprueba permisos y espacio, bloquea el estado y exige la versión de la vista previa antes de confirmar. Guarda entidades y auditoría en la misma transacción. `crm_commercial_data_audit` conserva las fichas originales y el resultado; no es un mecanismo automático de reversión.

`/api/company-history` combina notas de empresa con datos comerciales autorizados. `crm_company_notes` referencia la empresa y conserva autor y fecha; la fusión reasigna estas notas y el guardado ordinario impide eliminar empresas que las tengan. Ambas tablas se inicializan por espacio; las notas se crean después de migrar las tablas de entidades.

Los componentes `commercial-data-tools.tsx` y `company-history.tsx` presentan vistas previas e historial. La guía de uso y límites está en [docs/commercial-data.md](docs/commercial-data.md).

## Configuración de negocio

`crm_workspaces.settings` guarda una configuración JSON versionada junto a la identidad del espacio. `/api/business-settings` la valida y solo admite cambios del desarrollador. Comparte el bloqueo del estado comercial para comprobar referencias en uso y evitar que un guardado concurrente elimine un campo o fase que se acaba de utilizar.

`business-settings.ts` define límites, dependencias y validación de campos y etapas. Los valores personalizados viven en `customFields` de empresas, contactos y tratos. `pipelinePhase` referencia una etapa configurada; `stage` conserva el significado comercial estable utilizado por pedidos y estadísticas.

Los permisos incorporan los módulos activos. La ocultación de interfaz no sustituye las restricciones del servidor. Las reglas de envío reciben la configuración tanto desde el guardado comercial como desde la reconciliación SMTP. Las nuevas instalaciones se inicializan vacías; cargar ejemplos es una acción explícita del asistente.

La moneda pertenece a la marca y queda congelada en la revisión. La interfaz utiliza un hook por contexto de empresa, sin variables globales de moneda compartidas entre peticiones.

Excel se analiza bajo demanda en el navegador con ExcelJS; fflate comprueba los límites del ZIP antes de cargarlo. No se ejecutan fórmulas y el servidor vuelve a validar el CSV normalizado y sus filas antes de escribir. La guía de funciones y límites está en [docs/business-configuration.md](docs/business-configuration.md).

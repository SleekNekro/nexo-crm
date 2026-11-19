# Configurar Nexo para tu negocio

Entra con el perfil **Desarrollador** y pulsa **Preparar mi CRM** o **Configurar negocio** en la cabecera. La configuración pertenece a la empresa seleccionada. No modifica los otros espacios ni da permisos adicionales a otras cuentas.

## Asistente inicial

Recorre las secciones con **Continuar** y **Anterior**. Al final, **Guardar y abrir mi CRM** guarda y recarga la aplicación: termina antes cualquier formulario abierto.

1. **Identidad:** nombre, logo PNG/JPEG/WebP (hasta 180 KB), tres colores y moneda EUR, USD o GBP. Los datos fiscales opcionales aparecen en los documentos.
2. **Módulos:** elige las funciones que necesitas. Las dependencias se activan juntas y se explican en pantalla.
3. **Campos:** añade datos específicos del negocio a empresas, contactos y tratos.
4. **Etapas:** adapta los nombres, colores y orden del proceso comercial.
5. **Automatizaciones:** activa las reglas que te ahorren trabajo.
6. **Equipo y correo:** crea cuentas de administrador o comercial y configura tu correo usando las plantillas de proveedor. Cada usuario configura su propio remitente. Las cuentas y el correo se guardan inmediatamente; no dependen del botón final del asistente. Los operarios y permisos detallados siguen en Equipo.
7. **Empezar:** una instalación nueva comienza vacía. Puedes cargar ejemplos ficticios una sola vez o conservar sus datos actuales. Si ya hay registros, el asistente nunca los borra ni los sustituye por ejemplos.

Las instalaciones existentes conservan sus datos al actualizar. Las tablas y columnas necesarias se crean al iniciar el servidor. Haz una copia de seguridad antes de actualizar y reconstruye la aplicación con las nuevas dependencias.

## Campos personalizados

Hasta 30 campos por empresa, con nombre, ficha de destino y tipo: texto, fecha, número o desplegable. Son opcionales. Los desplegables admiten hasta 50 opciones.

Los campos aparecen al crear o editar una ficha; sus valores se ven en el detalle. Si un campo tiene valores, puedes **archivarlo**, pero no eliminarlo ni cambiar de tipo o ficha. Tampoco puedes quitar una opción que esté en uso. Archivar oculta el campo del formulario y conserva su contenido. No se imprimen automáticamente en el PDF ni se importan desde columnas personalizadas.

Al fusionar fichas se conservan los campos exclusivos de ambas; en un conflicto prevalece el valor del destino y el original permanece en la auditoría de la fusión.

## Etapas del proceso comercial

Hay cuatro significados base: **En preparación**, **Pendiente del cliente**, **Ganado** y **Perdido**. Puedes cambiar sus nombres visibles, colores y orden. Puedes añadir etapas abiertas de preparación o espera, hasta un total de 12.

El Kanban y el selector del trato utilizan estas etapas. Los identificadores internos no cambian al renombrarlas. Ganado y Perdido conservan su significado y solo hay una de cada una, para mantener consistentes cierres, pedidos y estadísticas. Una etapa con tratos no se puede quitar: muévelos primero. Los informes que agrupan estados comerciales siguen agrupando por el significado base.

## Módulos

Puedes activar Contactos, Tratos, Presupuestos, Pedidos, Catálogo, Actividades, Obras y Análisis. Empresas, Mi día y Equipo son la base de la aplicación.

Presupuestos necesita Contactos y Tratos; Presupuestos y Pedidos van juntos porque aceptar un presupuesto genera un pedido. Análisis necesita el conjunto comercial. El selector activa las dependencias y desactiva los módulos que ya no pueden funcionar al retirar una de ellas.

Desactivar un módulo conserva sus registros, reduce menús y formularios y bloquea sus lecturas y acciones en el servidor, incluso para el desarrollador. Reactivarlo recupera sus datos. Los permisos y la cartera de cada cuenta siguen aplicándose.

Un CRM con solo Tratos puede cerrar oportunidades sin partidas ni pedidos. Si un trato ya tiene documentación económica oculta, hay que reactivar Presupuestos para cambiar su estado: no se permite alterar documentos a ciegas.

## Automatizaciones disponibles

Son tres reglas predefinidas, configurables sin escribir código:

- **Al enviar un presupuesto, pasar a pendiente del cliente.** Utiliza la etapa base de espera.
- **Al enviar un presupuesto, crear seguimiento.** Requiere Actividades. Puedes cambiar el título y los días laborables sugeridos (0–90, sin calendario de festivos); la fecha se puede ajustar en cada envío. Se aplica tanto al envío SMTP como al registro manual.
- **Al ganar un trato, activar al posible cliente.** No reemplaza estados como «Cliente inactivo» elegidos manualmente.

Se aplican a eventos nuevos, no de forma retroactiva. Reintentar el mismo envío no duplica el seguimiento. No es todavía un editor de reglas arbitrarias: no admite condiciones libres, scripts, webhooks ni secuencias de campañas.

## Moneda y documentos

La moneda se utiliza al presentar importes y en las nuevas instantáneas de presupuesto. No convierte precios ni mezcla divisas. No se puede cambiar después de emitir presupuestos; utiliza otro espacio si necesitas operar con otra moneda. Los PDF históricos conservan la marca y moneda de su revisión.

## Actualizaciones y comprobación

La configuración usa control de versión para rechazar guardados concurrentes. Otras sesiones consultan cambios al recuperar el foco y periódicamente, sin recargar la página ni perder el formulario abierto. La comprobación pasiva no prolonga la sesión. El servidor aplica los permisos actuales en cada operación.

`npm test` cubre las reglas de configuración y la lectura de Excel. `tests/commercial-data.integration.mjs` añade comprobaciones HTTP sobre una base desechable, incluidas protección del historial, campos, etapas, moneda y desactivación/reactivación de módulos. Consulta sus requisitos en [la guía comercial](commercial-data.md).

## Plantilla de presupuesto por empresa

En **Configurar negocio → Identidad** se cargan el logo (PNG, JPG o WebP, hasta 180 KB), colores, razón social y datos de contacto. En **Plantilla de presupuesto** se ajustan la validez (1–365 días), las condiciones y forma de pago y las observaciones al pie. La vista previa usa datos ficticios y el mismo generador de documentos que el PDF.

Cada revisión guarda una copia de estos ajustes: cambiar la empresa no altera el logo, los textos ni la validez de las revisiones anteriores. La caducidad en la lista respeta la validez de la revisión; los documentos históricos sin este ajuste conservan 30 días. La moneda no se puede cambiar si ya hay presupuestos emitidos.

Para probar una instalación vacía, el último paso del asistente permite **Cargar ejemplos ficticios**. No sustituye datos existentes ni envía correos. Después, crea un presupuesto desde una empresa, añade productos y pulsa **Guardar revisión y abrir PDF**.

## Navegación en móvil y PWA

**Cerrar sesión** está dentro de **Mi cuenta**. Los formularios y la ficha del trato tienen un botón **Volver** visible al desplazarse; conservan las comprobaciones de cambios sin guardar. El documento del presupuesto se abre en la misma ventana y ofrece **Volver al presupuesto**, también sin los controles del navegador. La impresión conserva el comportamiento nativo en escritorio.

El servicio PDF espera a que el logo termine de decodificarse antes de imprimir: si la imagen no puede cargarse, falla la generación en lugar de entregar silenciosamente un documento sin logo.

# Creador de módulos sin programación · primera versión

Disponible en el menú **Crear y gestionar módulos**, solo para el desarrollador. Cada empresa tiene sus propias definiciones y registros.

## Crear un módulo

1. Pulsa **Crear módulo** y elige la plantilla **Equipos** o empieza vacío.
2. Escribe nombre, descripción e icono. Todo registro tiene un nombre obligatorio.
3. Añade hasta 20 campos: texto, número, importe, fecha, desplegable, casilla, empresa o contacto. Marca los obligatorios.
4. Configura los permisos por perfil: consultar, crear, modificar y eliminar. Modificar requiere también consultar. El desarrollador conserva acceso a los módulos activos.
5. Revisa la vista previa y publica. Aparece una entrada en el menú con listado, búsqueda y fichas.

**Equipos** propone número de serie, empresa cliente, contacto, responsable (texto), próxima revisión y estado. No carga registros ni modifica empresas automáticamente. Puedes usar las empresas ficticias del asistente inicial para probar las relaciones.

## Uso diario

Abre el módulo y pulsa **Añadir registro**. Desde una ficha puedes editar o eliminar si tu perfil lo permite. **Volver** respeta los cambios sin guardar. El listado busca por nombre y valores visibles, incluidos nombres de las empresas y contactos relacionados. **Actualizar** recoge los cambios de otras personas sin recargar el resto del CRM.

Los permisos de esta versión son por perfil y módulo, no por usuario o por propietario del registro. Con permiso de consulta se ven los registros del módulo de la empresa actual; un registro relacionado con una empresa o contacto al que no tienes acceso queda oculto. No se amplían los permisos de los módulos comerciales. Si se elimina la ficha relacionada, aparece «Referencia no disponible»; el registro propio conserva su información.

## Conservación y límites

- Desactivar oculta el menú y bloquea lectura y edición por API; conserva los registros.
- Archivar un campo lo oculta y conserva sus valores. No se puede quitar un campo con datos, cambiar su tipo o eliminar opciones utilizadas.
- Antes de hacer obligatorio un campo hay que completar los registros existentes.
- Eliminar un registro realiza un borrado lógico. No hay todavía una papelera de restauración en la interfaz.
- Las ediciones usan versiones: si otra persona guardó antes, debes volver a abrir el registro. No se sobrescriben cambios silenciosamente.
- Hasta 30 módulos por empresa, 20 campos por módulo, 40 opciones por desplegable. El listado carga como máximo los 1000 registros más recientes y lo indica; la búsqueda opera sobre esa lista.
- No hay código, fórmulas, SQL ni scripts introducidos por el usuario. Las definiciones son datos validados por el servidor.

## Arquitectura

`src/domain/custom-modules.ts` define tipos, permisos y validación. `app/api/custom-modules/route.ts` controla autenticación, origen, empresa, permisos, concurrencia y relaciones visibles. `crm_custom_modules` y `crm_custom_records` viven en el esquema PostgreSQL del espacio seleccionado. Los datos no se mezclan con las colecciones fijas del CRM y quedan incluidos en las copias completas de PostgreSQL. Los eventos de configuración y cambios se registran en la auditoría sin copiar el contenido de los campos.

La presentación se divide entre `custom-module-builder.tsx` (asistente) y `custom-modules.tsx` (menú, listado y fichas). Los diálogos usan portales para aparecer correctamente en móvil, fuera del menú plegable.

## Pendiente, no implementado

Kanban y calendario personalizados, selección de columnas, permisos individuales y por registro, papelera, relaciones entre módulos propios, adjuntos, importación/exportación, automatizaciones del módulo y editor de diseño. Esta versión permite crear fichas y trabajar con ellas; no es un generador completo de aplicaciones.

## Verificación

Pruebas unitarias: `npm test`. La integración `tests/custom-modules.integration.mjs` solo admite una base desechable llamada `nexo_modules_check` y un servidor local indicado por `CRM_TEST_URL`. Comprueba permisos, origen, validación, versiones, archivado, borrado lógico y separación entre empresas. Nunca ejecutarla contra una instalación real.

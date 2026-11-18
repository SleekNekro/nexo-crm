# Empresas, contactos e historial

Estas funciones están disponibles en el código de Nexo CRM. Para incorporarlas a una instalación existente hay que reconstruir y reiniciar el servidor; las tablas nuevas se crean automáticamente al inicializar cada espacio. Conserva una copia de seguridad antes de actualizar.

Desde la lista de empresas se muestran los contadores de actividades pendientes, vencidas y presupuestos pendientes antes de desplegar cada ficha.

## Importar sin sobrescribir fichas

1. En **Empresas** o **Contactos**, pulsa **Importar empresas / contactos**.
2. Elige el tipo de registro. Puedes descargar una plantilla de ejemplo.
3. Selecciona un Excel `.xlsx` o CSV UTF-8 con cabecera: máximo 1 MB y 1.000 filas. Admite punto y coma, coma o tabulador como separador, y campos entre comillas.
4. Revisa la correspondencia entre columnas. Para empresas, selecciona un responsable activo.
5. Genera la vista previa, revisa los errores y selecciona las filas que quieres importar.
6. Confirma la importación. No se sobrescriben registros existentes.

Excel `.xlsx` se lee localmente en el navegador. Si hay varias hojas visibles, selecciona la que quieres importar. Los archivos con fórmulas se rechazan: pega sus valores antes de importarlos. Los formatos antiguos `.xls`, macros y libros cifrados no están admitidos; puedes exportarlos como CSV UTF-8. Hay límites adicionales de 30 columnas, 20 hojas y 16 MB descomprimidos.

Importa primero las empresas. Los contactos se vinculan por nombre o CIF de empresa; si hay varias coincidencias, utiliza un CIF único. El nombre es obligatorio y los contactos necesitan una empresa existente. El estado comercial por defecto es «Posible cliente».

Los posibles duplicados se detectan por nombre normalizado y por los identificadores de contacto disponibles. Se omiten las filas con coincidencias o errores, incluidas las repetidas dentro del archivo. Revisa las coincidencias: una sugerencia no demuestra que sean la misma entidad.

## Fusionar duplicados

Pulsa **Fusionar duplicados**, selecciona la ficha duplicada y después la que quieres conservar. La vista previa permite elegir los valores de cada campo y consultar las relaciones afectadas. Si cambias un valor, vuelve a revisar antes de confirmar.

La ficha duplicada desaparece de la lista. Sus contactos y tratos pasan a la ficha conservada; las actividades, notas, pedidos y relaciones con proyectos se mantienen. Los contactos solo pueden fusionarse dentro de una misma empresa. Si ambas empresas están duplicadas, fusiónalas primero.

Las revisiones de presupuestos conservan el cliente y contacto originales en su instantánea: un PDF histórico no se reescribe con los nuevos datos. Los registros originales y el resultado de la fusión quedan en **Historial de importaciones y fusiones**. No hay un botón de deshacer la fusión.

Si otra persona cambia los datos después de la vista previa, la operación se rechaza y pide generar una nueva. La escritura y su auditoría se guardan en una misma transacción.

## Conversaciones en la ficha de empresa

**Historial y conversaciones** reúne notas de empresa, notas de los tratos visibles, actividades completadas, revisiones de presupuesto emitidas y correos de presupuestos enviados desde Nexo. Permite añadir una nota, llamada, reunión o correo registrado manualmente sin crear un trato. Se guardan autor y fecha automáticamente.

Registrar una conversación no envía correo ni programa una actividad. Esta pantalla tampoco sincroniza una bandeja de entrada. Los mensajes enviados muestran el registro del envío, no una confirmación de lectura o entrega al destinatario.

Una empresa con notas de seguimiento no se puede eliminar mediante el borrado ordinario. Se puede fusionar para conservar ese historial.

## Permisos y separación de datos

Importar empresas requiere un perfil administrador o desarrollador, permiso para gestionar empresas y acceso a Empresas. Para importar contactos también necesitas Contactos. La fusión y su auditoría requieren además acceso a Contactos, Tratos, Presupuestos, Actividades y Pedidos: así no revelan relaciones de módulos prohibidos.

El historial ordinario respeta las empresas y módulos visibles de cada cuenta. Añadir notas requiere permiso para gestionar empresas. Todo se guarda dentro del espacio activo; no se mezclan empresas de espacios distintos.

## Pendiente

- Actualización masiva de fichas existentes mediante archivo.
- Deshacer fusiones desde la interfaz.
- Sincronización de correo recibido.

## Comprobaciones para desarrollo

`npm test` incluye los casos del parser, validación, duplicados y conservación de relaciones e instantáneas. `npm run build` comprueba también los tipos y las rutas nuevas.

Para probar la API, utiliza `tests/commercial-data.integration.mjs` con un servidor Nexo aislado y una base vacía llamada exactamente `nexo_commercial_check`. Define `DATABASE_URL` y `CRM_TEST_URL` tanto para el servidor como para la prueba. El test rechaza otros nombres de base y direcciones web no locales; crea cuentas ficticias y no debe ejecutarse contra una instalación real. Elimina el servidor y la base de prueba al terminar.

```sh
node tests/commercial-data.integration.mjs
```

Comprueba importación de empresas y contactos, fusión con notas, reintentos sin duplicación, protección del borrado, vista previa caducada, permisos, origen de peticiones y espacio activo. No sustituye la revisión visual en móvil o escritorio.

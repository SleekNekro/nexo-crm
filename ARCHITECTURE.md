# Arquitectura de Nexo CRM

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

Los clientes nativos cargan la web del servidor y restringen la navegación. La impresión del documento utiliza el diálogo nativo cuando corresponde. No hay base de datos embebida ni sincronización offline.

La pasarela verifica el destino con una prueba firmada antes de permitir un cambio global. Solo el desarrollador accede al control. Su volumen de configuración y las claves forman parte de una futura estrategia de recuperación; los scripts históricos de copia no cubren automáticamente la configuración del gateway ni un backend remoto.

## Decisiones y límites

- Una sola aplicación web reduce duplicación de lógica entre plataformas.
- PostgreSQL y Docker permiten mover el servicio sin introducir un proveedor obligatorio.
- Los clientes dependen de la disponibilidad de la red y del servidor.
- La demo usa HTTP exclusivamente en localhost. La publicación en Internet requiere HTTPS y revisión operativa.
- No hay actualizador nativo, paquetes firmados de esta edición ni prueba certificada en todas las plataformas.
- El código incluye pruebas automatizadas; eso no sustituye una auditoría ni valida por sí mismo cada dispositivo.

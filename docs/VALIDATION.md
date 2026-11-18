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

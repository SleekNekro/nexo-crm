# Comprobaciones de la edición pública

Revisión inicial: 16 de noviembre de 2026.

- TypeScript: `npm run typecheck`, sin errores.
- Dominio y componentes auxiliares: `npm test`, 140 pruebas superadas.
- Compilación web: `npm run build`, completada.
- Publicación: análisis de archivos versionados, revisión manual de marcas/datos y comparación local contra los secretos del entorno de origen, sin coincidencias. Los secretos nunca se incorporan a este repositorio.
- Instalación inicial: PostgreSQL 17 desechable, arranque web, creación de la primera cuenta, bloqueo hasta cambiar la contraseña e inicialización de cinco empresas y seis productos ficticios.
- Navegador: panel, Kanban, empresas desplegables, presupuesto, revisión guardada y documento imprimible con marca Nexo. Captura móvil a 390 × 844.

La prueba local de instalación utilizó la web compilada y una base PostgreSQL aislada; no constituye una validación integral del comando Docker en todos los sistemas. La integración continua comprueba código y compilación en Linux. La impresión física, binarios nativos de esta edición, PWA en iPhone y exposición pública con HTTPS requieren pruebas independientes.

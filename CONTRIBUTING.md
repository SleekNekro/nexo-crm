# Contribuir a Nexo CRM

Gracias por probar Nexo. Puedes descargarlo, hacer un fork y adaptarlo libremente bajo MIT. No necesitas aportar tus cambios para usarlo, aunque compartirlos ayuda a otras personas.

## Proponer o corregir

1. Para una funcionalidad grande, abre primero un issue con el problema y un ejemplo de uso. La futura configuración modular sin código todavía necesita diseño; no asumas que existe un contrato de plugins.
2. Haz un fork y crea una rama para un cambio concreto.
3. Usa únicamente datos ficticios. Nunca añadas credenciales, copias de bases, documentos de clientes o claves de firma.
4. Ejecuta `npm ci`, `npm run typecheck`, `npm test` y `npm run build`.
5. Revisa el diff y ejecuta `npm run audit:public` sobre los archivos que Git va a publicar. Este análisis no sustituye la revisión manual.
6. Abre una pull request explicando el problema, el cambio, cómo lo has probado y cualquier limitación. Para cambios visuales, adjunta capturas de escritorio y móvil.

Puedes contribuir con documentación, pruebas, accesibilidad y reportes de errores además de código. Indica si utilizaste asistencia de IA y revisa el resultado antes de enviarlo.

Las contribuciones aceptadas se distribuyen bajo la misma licencia MIT. No incluyas código o recursos que no tengas derecho a compartir. No se garantiza un plazo de revisión ni soporte comercial.

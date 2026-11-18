# Componentes de terceros

La licencia MIT del repositorio se aplica al código propio. Las dependencias conservan sus licencias y avisos. Las versiones resueltas están en los lockfiles de npm y Cargo; Android declara sus dependencias en Gradle.

- Next.js, React, TypeScript, node-postgres y lucide-react: consultar las licencias incluidas en sus distribuciones.
- Tauri y sus dependencias Rust: consultar Cargo.lock y las licencias de cada crate.
- HEIC: se conserva el aviso de `public/licenses/heic-to.txt`, incluida la información sobre libheif y sus dependencias.
- Gradle Wrapper: herramienta de Gradle bajo Apache-2.0; no forma parte del código original del autor.
- Android SDK y herramientas de Apple/Microsoft no se redistribuyen: requieren sus términos respectivos.

Los logotipos e iconos Nexo se han creado para esta demostración. No se distribuyen marcas, catálogos ni instaladores empresariales.

## Lectura de Excel

- [ExcelJS](https://github.com/exceljs/exceljs), licencia MIT: lectura de libros `.xlsx`.
- [fflate](https://github.com/101arrowz/fflate), licencia MIT: validación de límites de archivos ZIP antes de leer el libro.

La dependencia `uuid` de ExcelJS se fija mediante `overrides` a una versión corregida compatible con su uso; revisar este ajuste al actualizar ExcelJS.

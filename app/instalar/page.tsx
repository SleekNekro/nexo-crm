export default function InstallPage() {
  return (
    <main className="authscreen">
      <section className="card authcard">
        <img src="/brand/nexo-logo.svg" alt="NEXO" width="160" />
        <h1>Instalar en iPhone</h1>
        <p>Abre la dirección del CRM en Safari y vuelve al inicio antes de añadir el icono.</p>
        <ol>
          <li>Pulsa Compartir.</li>
          <li>Selecciona «Añadir a pantalla de inicio».</li>
          <li>Si aparece «Abrir como app web», déjalo activado.</li>
          <li>Pulsa Añadir. Después abre NEXO desde su icono.</li>
        </ol>
        <p>
          Utiliza tu cuenta habitual. El servidor debe estar encendido y accesible desde tu móvil.
        </p>
        <p>
          Si Safari muestra un aviso de certificado, pide al administrador que configure la conexión
          antes de instalar.
        </p>
        <a href="/">Ir al CRM para añadirlo</a>
      </section>
    </main>
  );
}

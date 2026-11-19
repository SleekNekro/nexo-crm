'use client';
import { useMemo } from 'react';
import type { WorkspaceBrand } from '../../domain/workspace';
import type { Deal } from '../../domain/model';
import { quoteDocument } from '../documents/quote-document';

/** Uses the same renderer as saved quotations and the PDF service. No business data is saved. */
export default function QuoteTemplateSettings({
  brand,
  onChange,
}: {
  brand: WorkspaceBrand;
  onChange: (brand: WorkspaceBrand) => void;
}) {
  const html = useMemo(() => {
    const revision: Deal['versions'][number] = {
      id: 'preview',
      number: 'VISTA PREVIA',
      date: new Date().toISOString().slice(0, 10),
      lines: [
        { description: 'Producto de ejemplo', qty: 3, price: 120, discount: 0, tax: 21 },
        {
          description: 'Servicio de instalación y puesta en marcha',
          qty: 1,
          price: 250,
          discount: 10,
          tax: 21,
        },
      ],
      snapshot: {
        title: 'Propuesta comercial de ejemplo',
        owner: 'Tu equipo',
        brand,
        client: {
          id: 'preview-client',
          name: 'Cliente de ejemplo',
          owner: '',
          sector: '',
          city: 'Madrid',
          email: 'cliente@example.com',
          phone: '',
          address: 'Calle de ejemplo, 10',
        },
      },
    };
    const deal: Deal = {
      id: 'preview',
      companyId: 'preview-client',
      title: 'Ejemplo',
      owner: '',
      stage: 'En preparación',
      lines: revision.lines,
      versions: [revision],
    };
    return quoteDocument(deal, revision, undefined, undefined, '/brand/nexo-logo.svg').replace(
      '</head>',
      '<style>.toolbar{display:none}</style></head>',
    );
  }, [brand]);
  return (
    <>
      <h3>Tu plantilla de presupuesto</h3>
      <p>
        Usa el logo, los colores y los datos de Identidad. Los cambios se aplican a las nuevas
        revisiones; las ya emitidas conservan su presentación.
      </p>
      <div className="settings-grid">
        <label>
          Validez (días)
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            value={brand.quoteValidityDays ?? '30'}
            onChange={(e) => onChange({ ...brand, quoteValidityDays: e.target.value })}
          />
        </label>
        <label>
          Condiciones y forma de pago
          <textarea
            rows={5}
            maxLength={2000}
            placeholder="Por ejemplo: 50 % al aceptar y 50 % a la entrega."
            value={brand.paymentTerms}
            onChange={(e) => onChange({ ...brand, paymentTerms: e.target.value })}
          />
        </label>
        <label>
          Observaciones al pie
          <textarea
            rows={4}
            maxLength={2000}
            placeholder="Texto adicional para tus presupuestos"
            value={brand.quoteFooter ?? ''}
            onChange={(e) => onChange({ ...brand, quoteFooter: e.target.value })}
          />
        </label>
      </div>
      <p>
        Vista previa con datos ficticios. Puedes desplazar el documento horizontalmente en el móvil.
      </p>
      <iframe
        className="quote-template-preview"
        title="Vista previa de tu presupuesto"
        sandbox="allow-same-origin"
        srcDoc={html}
      />
    </>
  );
}

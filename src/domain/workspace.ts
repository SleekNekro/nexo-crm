export type WorkspaceBrand = {
  quoteValidityDays?: string;
  quoteFooter?: string;
  currency?: 'EUR' | 'USD' | 'GBP';
  name: string;
  logo: string;
  logoLayout?: 'page-wordmark';
  primary: string;
  accent: string;
  detail?: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  paymentTerms: string;
};
export type WorkspaceInfo = {
  id: string;
  brand: WorkspaceBrand;
  version: number;
  settings?: import('./business-settings').BusinessSettings;
};
export const nexoBrand: WorkspaceBrand = {
  name: 'NEXO',
  logo: '/brand/nexo-logo.svg',
  primary: '#2563eb',
  accent: '#eff6ff',
  detail: '#2563eb',
  legalName: 'Nexo Demo — empresa ficticia',
  taxId: '',
  address: 'Dirección de demostración',
  phone: '',
  email: 'demo@example.com',
  website: 'example.com',
  paymentTerms: 'Documento de demostración. Sin validez comercial ni datos bancarios.',
};
export const blankBrand: WorkspaceBrand = {
  name: '',
  logo: '',
  primary: '#354c70',
  accent: '#e5eaf0',
  detail: '#2563eb',
  legalName: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  paymentTerms: '',
};
export function validBrand(b: unknown): b is WorkspaceBrand {
  if (!b || typeof b !== 'object') return false;
  const v = b as WorkspaceBrand;
  return (
    Object.keys(blankBrand)
      .filter((k) => k !== 'detail')
      .every((k) => typeof v[k as keyof WorkspaceBrand] === 'string') &&
    !!v.name.trim() &&
    (v.quoteValidityDays === undefined ||
      /^(?:[1-9]|[1-9][0-9]|[12][0-9]{2}|3[0-5][0-9]|36[0-5])$/.test(v.quoteValidityDays)) &&
    (v.currency === undefined || ['EUR', 'USD', 'GBP'].includes(v.currency)) &&
    v.name.length <= 80 &&
    Object.entries(v).every(
      ([k, x]) => typeof x === 'string' && x.length <= (k === 'logo' ? 250000 : 2000),
    ) &&
    /^#[a-f0-9]{6}$/i.test(v.primary) &&
    /^#[a-f0-9]{6}$/i.test(v.accent) &&
    (v.detail === undefined || /^#[a-f0-9]{6}$/i.test(v.detail)) &&
    (v.logoLayout === undefined || v.logoLayout === 'page-wordmark') &&
    (v.logo === '' ||
      v.logo === '/brand/nexo-logo.svg' ||
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v.logo))
  );
}
export function contrastText(hex: string) {
  const n = hex.slice(1);
  const rgb = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#111111' : '#ffffff';
}

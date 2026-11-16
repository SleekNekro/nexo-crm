export type Company = {
  status?: import('./company-status').CompanyStatus;
  taxId?: string;
  address?: string;
  postalCode?: string;
  province?: string;
  id: string;
  name: string;
  sector: string;
  city: string;
  owner: string;
  email: string;
  phone: string;
};
export type Deal = {
  updatedAt?: string;
  createdAt?: string;
  acceptedRevisionId?: string;
  acceptedAt?: string;
  id: string;
  companyId: string;
  title: string;
  stage: string;
  owner: string;
  lines: {
    description: string;
    unit?: string;
    qty: number;
    price: number;
    discount: number;
    tax: number;
  }[];
  versions: {
    id: string;
    date: string;
    lines: Deal['lines'];
    number?: string;
    sentAt?: string;
    followUp?: string;
    snapshot?: {
      title: string;
      owner: string;
      client?: Company;
      contact?: Contact;
      brand?: import('./workspace').WorkspaceBrand;
    };
  }[];
  reason?: string;
  contactId?: string;
  expectedClose?: string;
  description?: string;
};
export type Task = {
  result?: string;
  priority?: import('./activity-priority').ActivityPriority;
  time?: string;
  durationMinutes?: number | null;
  quoteRevisionId?: string;
  id: string;
  dealId: string;
  title: string;
  due: string;
  owner: string;
  done: boolean;
  cancelled?: string;
  kind: string;
};
export type Contact = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};
export type SitePhoto = { id: string; name: string; caption: string; src: string };
export type SiteCrew = {
  id: string;
  kind: 'Propio' | 'Subcontrata';
  name: string;
  people: number;
  hours: number;
};
export type SiteReport = {
  id: string;
  workId: string;
  date: string;
  author: string;
  summary: string;
  incidents: string;
  materials: string;
  crew: SiteCrew[];
  photos: SitePhoto[];
  createdAt: string;
  updatedAt: string;
};
export type Worker = {
  archived?: boolean;
  id: string;
  name: string;
  kind: 'Propio' | 'Subcontrata';
  company: string;
  rate: number | null;
};
export type WorkItem = {
  id: string;
  workId: string;
  description: string;
  unit: string;
  plannedQty: number;
  plannedHours: number | null;
  source?: string;
};
export type WorkZone = { id: string; itemId: string; name: string };
export type Measurement = { zoneId: string; quantity: number | null };
export type LaborReport = {
  measurements?: Measurement[];
  id: string;
  workId: string;
  workerId: string;
  date: string;
  hours: number;
  summary: string;
  incidents: string;
  photos: SitePhoto[];
  status: 'Borrador' | 'Pendiente' | 'Devuelto' | 'Confirmado';
  rate: number | null;
  createdAt: string;
  updatedAt: string;
  history: { date: string; actor: string; action: string; reason: string }[];
};
export type WorkExpense = {
  changeReason?: string;
  id: string;
  workId: string;
  date: string;
  concept: string;
  kind: 'Materiales' | 'Dietas' | 'Alojamientos' | 'Gasolina' | 'Otros';
  quantity?: number | null;
  unit?: string;
  amount: number;
  status: 'Pendiente' | 'Confirmado';
};
export type SupervisionEntry = {
  changeReason?: string;
  id: string;
  date: string;
  person: string;
  hours: number;
  rate: number | null;
  notes: string;
};
export type Work = {
  actualStartManual?: boolean;
  actualEndManual?: boolean;
  changeReason?: string;
  ownerUserId?: string;
  reviewerUserId?: string;
  areaM2?: number | null;
  budgetAmount?: number | null;
  plannedDays?: number | null;
  actualStart?: string;
  actualEnd?: string;
  updatedAt?: string;
  supervision?: SupervisionEntry[];
  plannedCost?: number | null;
  workerIds?: string[];
  reviewer?: string;
  id: string;
  companyId: string;
  orderId: string;
  name: string;
  address: string;
  owner: string;
  responsible: string;
  start: string;
  end: string;
  status: 'Planificada' | 'En curso' | 'Pausada' | 'Finalizada';
  progress: number;
  notes: string;
};
export type Data = {
  zoneProgress?: { id: string; confirmed: number; proposed: number }[];
  workItems?: WorkItem[];
  workZones?: WorkZone[];
  workers?: Worker[];
  laborReports?: LaborReport[];
  workExpenses?: WorkExpense[];
  works?: Work[];
  siteReports?: SiteReport[];
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  orders: {
    id: string;
    dealId: string;
    revisionId?: string;
    date: string;
    status: string;
    lines: Deal['lines'];
  }[];
  notes: { id: string; dealId: string; text: string; date: string; owner: string }[];
};
export const stages = ['En preparación', 'Pendiente del cliente', 'Ganado', 'Perdido'];
export const money = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const subtotal = (lines: Deal['lines']) =>
  round(lines.reduce((s, l) => s + round(l.qty * l.price * (1 - l.discount / 100)), 0));
export const total = (lines: Deal['lines']) =>
  round(
    lines.reduce((s, l) => {
      const base = round(l.qty * l.price * (1 - l.discount / 100));
      return s + base + round((base * l.tax) / 100);
    }, 0),
  );
export function seed(): Data {
  let companies = [
    ['c1', 'Estudio Norte', 'Arquitectura', 'Bilbao', 'Alex'],
    ['c2', 'Habitat Mediterráneo', 'Interiorismo', 'Valencia', 'Alex'],
    ['c3', 'Construcciones Artea', 'Construcción', 'Donostia', 'Ana'],
    ['c4', 'Casa Oliva', 'Hostelería', 'Madrid', 'Alex'],
    ['c5', 'Taller Forma', 'Diseño', 'Barcelona', 'Ana'],
  ].map(([id, name, sector, city, owner]) => ({
    id,
    name,
    sector,
    city,
    owner,
    email: 'contacto@example.com',
    phone: '',
  }));
  let deals = [
    ['d1', 'c1', 'Revestimiento · Residencia Ametz', 'Pendiente del cliente', 'Alex', 84, 68],
    ['d2', 'c2', 'Muestras y acabados · Villa Mar', 'En preparación', 'Alex', 120, 54],
    ['d3', 'c3', 'Microcemento · Local comercial', 'Ganado', 'Ana', 180, 62],
    ['d4', 'c4', 'Renovación · Hotel Casa Oliva', 'Pendiente del cliente', 'Alex', 240, 72],
    ['d5', 'c5', 'Acabado de mobiliario', 'Perdido', 'Ana', 32, 48],
  ].map(([id, companyId, title, stage, owner, qty, price]) => ({
    id: String(id),
    companyId: String(companyId),
    title: String(title),
    stage: String(stage),
    owner: String(owner),
    lines: [
      {
        description: 'Revestimiento decorativo · suministro',
        qty: Number(qty),
        price: Number(price),
        discount: 0,
        tax: 21,
      },
    ],
    versions: [],
    reason: stage === 'Perdido' ? 'Proyecto aplazado' : undefined,
  }));
  let today = new Date().toISOString().slice(0, 10);
  return {
    companies,
    contacts: companies.map((c, i) => ({
      id: 'ct' + i,
      companyId: c.id,
      name: ['María Aguirre', 'Pablo Soler', 'Jon Arrieta', 'Lucía Martín', 'Laura Costa'][i],
      email: 'demo@example.com',
      phone: '',
      role: 'Contacto principal',
    })),
    deals,
    tasks: [
      {
        id: 't1',
        dealId: 'd1',
        title: 'Consultar decisión sobre acabados',
        due: today,
        owner: 'Alex',
        done: false,
        kind: 'Llamada',
      },
      {
        id: 't2',
        dealId: 'd2',
        title: 'Preparar selección de muestras',
        due: today,
        owner: 'Alex',
        done: false,
        kind: 'Tarea',
      },
      {
        id: 't3',
        dealId: 'd3',
        title: 'Confirmar recepción del pedido',
        due: today,
        owner: 'Ana',
        done: false,
        kind: 'Recepción',
      },
      {
        id: 't4',
        dealId: 'd4',
        title: 'Visita para revisar la propuesta',
        due: today,
        owner: 'Alex',
        done: false,
        kind: 'Visita',
      },
    ],
    orders: [
      {
        id: 'p1',
        dealId: 'd3',
        date: today,
        status: 'Pendiente de revisión',
        lines: deals[2].lines,
      },
    ],
    notes: [],
  };
}

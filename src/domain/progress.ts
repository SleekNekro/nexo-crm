import type { Data, LaborReport, WorkItem } from './model';
const normalized = (s: string) =>
  s
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
const round = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
export function workProgress(data: Data, workId: string) {
  const reports = (data.laborReports || []).filter((r) => r.workId === workId);
  const items = (data.workItems || [])
    .filter((i) => i.workId === workId)
    .map((item) => {
      const zones = (data.workZones || [])
        .filter((z) => z.itemId === item.id)
        .map((zone) => {
          const readings = reports.flatMap((r) =>
            (r.measurements || [])
              .filter((m) => m.zoneId === zone.id && m.quantity !== null)
              .map((m) => ({ report: r, quantity: m.quantity! })),
          );
          const confirmed = Math.max(
            0,
            ...readings.filter((x) => x.report.status === 'Confirmado').map((x) => x.quantity),
          );
          const proposed = Math.max(
            confirmed,
            ...readings.filter((x) => x.report.status === 'Pendiente').map((x) => x.quantity),
          );
          return { ...zone, confirmed, proposed, readings };
        });
      const executed = round(zones.reduce((n, z) => n + z.confirmed, 0)),
        proposed = round(zones.reduce((n, z) => n + z.proposed, 0));
      return {
        ...item,
        zones,
        executed,
        proposed,
        percent: Math.min(100, (executed / item.plannedQty) * 100),
      };
    });
  const ready =
    items.length > 0 &&
    items.every(
      (i) =>
        i.unit.trim() &&
        i.plannedQty > 0 &&
        i.plannedHours !== null &&
        i.plannedHours > 0 &&
        i.zones.length,
    );
  const totalHours = items.reduce((n, i) => n + (i.plannedHours || 0), 0);
  const percent = ready
    ? round(items.reduce((n, i) => n + (i.plannedHours || 0) * i.percent, 0) / totalHours)
    : null;
  return {
    items,
    percent,
    missing: items.filter((i) => !i.unit || !i.plannedHours || !i.zones.length).length,
    unmeasured: reports.filter(
      (r) => r.status === 'Confirmado' && !(r.measurements || []).some((m) => m.quantity !== null),
    ).length,
  };
}
export function validateMeasurements(data: Data, r: LaborReport) {
  const rows = r.measurements || [];
  if (
    !Array.isArray(rows) ||
    rows.length > 100 ||
    new Set(rows.map((m) => m.zoneId)).size !== rows.length
  )
    throw Error('Selecciona cada zona una sola vez por parte');
  for (const m of rows) {
    const z = data.workZones?.find((z) => z.id === m.zoneId),
      i = data.workItems?.find((i) => i.id === z?.itemId);
    if (!i || i.workId !== r.workId || !i.unit.trim())
      throw Error('La zona debe pertenecer a una partida de esta obra con unidad definida');
    if (
      m.quantity !== null &&
      (!Number.isFinite(m.quantity) || m.quantity < 0 || m.quantity > i.plannedQty)
    )
      throw Error('El acumulado debe estar entre 0 y la cantidad prevista de la partida');
  }
}
export function validProgressData(data: Data): boolean {
  try {
    const items = data.workItems || [],
      zones = data.workZones || [];
    if (
      !Array.isArray(items) ||
      !Array.isArray(zones) ||
      new Set(items.map((i) => i.id)).size !== items.length ||
      new Set(zones.map((z) => z.id)).size !== zones.length
    )
      return false;
    if (
      !items.every(
        (i) =>
          data.works?.some((w) => w.id === i.workId) &&
          !!i.description.trim() &&
          typeof i.unit === 'string' &&
          Number.isFinite(i.plannedQty) &&
          i.plannedQty > 0 &&
          (i.plannedHours === null || (Number.isFinite(i.plannedHours) && i.plannedHours > 0)),
      )
    )
      return false;
    if (
      !zones.every((z) => items.some((i) => i.id === z.itemId) && !!z.name.trim()) ||
      new Set(zones.map((z) => z.itemId + '|' + normalized(z.name))).size !== zones.length
    )
      return false;
    for (const r of data.laborReports || []) validateMeasurements(data, r);
    return (data.works || []).every((w) =>
      workProgress(data, w.id).items.every((i) => i.executed <= i.plannedQty + 0.00001),
    );
  } catch {
    return false;
  }
}
function managed(data: Data, id: string, actor: string) {
  const w = data.works?.find((w) => w.id === id);
  if (!w || !(actor === 'Dirección' || actor === (w.reviewer || w.owner)))
    throw Error('Solo el responsable o Dirección pueden planificar esta obra');
  return w;
}
export function saveWorkItem(data: Data, item: WorkItem, actor: string): Data {
  managed(data, item.workId, actor);
  const n = structuredClone(data);
  n.workItems ??= [];
  n.workZones ??= [];
  const at = n.workItems.findIndex((i) => i.id === item.id);
  if (at >= 0) {
    const old = n.workItems[at];
    if (old.workId !== item.workId) throw Error('No se puede cambiar la obra de la partida');
    if (
      old.unit !== item.unit &&
      n.laborReports?.some((r) =>
        r.measurements?.some((m) =>
          n.workZones?.some((z) => z.id === m.zoneId && z.itemId === item.id),
        ),
      )
    )
      throw Error('La unidad no puede cambiar mientras existan partes asociados');
    n.workItems[at] = item;
  } else {
    n.workItems.push(item);
    n.workZones.push({ id: item.id + '-general', itemId: item.id, name: 'Zona general' });
  }
  if (!validProgressData(n))
    throw Error(
      'Revisa cantidad y horas previstas. No se puede reducir el objetivo por debajo de la ejecución registrada.',
    );
  return n;
}
export function addWorkZone(
  data: Data,
  itemId: string,
  name: string,
  id: string,
  actor: string,
): Data {
  const item = data.workItems?.find((i) => i.id === itemId);
  if (!item) throw Error('Partida no encontrada');
  managed(data, item.workId, actor);
  const n = structuredClone(data);
  n.workZones ??= [];
  const general = n.workZones.find((z) => z.itemId === itemId && z.id === itemId + '-general');
  if (general) {
    if (n.laborReports?.some((r) => r.measurements?.some((m) => m.zoneId === general.id)))
      throw Error(
        'La zona general ya tiene partes. Mantén el acumulado global de la partida; no la subdividas para evitar solapamientos.',
      );
    n.workZones = n.workZones.filter((z) => z.id !== general.id);
  }
  n.workZones.push({ id, itemId, name: name.trim() });
  if (!validProgressData(n)) throw Error('Indica una zona nueva, sin repetir nombres.');
  return n;
}
export function importWorkItems(
  data: Data,
  workId: string,
  source: string,
  actor: string,
  newId: () => string,
): Data {
  const w = managed(data, workId, actor);
  if (data.workItems?.some((i) => i.workId === workId))
    throw Error(
      'La obra ya tiene una planificación. Edita las partidas existentes para no duplicarlas.',
    );
  const n = structuredClone(data);
  let lines: Data['deals'][number]['lines'] | undefined;
  if (source.startsWith('order:')) {
    const o = data.orders.find((o) => o.id === source.slice(6)),
      d = data.deals.find((d) => d.id === o?.dealId);
    if (d?.companyId === w.companyId) lines = o?.lines;
  } else {
    for (const d of data.deals.filter((d) => d.companyId === w.companyId)) {
      const v = d.versions.find((v) => 'revision:' + v.id === source);
      if (v) lines = v.lines;
    }
  }
  if (!lines?.length)
    throw Error('Selecciona un pedido o una revisión del presupuesto de este cliente con partidas');
  n.workItems ??= [];
  n.workZones ??= [];
  for (const l of lines) {
    const id = newId();
    n.workItems.push({
      id,
      workId,
      description: l.description,
      unit: l.unit || '',
      plannedQty: l.qty,
      plannedHours: null,
      source,
    });
    n.workZones.push({ id: id + '-general', itemId: id, name: 'Zona general' });
  }
  if (!validProgressData(n)) throw Error('No se pueden importar estas partidas');
  return n;
}

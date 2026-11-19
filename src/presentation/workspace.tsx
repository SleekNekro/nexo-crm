'use client';
import CustomModules from './components/custom-modules';
import BusinessSettingsDialog from './components/business-settings';
import { useBusinessSettings } from './hooks/use-business-settings';
import { phaseFor } from '../domain/business-settings';
import CommercialDataTools from './components/commercial-data-tools';
import { clearLaborDrafts } from './utils/labor-drafts';
import ActivityCompletion from './components/activity-completion';
import { nextCommercialStep } from '../domain/commercial-workflow';
import { createCompanyQuote } from '../domain/company-quote';
import { matchingDraftRevision } from '../domain/quote-workflow';
import Workspaces from './components/workspaces';
import { BrandLogo } from './components/brand-logo';
import { nexoBrand, contrastText } from '../domain/workspace';
import { PermissionProvider, PermissionButton } from './components/permission-controls';
import { pendingWorkReports } from '../domain/work-notifications';
import { canAct, canView } from '../domain/permissions';
import { recordId } from './utils/record-id';
import {
  BarChart3,
  Bug,
  Building2,
  CalendarCheck,
  Check,
  ChevronRight,
  FileText,
  HardHat,
  KanbanSquare,
  LayoutDashboard,
  Menu,
  X,
  Package,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Identity } from '../application/access';
import { changeStage, completeTask, issueQuote } from '../domain/actions';
import { type Data, type Deal } from '../domain/model';
import { isAdmin } from '../domain/roles';
import Accounts from './components/accounts';
import ActivityList, { localDay } from './components/activity-list';
import AuthGate from './components/auth-gate';
import CommercialAnalysis from './components/commercial-analysis';
import { setCompanyStatus } from '../domain/company-status';
import { removeCompany } from '../domain/company-removal';
import CompanyDetail from './components/company-detail';
import CompanyList from './components/company-list';
import Dashboard from './components/dashboard';
import DealDetail from './components/deal-detail';
import DealKanban from './components/deal-kanban';
import Diagnostics from './components/diagnostics';
import MyDay from './components/my-day';
import OrderList from './components/order-list';
import ProductCatalogue from './components/product-catalogue';
import QuoteList from './components/quote-list';
import RecordFormDialog from './components/record-form-dialog';
import Team from './components/team';
import WorkerPortal from './components/worker-portal';
import Works from './components/works';
import { useRecordForms } from './hooks/use-record-forms';
import { useWorkspaceData } from './hooks/use-workspace-data';
const uid = () => recordId();
const day = localDay;
const nav = [
  ['Resumen', LayoutDashboard],
  ['Mi día', CalendarCheck],
  ['Empresas', Building2],
  ['Contactos', Users],
  ['Tratos', KanbanSquare],
  ['Presupuestos', FileText],
  ['Catálogo', Package],
  ['Pedidos', Package],
  ['Actividades', CalendarCheck],
  ['Obras', HardHat],
  ['Equipo', Users],
  ['Análisis', BarChart3],
  ['Depuración', Bug],
] as const;
export default function Home() {
  return (
    <AuthGate>
      {(user) => (
        <PermissionProvider user={user}>
          <Workspace user={user} />
        </PermissionProvider>
      )}
    </AuthGate>
  );
}
function Workspace({ user }: { user: Identity | null }) {
  const brand = user?.workspace?.brand || nexoBrand;
  const settings = useBusinessSettings();
  const [businessSettingsOpen, setBusinessSettingsOpen] = useState(false);
  useEffect(() => {
    document.title = brand.name + ' · Comercial y obras';
  }, [brand.name]);
  const {
    notificationData,
    refresh,
    data,
    error,
    setError,
    busy,
    notice,
    setNotice,
    storage,
    connected,
    setConnected,
    save,
  } = useWorkspaceData();
  const [completing, setCompleting] = useState('');
  const [accounts, setAccounts] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [view, setView] = useState('Mi día'),
    [profile, setProfile] = useState('Dirección'),
    [search, setSearch] = useState(''),
    [companyId, setCompanyId] = useState(''),
    [dealTab, setDealTab] = useState('Resumen'),
    [selected, setSelected] = useState('');
  const [activityFilter, setActivityFilter] = useState('Pendientes'),
    [quoteFilter, setQuoteFilter] = useState('Pendientes'),
    [ready, setReady] = useState(false);
  const recordForms = useRecordForms({
    data,
    profile,
    view,
    companyId,
    selected,
    busy,
    save,
    setError,
    setNotice,
    onOpenCompany: (id) => {
      setView('Empresas');
      setCompanyId(id);
      setSelected('');
      setSearch('');
    },
    onOpenQuote: (id) => {
      setSelected(id);
      setDealTab('Presupuesto');
    },
  });
  const { open, editCompany, editContact, editDeal, dealActivity, formDirty, reset } = recordForms;
  const restoring = useRef(false);
  const [workEntry, setWorkEntry] = useState('Resumen');
  const [workId, setWorkId] = useState(''),
    [workDirty, setWorkDirty] = useState(false);
  const workDirtyRef = useRef(false);
  workDirtyRef.current = workDirty;
  useEffect(() => {
    setProfile(user?.profile || sessionStorage.getItem('crm-profile') || 'Dirección');
    const restore = () => {
      if (
        workDirtyRef.current &&
        !confirm('El parte o la obra tienen cambios sin guardar. ¿Salir y descartarlos?')
      ) {
        history.forward();
        return;
      }
      setWorkDirty(false);
      restoring.current = true;
      const p = new URLSearchParams(location.hash.slice(1));
      const requested = p.get('view') || 'Mi día';
      setView(
        nav.some(([n]) => n === requested && (!user || canView(user, n)))
          ? requested
          : nav.find(([n]) => !user || canView(user, n))?.[0] || 'Mi día',
      );
      setSelected(p.get('deal') || '');
      setCompanyId(p.get('company') || '');
      setDealTab(p.get('tab') || 'Resumen');
      setSearch(p.get('q') || '');
      setWorkId(p.get('work') || '');
      setActivityFilter(p.get('agenda') || 'Pendientes');
      setQuoteFilter(
        ['Pendientes', 'Todos', 'Borrador', 'Enviado', 'Aceptado', 'Caducado', 'Perdido'].includes(
          p.get('quotes') || '',
        )
          ? p.get('quotes')!
          : 'Pendientes',
      );
    };
    restore();
    setReady(true);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams({ view });
    if (view === 'Obras' && workId) p.set('work', workId);
    if (selected) p.set('deal', selected);
    if (companyId) p.set('company', companyId);
    if (selected) p.set('tab', dealTab);
    if (search) p.set('q', search);
    if (view === 'Actividades') p.set('agenda', activityFilter);
    if (view === 'Presupuestos') p.set('quotes', quoteFilter);
    const hash = '#' + p.toString();
    if (restoring.current) {
      restoring.current = false;
      return;
    }
    if (location.hash !== hash) {
      const old = new URLSearchParams(location.hash.slice(1));
      const same =
        old.get('view') === view &&
        (old.get('deal') || '') === selected &&
        (old.get('company') || '') === companyId &&
        (old.get('work') || '') === (view === 'Obras' ? workId : '');
      history[same ? 'replaceState' : 'pushState'](null, '', hash);
    }
  }, [ready, view, selected, companyId, dealTab, search, activityFilter, quoteFilter, workId]);
  useEffect(() => {
    const off = () => setConnected(false);
    window.addEventListener('offline', off);
    return () => window.removeEventListener('offline', off);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const key = 'crm-scroll-' + view + '-' + companyId;
    const saved = Number(sessionStorage.getItem(key) || 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, saved));
    return () => {
      cancelAnimationFrame(frame);
      sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [ready, view, companyId]);

  if (!data)
    return (
      <main className="loading">
        <h1>
          {brand.name}
          <span> / comercial</span>
        </h1>
        <p>{error || 'Conectando con tu espacio comercial…'}</p>
        {error && <button onClick={() => location.reload()}>Reintentar</button>}
      </main>
    );
  const workerMode = profile.startsWith('operario:');
  const pendingWorkCounts =
    !workerMode && (!user || canAct(user, 'labor'))
      ? pendingWorkReports(notificationData || data, profile)
      : {};
  const pendingWorkTotal = Object.values(pendingWorkCounts).reduce((sum, count) => sum + count, 0);
  const allowed = (owner: string) => profile === 'Dirección' || owner === profile;
  const companies = data.companies.filter((c) => allowed(c.owner));
  const company = (id: string) => data.companies.find((c) => c.id === id)?.name || 'Sin empresa';
  const deals = data.deals.filter((d) => allowed(d.owner));
  const matches = (s: string) => s.toLowerCase().includes(search.toLowerCase());
  const filtered = deals.filter((d) => matches(d.title + ' ' + company(d.companyId)));
  const tasks = data.tasks.filter((t) => allowed(t.owner));
  const active = deals.filter((d) => !['Ganado', 'Perdido'].includes(d.stage));
  const sel = deals.find((d) => d.id === selected);
  const focusedCompany =
    view === 'Empresas' ? companies.find((c) => c.id === companyId) : undefined;
  async function stage(d: Deal, s: string) {
    const phase = settings.phases.find((p) => p.id === s);
    const phaseId = phase?.id;
    s = phase?.kind || s;
    if (busy || (d.stage === s && (!phaseId || phaseFor(d, settings)?.id === phaseId))) return;
    if (
      s === 'Ganado' &&
      d.versions.length &&
      !d.acceptedRevisionId &&
      !data!.orders.some((o) => o.dealId === d.id)
    ) {
      setSelected(d.id);
      setDealTab('Presupuesto');
      setNotice('Selecciona la revisión aceptada por el cliente');
      return;
    }
    if (
      ['Ganado', 'Perdido'].includes(s) &&
      !confirm(
        (s === 'Ganado' && settings.modules.includes('Pedidos')
          ? 'Se generará un pedido si todavía no existe. '
          : '') +
          'Los seguimientos pendientes se cancelarán, no se marcarán como realizados. ¿Cerrar el trato como ' +
          s.toLowerCase() +
          '?',
      )
    )
      return;
    let reason: string | undefined;
    if (s === 'Perdido') {
      reason = prompt('Motivo de pérdida') || undefined;
      if (!reason?.trim()) return;
    }
    try {
      const next = changeStage(
        data!,
        d.id,
        s,
        uid,
        day(),
        reason,
        settings.modules.includes('Pedidos'),
      );
      if (user && !canAct(user, 'tasks')) next.tasks = data!.tasks;
      if (phaseId) next.deals.find((x) => x.id === d.id)!.pipelinePhase = phaseId;
      else delete next.deals.find((x) => x.id === d.id)!.pipelinePhase;
      await save(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function companyQuote(id: string) {
    if (busy || !data) return;
    try {
      const newId = uid();
      if (await save(createCompanyQuote(data, id, newId))) {
        setDealTab('Presupuesto');
        setSelected(newId);
        setNotice('Presupuesto creado. Añade los productos o partidas.');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function nextAction(id: string) {
    const deal = data?.deals.find((d) => d.id === id);
    if (!deal || !data) return;
    const step = nextCommercialStep(deal, data.tasks);
    if (step.kind === 'task') {
      if (step.task.due <= day()) setCompleting(step.task.id);
      else dealActivity(step.task);
      return;
    }
    if (step.kind === 'schedule') {
      recordForms.activityForDeal(id);
      return;
    }
    setSelected(id);
    setDealTab(step.kind === 'quote' ? 'Presupuesto' : 'Resumen');
  }
  function openQuotePage(d: Deal, v: Deal['versions'][number]) {
    const params = new URLSearchParams({
      deal: d.id,
      revision: v.id,
      workspace: user?.workspaceId || '',
    });
    window.location.assign('/documentos/presupuesto?' + params);
  }
  async function issue(d: Deal, openPdf = false) {
    if (busy) return;
    const matching = matchingDraftRevision(data!, d, brand);
    if (matching) {
      if (openPdf) printQuote(d, matching);
      else setNotice('El borrador ya coincide con la última revisión');
      return;
    }
    try {
      const id = uid();
      let saved: Data | undefined;
      const ok = await save(issueQuote(data!, d.id, id, new Date().toISOString()), (value) => {
        saved = value;
      });
      if (!ok) {
        return;
      }
      const deal = saved?.deals.find((x) => x.id === d.id),
        revision = deal?.versions.find((v) => v.id === id);
      if (openPdf && deal && revision) openQuotePage(deal, revision);
      else if (openPdf)
        setError('Revisión guardada. Ábrela desde el historial para generar el PDF.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function printQuote(d: Deal, v: Deal['versions'][number]) {
    openQuotePage(d, v);
  }
  async function logout() {
    if ((workDirty || formDirty) && !confirm('Hay cambios sin guardar. ¿Cerrar sesión?')) return;
    if (localStorage.getItem('crm-shared-device') === '1') {
      if (
        !confirm(
          'Se eliminarán los borradores y fotos sin enviar de este dispositivo. ¿Cerrar sesión?',
        )
      )
        return;
      await clearLaborDrafts();
    }
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    if (!response.ok) throw Error('No se ha podido cerrar sesión. Vuelve a intentarlo.');
    sessionStorage.clear();
    location.reload();
  }

  const title = view === 'Resumen' ? 'Tu actividad, en perspectiva.' : view;
  return (
    <div
      className={workerMode ? 'shell worker-shell' : 'shell'}
      style={
        {
          '--brand-primary': brand.primary,
          '--brand-accent': brand.accent,
          '--brand-detail': brand.detail || brand.primary,
          '--brand-red': brand.detail || brand.primary,
          '--brand-nav': brand.primary,
          '--brand-nav-text':
            !user?.workspaceId || user.workspaceId === 'nexo'
              ? '#ffffff'
              : contrastText(brand.primary),
          '--brand-primary-text': contrastText(brand.primary),
          '--brand-accent-text': contrastText(brand.accent),
        } as CSSProperties
      }
    >
      <aside>
        <div className="brand">
          {brand.logo ? <BrandLogo brand={brand} /> : <strong>{brand.name}</strong>}
          <span>{workerMode ? 'MI JORNADA' : 'COMERCIAL Y OBRAS'}</span>
        </div>
        {user ? (
          <Workspaces
            user={user}
            workers={data?.workers || []}
            beforeSwitch={() =>
              !(workDirty || formDirty) ||
              confirm('Hay cambios sin guardar. ¿Descartarlos y cambiar de empresa?')
            }
          />
        ) : (
          <div className="workspace">
            <span className="logo">{brand.name.slice(0, 1)}</span>
            <div>
              {workerMode ? 'Operarios' : 'Equipo ' + brand.name}
              <small>Datos privados de esta empresa</small>
            </div>
          </div>
        )}
        <div className="navlabel">ESPACIO DE TRABAJO</div>
        <button
          className="mobile-menu-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="workspace-navigation"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          {mobileMenuOpen ? 'Cerrar menú' : 'Más secciones'}
          <span>{view}</span>
        </button>
        <nav
          id="workspace-navigation"
          aria-label="Navegación principal"
          className={mobileMenuOpen ? 'mobile-open' : ''}
        >
          {nav
            .filter(
              ([name]) =>
                (!user || canView(user, name)) &&
                (!workerMode || name === 'Mi día') &&
                (!['Análisis', 'Equipo'].includes(name) || (!!user && isAdmin(user.role))) &&
                (name !== 'Depuración' || user?.role === 'developer'),
            )
            .map(([name, Icon]) => (
              <button
                className={view === name ? 'active' : ''}
                aria-current={view === name ? 'page' : undefined}
                data-shortcut={
                  [
                    'Resumen',
                    'Mi día',
                    'Empresas',
                    'Tratos',
                    'Presupuestos',
                    'Actividades',
                  ].includes(name) || undefined
                }
                key={name}
                onClick={() => {
                  if (
                    workDirty &&
                    !confirm('Hay cambios de obra sin guardar. ¿Descartarlos y salir?')
                  )
                    return;
                  setWorkDirty(false);
                  setView(name);
                  if (name === 'Obras') {
                    setWorkId('');
                    void refresh();
                  }
                  setMobileMenuOpen(false);
                  setSearch('');
                  setSelected('');
                  setCompanyId('');
                  setDealTab('Resumen');
                }}
              >
                <Icon size={18} />
                {workerMode ? 'Mi día · Obras y partes' : name}
                {name === 'Obras' && pendingWorkTotal > 0 && (
                  <b
                    className="work-notification-count"
                    aria-label={`${pendingWorkTotal} partes por confirmar`}
                    title={`${pendingWorkTotal} partes por confirmar`}
                  >
                    {pendingWorkTotal}
                  </b>
                )}
                {name === 'Actividades' && (
                  <b>{tasks.filter((t) => !t.done && !t.cancelled).length}</b>
                )}
              </button>
            ))}
          {user && (
            <CustomModules
              key={user.workspaceId}
              user={user}
              onEnter={() => {
                if (
                  (workDirty || formDirty) &&
                  !confirm('Hay cambios sin guardar. ¿Abrir el módulo?')
                )
                  return false;
                setMobileMenuOpen(false);
                return true;
              }}
            />
          )}
        </nav>
        <div className="asidebottom" role="status" aria-live="polite">
          <span
            className={'statusdot ' + (connected ? 'led-online' : 'led-offline')}
            aria-hidden="true"
          />
          {connected ? 'Conectado' : 'Sin conexión confirmada'}
          <small>
            {storage === 'memory'
              ? 'Pruebas en memoria · se pierden al reiniciar'
              : 'Datos guardados en PostgreSQL'}
          </small>
        </div>
      </aside>
      <div className="main">
        <header>
          <span
            className="mobile-connection"
            role="status"
            aria-label={connected ? 'Conectado al servidor' : 'Sin conexión confirmada'}
            title={connected ? 'Conectado al servidor' : 'Sin conexión confirmada'}
          >
            <span
              className={'statusdot ' + (connected ? 'led-online' : 'led-offline')}
              aria-hidden="true"
            />
          </span>
          <div>
            {workerMode ? 'Mi espacio' : brand.name} <ChevronRight size={14} /> {view}
          </div>
          {user ? (
            <>
              {user.platformDeveloper && (
                <button
                  onClick={() => {
                    if (
                      (formDirty || workDirty) &&
                      !confirm(
                        'Hay cambios sin guardar. Guardar la configuración recargará la página. ¿Abrir?',
                      )
                    )
                      return;
                    setBusinessSettingsOpen(true);
                  }}
                >
                  {settings.setupComplete ? 'Configurar negocio' : 'Preparar mi CRM'}
                </button>
              )}
              <button onClick={() => setAccounts(true)}>
                {user.displayName || user.username} · Mi cuenta
              </button>
            </>
          ) : (
            <select
              aria-label="Simular perfil"
              value={profile}
              onChange={(e) => {
                if (
                  workDirty &&
                  !confirm('Hay cambios de obra sin guardar. ¿Descartarlos y cambiar perfil?')
                )
                  return;
                setWorkDirty(false);
                setWorkId('');
                setProfile(e.target.value);
                sessionStorage.setItem('crm-profile', e.target.value);
                if (e.target.value.startsWith('operario:')) setView('Obras');
                setSelected('');
                setCompanyId('');
                reset();
              }}
            >
              <option>Dirección</option>
              <option>Comercial1</option>
              <option>Alex</option>
              <option>Ana</option>
              {(data.workers || []).map((w) => (
                <option key={w.id} value={'operario:' + w.id}>
                  Operario · {w.name}
                </option>
              ))}
            </select>
          )}
          <span className="avatar">{profile[0]}</span>
        </header>
        <div className="demo">
          {user
            ? 'Espacio privado · ' +
              (isAdmin(user.role)
                ? user.role === 'developer'
                  ? 'Desarrollador'
                  : 'Administrador'
                : user.role === 'worker'
                  ? 'Operario'
                  : 'Comercial / responsable')
            : 'PROTOTIPO · Perfiles simulados · Datos en memoria'}
        </div>
        <main>
          {user && !canView(user, view) ? (
            <section className="empty">
              <h2>Vista no disponible</h2>
              <p>Selecciona una sección permitida en el menú o contacta con el desarrollador.</p>
            </section>
          ) : (
            <>
              {!workerMode &&
                !focusedCompany &&
                !['Obras', 'Equipo', 'Análisis', 'Depuración', 'Catálogo'].includes(view) && (
                  <div className="heading">
                    <div>
                      <div className="eyebrow">
                        {new Date().toLocaleDateString('es-ES', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </div>
                      <h1>{title}</h1>
                      <p>
                        {view === 'Mi día'
                          ? 'Lo que necesita tu atención hoy.'
                          : view === 'Resumen'
                            ? 'Cada conversación, cada oportunidad y el siguiente paso.'
                            : 'Organiza el seguimiento y mantén al equipo al día.'}
                      </p>
                    </div>
                    <PermissionButton
                      action={
                        ['Empresas', 'Contactos'].includes(view)
                          ? 'companies'
                          : view === 'Actividades'
                            ? 'tasks'
                            : 'deals'
                      }
                      className="primary"
                      onClick={() =>
                        view === 'Presupuestos'
                          ? open('Presupuesto')
                          : open(
                              view === 'Empresas'
                                ? 'Empresa'
                                : view === 'Contactos'
                                  ? 'Contacto'
                                  : view === 'Actividades'
                                    ? 'Actividad'
                                    : 'Trato',
                            )
                      }
                    >
                      <Plus size={17} />{' '}
                      {view === 'Empresas'
                        ? 'Nueva empresa'
                        : view === 'Contactos'
                          ? 'Nuevo contacto'
                          : view === 'Actividades'
                            ? 'Nueva actividad'
                            : view === 'Presupuestos'
                              ? 'Crear presupuesto'
                              : view === 'Pedidos'
                                ? 'Abrir un nuevo trato'
                                : 'Nuevo trato'}
                    </PermissionButton>
                  </div>
                )}
              {error && (
                <div className="error">
                  {error} <button onClick={() => setError('')}>Cerrar aviso</button>
                </div>
              )}
              {notice && (
                <div className="toast">
                  <Check size={16} />
                  {notice}
                </div>
              )}
              {view === 'Mi día' && !workerMode ? (
                <MyDay
                  data={data}
                  profile={profile}
                  busy={busy}
                  onDeal={(id, tab) => {
                    setDealTab(tab);
                    setSelected(id);
                  }}
                  onWork={(id) => {
                    setWorkEntry('Horas y costes');
                    void refresh().then((ok) => {
                      if (ok) {
                        setWorkId(id);
                        setView('Obras');
                      }
                    });
                  }}
                  onComplete={(id) => {
                    setCompleting(id);
                  }}
                  onAgenda={(filter) => {
                    setActivityFilter(filter);
                    setView('Actividades');
                  }}
                />
              ) : view === 'Equipo' && user && isAdmin(user.role) ? (
                <Team
                  user={user}
                  data={data}
                  busy={busy}
                  onSave={save}
                  onDirty={setWorkDirty}
                  onWork={(id) => {
                    setWorkId(id);
                    setView('Obras');
                  }}
                />
              ) : view === 'Catálogo' && !workerMode ? (
                <ProductCatalogue />
              ) : view === 'Análisis' && user && isAdmin(user.role) ? (
                <CommercialAnalysis />
              ) : view === 'Depuración' && user?.role === 'developer' ? (
                <Diagnostics />
              ) : workerMode ? (
                <WorkerPortal
                  accountId={
                    user?.workspaceId && user.workspaceId !== 'nexo'
                      ? user.id + ':' + user.workspaceId
                      : user?.id
                  }
                  key={profile}
                  data={data}
                  workerId={profile.slice(9)}
                  busy={busy}
                  error={error}
                  onSave={save}
                  onDirty={setWorkDirty}
                />
              ) : view === 'Obras' ? (
                <Works
                  key={profile}
                  data={data}
                  profile={profile}
                  busy={busy}
                  error={error}
                  onSave={save}
                  selected={workId}
                  pendingCounts={pendingWorkCounts}
                  initialTab={workEntry}
                  onSelect={(id) => {
                    if (id)
                      void refresh().then((ok) => {
                        if (ok) {
                          setWorkEntry('Resumen');
                          setWorkId(id);
                        }
                      });
                    else setWorkId('');
                  }}
                  onDirty={setWorkDirty}
                />
              ) : focusedCompany ? (
                <CompanyDetail
                  onStatus={(status) => {
                    try {
                      void save(setCompanyStatus(data, focusedCompany.id, status));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                  onDelete={async () => {
                    try {
                      if (await save(removeCompany(data, focusedCompany.id))) {
                        setCompanyId('');
                        return true;
                      }
                    } catch (e) {
                      setError((e as Error).message);
                    }
                    return false;
                  }}
                  error={error}
                  company={focusedCompany}
                  data={data}
                  deals={deals}
                  busy={busy}
                  onBack={() => setCompanyId('')}
                  onOpenDeal={(id) => {
                    setDealTab('Resumen');
                    setSelected(id);
                  }}
                  onOpenQuote={(id) => {
                    setDealTab('Presupuesto');
                    setSelected(id);
                  }}
                  onCreateQuote={() => companyQuote(focusedCompany.id)}
                  onCreate={open}
                  onEditCompany={editCompany}
                  onEditActivity={dealActivity}
                  onEditContact={editContact}
                  onTask={(id, done) => {
                    if (done) setCompleting(id);
                    else
                      void save(completeTask(data, id, false)).then((ok) => {
                        if (ok) setNotice('Actividad reabierta.');
                      });
                  }}
                  onPrint={printQuote}
                />
              ) : view === 'Resumen' ? (
                <Dashboard
                  pendingCounts={pendingWorkCounts}
                  onReviewWork={(id) => {
                    setWorkEntry('Horas y costes');
                    void refresh().then((ok) => {
                      if (ok) {
                        setWorkId(id);
                        setView('Obras');
                      }
                    });
                  }}
                  data={data}
                  active={active}
                  deals={deals}
                  tasks={tasks}
                  profile={profile}
                  busy={busy}
                  company={company}
                  setView={setView}
                  setActivityFilter={setActivityFilter}
                  setDealTab={setDealTab}
                  setSelected={setSelected}
                  open={open}
                  save={save}
                />
              ) : (
                <>
                  <div className="toolbar">
                    <div className="search">
                      <Search size={17} />
                      <input
                        placeholder={'Buscar en ' + view.toLowerCase() + '…'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <span>
                      {profile === 'Dirección' ? 'Todo el equipo' : 'Asignados a ' + profile}
                    </span>
                  </div>
                  {view === 'Tratos' && (
                    <DealKanban
                      onNext={nextAction}
                      deals={filtered}
                      tasks={tasks}
                      orders={data.orders}
                      busy={busy}
                      company={company}
                      onOpen={setSelected}
                      onStage={stage}
                    />
                  )}
                  {['Empresas', 'Contactos'].includes(view) &&
                    user &&
                    isAdmin(user.role) &&
                    canAct(user, 'companies') &&
                    canView(user, 'Empresas') && (
                      <CommercialDataTools data={data} onChanged={() => refresh()} />
                    )}
                  {view === 'Empresas' && (
                    <CompanyList
                      busy={busy}
                      onCreateQuote={companyQuote}
                      companies={companies.filter((c) =>
                        matches(c.name + ' ' + c.city + ' ' + c.sector + ' ' + c.owner),
                      )}
                      data={data}
                      deals={deals}
                      onCompany={setCompanyId}
                      onDeal={(id, tab) => {
                        setDealTab(tab);
                        setSelected(id);
                      }}
                      onContact={editContact}
                    />
                  )}
                  {view === 'Contactos' && (
                    <section className="card tablewrap mobile-record-cards">
                      <table>
                        <thead>
                          <tr>
                            <th>Contacto</th>
                            <th>Empresa</th>
                            <th>Correo</th>
                            <th>Teléfono</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.contacts
                            .filter(
                              (c) =>
                                companies.some((x) => x.id === c.companyId) &&
                                matches(
                                  c.name +
                                    ' ' +
                                    company(c.companyId) +
                                    ' ' +
                                    c.email +
                                    ' ' +
                                    c.phone,
                                ),
                            )
                            .map((c) => (
                              <tr key={c.id}>
                                <td data-label="Contacto">
                                  <button className="recordlink" onClick={() => editContact(c.id)}>
                                    {c.name}
                                  </button>
                                  <small>{c.role}</small>
                                </td>
                                <td data-label="Empresa">
                                  <button
                                    className="recordlink"
                                    onClick={() => {
                                      setView('Empresas');
                                      setCompanyId(c.companyId);
                                    }}
                                  >
                                    {company(c.companyId)}
                                  </button>
                                </td>
                                <td data-label="Correo">
                                  {c.email ? <a href={'mailto:' + c.email}>{c.email}</a> : '—'}
                                </td>
                                <td data-label="Teléfono">
                                  {c.phone ? <a href={'tel:' + c.phone}>{c.phone}</a> : '—'}
                                </td>
                                <td data-label="Acciones">
                                  <button onClick={() => editContact(c.id)}>Editar</button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </section>
                  )}
                  {view === 'Presupuestos' && (
                    <QuoteList
                      tasks={data.tasks}
                      onNext={nextAction}
                      filter={quoteFilter}
                      setFilter={setQuoteFilter}
                      deals={filtered}
                      company={company}
                      onOpen={(id) => {
                        setDealTab('Presupuesto');
                        setSelected(id);
                      }}
                      onPrint={printQuote}
                    />
                  )}
                  {view === 'Pedidos' && (
                    <OrderList
                      data={data}
                      filtered={filtered}
                      deals={deals}
                      profile={profile}
                      busy={busy}
                      company={company}
                      setSelected={setSelected}
                      setWorkId={setWorkId}
                      setView={setView}
                      setError={setError}
                      save={save}
                    />
                  )}
                  {view === 'Actividades' && (
                    <ActivityList
                      tasks={tasks.filter((t) =>
                        matches(
                          t.title +
                            ' ' +
                            (deals.find((d) => d.id === t.dealId)?.title || '') +
                            ' ' +
                            company(deals.find((d) => d.id === t.dealId)?.companyId || ''),
                        ),
                      )}
                      deals={deals}
                      company={company}
                      busy={busy}
                      filter={activityFilter}
                      setFilter={setActivityFilter}
                      onCreate={(date) => open('Actividad', date)}
                      onEdit={dealActivity}
                      onOpen={(id) => {
                        setDealTab('Actividades');
                        setSelected(id);
                      }}
                      onComplete={(id, done) => {
                        if (done) setCompleting(id);
                        else
                          void save(completeTask(data, id, false)).then((ok) => {
                            if (ok) setNotice('Actividad reabierta.');
                          });
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
          <footer className="pagefoot">
            {brand.name} · Comercial <span>Primero las relaciones. Después, los resultados.</span>
          </footer>
        </main>
      </div>
      {sel && (!user || canView(user, 'Tratos')) && (
        <DealDetail
          onTabChange={setDealTab}
          onCompany={() => {
            setView('Empresas');
            setCompanyId(sel.companyId);
            setSelected('');
          }}
          initialTab={dealTab}
          key={sel.id}
          deal={sel}
          data={data}
          busy={busy}
          error={error}
          profile={profile}
          onClose={() => {
            setSelected('');
            setDealTab('Resumen');
          }}
          onSave={save}
          onEdit={editDeal}
          onStage={(s) => stage(sel, s)}
          brand={brand}
          onIssue={(openPdf) => issue(sel, openPdf)}
          onPrint={(v) => printQuote(sel, v)}
          onActivity={dealActivity}
          onComplete={(id, done) => {
            if (done) setCompleting(id);
            else
              void save(completeTask(data, id, false)).then((ok) => {
                if (ok) setNotice('Actividad reabierta.');
              });
          }}
        />
      )}
      {businessSettingsOpen && user && data && (
        <BusinessSettingsDialog
          user={user}
          data={data}
          onClose={() => setBusinessSettingsOpen(false)}
        />
      )}
      {accounts && user && (
        <Accounts user={user} onClose={() => setAccounts(false)} onLogout={logout} />
      )}
      {completing && data.tasks.find((t) => t.id === completing) && (
        <ActivityCompletion
          key={completing}
          task={data.tasks.find((t) => t.id === completing)!}
          data={data}
          busy={busy}
          onSave={save}
          onNotice={setNotice}
          onClose={() => setCompleting('')}
        />
      )}
      <RecordFormDialog
        controller={recordForms}
        busy={busy}
        error={error}
        data={data}
        profile={profile}
      />
    </div>
  );
}

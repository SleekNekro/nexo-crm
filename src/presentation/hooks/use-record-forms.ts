'use client';
import { createCompanyQuote } from '../../domain/company-quote';
import type { ActivityPriority } from '../../domain/activity-priority';
import { companyStatus, type CompanyStatus } from '../../domain/company-status';
import { scopedKey } from '../utils/workspace-context';
import { possibleDuplicates } from '../../domain/commercial-followup';
import { recordId } from '../utils/record-id';
import { useEffect, useState } from 'react';
import { editActivityData, editDealData } from '../../domain/actions';
import { type Data, type Task, stages } from '../../domain/model';
import { localDay as day } from '../components/activity-list';
type Props = {
  data: Data | null;
  profile: string;
  view: string;
  companyId: string;
  selected: string;
  busy: boolean;
  save: (data: Data) => Promise<boolean | undefined>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  onOpenCompany: (id: string) => void;
  onOpenQuote: (id: string) => void;
};
const uid = () => recordId();
export function useRecordForms({
  data,
  profile,
  view,
  companyId,
  selected,
  busy,
  save,
  setError,
  setNotice,
  onOpenQuote,
  onOpenCompany,
}: Props) {
  const [modal, setModal] = useState(''),
    [editId, setEditId] = useState(''),
    [form, setForm] = useState<Record<string, string>>({}),
    [formDirty, setFormDirty] = useState(false),
    [ready, setReady] = useState(false);
  const allowed = (owner: string) => profile === 'Dirección' || owner === profile;
  const companies = (data?.companies || []).filter((c) => allowed(c.owner)),
    deals = (data?.deals || []).filter((d) => allowed(d.owner));
  const company = (id: string) => data?.companies.find((c) => c.id === id)?.name || 'Sin empresa';
  const sel = deals.find((d) => d.id === selected),
    focusedCompany = view === 'Empresas' ? companies.find((c) => c.id === companyId) : undefined;
  const formDeals = focusedCompany ? deals.filter((d) => d.companyId === focusedCompany.id) : deals;
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(scopedKey('crm-form-draft')) || 'null');
      if (draft) {
        setForm(draft.form);
        setModal(draft.modal);
        setEditId(draft.editId);
        setFormDirty(true);
      }
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (modal && formDirty)
      sessionStorage.setItem(scopedKey('crm-form-draft'), JSON.stringify({ modal, editId, form }));
    else sessionStorage.removeItem(scopedKey('crm-form-draft'));
  }, [ready, modal, editId, form, formDirty]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (formDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [formDirty]);
  function closeModal() {
    if (busy) return;
    if (formDirty && !confirm('¿Descartar los cambios de este formulario?')) return;
    setFormDirty(false);
    setModal('');
  }
  function open(type: string, due = day()) {
    setFormDirty(false);
    setEditId('');
    setError('');
    setForm({
      owner: profile === 'Dirección' ? focusedCompany?.owner || companies[0]?.owner || '' : profile,
      companyId: focusedCompany?.id || (type === 'Presupuesto' ? '' : companies[0]?.id) || '',
      contactId: (() => {
        const cs = data?.contacts.filter(
          (c) => c.companyId === (focusedCompany?.id || companies[0]?.id),
        );
        return cs?.length === 1 ? cs[0].id : '';
      })(),
      dealId:
        (type === 'Presupuesto'
          ? formDeals.find((d) => !['Ganado', 'Perdido'].includes(d.stage))?.id
          : formDeals[0]?.id) || '',
      quoteMode: 'new',
      due,
      kind: 'Tarea',
    });
    setModal(type);
  }
  function editCompany() {
    if (!focusedCompany) return;
    setFormDirty(false);
    setEditId(focusedCompany.id);
    setForm({ ...focusedCompany, status: companyStatus(focusedCompany, data!) });
    setError('');
    setModal('Empresa');
  }
  function editContact(id: string) {
    const c = data!.contacts.find(
      (x) => x.id === id && companies.some((c) => c.id === x.companyId),
    );
    if (!c) return;
    setFormDirty(false);
    setEditId(id);
    setForm({ ...c });
    setError('');
    setModal('Contacto');
  }
  function editDeal() {
    if (!sel) return;
    setFormDirty(false);
    setEditId(sel.id);
    setForm({
      name: sel.title,
      companyId: sel.companyId,
      owner: sel.owner,
      contactId: sel.contactId || '',
      expectedClose: sel.expectedClose || '',
      description: sel.description || '',
    });
    setError('');
    setModal('Trato');
  }
  function dealActivity(t?: Task) {
    if (!t && !sel) return;
    open('Actividad');
    if (t) {
      setEditId(t.id);
      setForm({
        name: t.title,
        dealId: t.dealId,
        due: t.due,
        kind: t.kind,
        priority: t.priority || '',
        owner: t.owner,
        time: t.time || '',
        durationMinutes: t.durationMinutes?.toString() || '',
      });
    } else if (sel) setForm((f) => ({ ...f, dealId: sel.id, owner: sel.owner }));
  }
  function activityForDeal(id: string) {
    const deal = deals.find((d) => d.id === id);
    if (!deal) return;
    open('Actividad');
    setForm((f) => ({
      ...f,
      dealId: id,
      owner: deal.owner,
      name: 'Seguimiento del cliente',
      kind: 'Seguimiento',
    }));
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.name?.trim()) {
      setError('Introduce un nombre.');
      return;
    }
    if (['Empresa', 'Contacto'].includes(modal)) {
      const duplicates = possibleDuplicates(
        modal === 'Empresa' ? data!.companies : data!.contacts,
        { ...form, id: editId },
      );
      if (
        duplicates.length &&
        !confirm(
          'Coinciden datos con: ' +
            duplicates.map((d) => d.name + ' (' + d.reasons.join(', ') + ')').join('; ') +
            '. ¿Guardar de todos modos?',
        )
      )
        return;
    }
    let n = structuredClone(data!);
    let createdDealId = '';
    let createdCompanyId = '';
    if (modal === 'Empresa') {
      const fields = {
        name: form.name.trim(),
        status: (form.status || 'Posible cliente') as CompanyStatus,
        sector: (form.sector || '').trim(),
        city: (form.city || '').trim(),
        owner: form.owner,
        email: (form.email || '').trim(),
        phone: (form.phone || '').trim(),
        taxId: (form.taxId || '').trim(),
        address: (form.address || '').trim(),
        postalCode: (form.postalCode || '').trim(),
        province: (form.province || '').trim(),
      };
      if (editId) {
        const c = n.companies.find((c) => c.id === editId);
        if (!c || !allowed(c.owner)) {
          setError('No se puede editar esta empresa.');
          return;
        }
        const changed = c.owner !== fields.owner;
        Object.assign(c, fields);
        if (changed) {
          const ids = new Set(n.deals.filter((d) => d.companyId === c.id).map((d) => d.id));
          n.deals.filter((d) => ids.has(d.id)).forEach((d) => (d.owner = c.owner));
          n.tasks.filter((t) => ids.has(t.dealId)).forEach((t) => (t.owner = c.owner));
        }
      } else {
        createdCompanyId = uid();
        n.companies.push({ id: createdCompanyId, ...fields });
      }
    }
    if (modal === 'Contacto') {
      const fields = {
        name: form.name.trim(),
        email: (form.email || '').trim(),
        phone: (form.phone || '').trim(),
        role: (form.role || '').trim(),
      };
      if (editId) {
        const c = n.contacts.find(
          (c) => c.id === editId && companies.some((x) => x.id === c.companyId),
        );
        if (!c) {
          setError('Contacto no encontrado.');
          return;
        }
        Object.assign(c, fields);
      } else n.contacts.push({ id: uid(), companyId: form.companyId, ...fields });
    }
    if (modal === 'Trato') {
      const c = n.companies.find((c) => c.id === form.companyId);
      if (!c) {
        setError('Selecciona una empresa.');
        return;
      }
      const fields = {
        title: form.name.trim(),
        companyId: c.id,
        owner: profile === 'Dirección' ? form.owner || c.owner : c.owner,
        contactId: form.contactId || '',
        expectedClose: form.expectedClose || '',
        description: form.description || '',
      };
      if (editId) {
        try {
          n = editDealData(n, editId, fields);
        } catch (e) {
          setError((e as Error).message);
          return;
        }
      } else {
        createdDealId = uid();
        n.deals.push({ id: createdDealId, ...fields, stage: stages[0], lines: [], versions: [] });
      }
    }
    if (modal === 'Actividad') {
      if (!deals.some((d) => d.id === form.dealId)) {
        setError('Selecciona un trato para asociar la actividad.');
        return;
      }
      if (editId) {
        try {
          n = editActivityData(n, editId, {
            title: form.name.trim(),
            due: form.due,
            kind: form.kind,
            priority: (form.priority || undefined) as ActivityPriority | undefined,
            time: form.time || '',
            durationMinutes:
              form.time && form.durationMinutes ? Number(form.durationMinutes) : null,
          });
        } catch (e) {
          setError((e as Error).message);
          return;
        }
      } else
        n.tasks.push({
          id: uid(),
          dealId: form.dealId,
          title: form.name.trim(),
          due: form.due,
          owner: n.deals.find((d) => d.id === form.dealId)?.owner || form.owner,
          done: false,
          kind: form.kind,
          priority: (form.priority || undefined) as ActivityPriority | undefined,
          time: form.time || '',
          durationMinutes: form.time && form.durationMinutes ? Number(form.durationMinutes) : null,
        });
    }
    if (await save(n)) {
      setFormDirty(false);
      setModal('');
      setEditId('');
      setNotice(
        editId
          ? 'Cambios guardados.'
          : modal === 'Trato'
            ? 'Trato creado. Añade las partidas del presupuesto.'
            : modal === 'Actividad'
              ? 'Actividad programada para el ' +
                new Date(form.due + 'T12:00:00').toLocaleDateString('es-ES') +
                '.'
              : modal === 'Empresa'
                ? 'Empresa creada correctamente.'
                : 'Contacto creado correctamente.',
      );
      if (createdDealId) onOpenQuote(createdDealId);
      if (createdCompanyId) onOpenCompany(createdCompanyId);
    }
  }

  function reset() {
    setModal('');
    setFormDirty(false);
  }
  async function continueQuote(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !data) return;
    setError('');
    if (form.quoteMode === 'existing') {
      if (!deals.some((d) => d.id === form.dealId && !['Ganado', 'Perdido'].includes(d.stage))) {
        setError('Selecciona un trato abierto para continuar su presupuesto.');
        return;
      }
      reset();
      onOpenQuote(form.dealId);
      return;
    }
    if (!companies.some((c) => c.id === form.companyId)) {
      setError('Selecciona la empresa del presupuesto.');
      return;
    }
    try {
      const id = uid();
      if (await save(createCompanyQuote(data, form.companyId, id))) {
        reset();
        onOpenQuote(id);
        setNotice('Presupuesto creado. Añade los productos o partidas.');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return {
    modal,
    editId,
    form,
    setForm,
    setFormDirty,
    formDirty,
    closeModal,
    create,
    continueQuote,
    companies,
    deals,
    company,
    focusedCompany,
    sel,
    formDeals,
    open,
    editCompany,
    editContact,
    editDeal,
    dealActivity,
    activityForDeal,
    reset,
  };
}

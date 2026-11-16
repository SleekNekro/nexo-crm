'use client';
import { useEffect, useRef, useState } from 'react';
import { applyEntityChanges, entityChanges } from '../../domain/entity-changes';
import { mergeIndependent } from '../../domain/merge';
import type { Data } from '../../domain/model';
export function useWorkspaceData() {
  const [notificationData, setNotificationData] = useState<Data | null>(null);
  const notificationVersion = useRef(-1);
  const saveLock = useRef(false);
  function updateNotifications(data: Data, version: number) {
    if (version >= notificationVersion.current) {
      notificationVersion.current = version;
      setNotificationData(data);
    }
  }
  const [data, setData] = useState<Data | null>(null),
    [version, setVersion] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [storage, setStorage] = useState(''),
    [connected, setConnected] = useState(false);
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    const active = () => {
      lastActivity.current = Date.now();
    };
    for (const name of ['pointerdown', 'keydown', 'scroll'])
      window.addEventListener(name, active, { passive: true });
    return () => {
      for (const name of ['pointerdown', 'keydown', 'scroll'])
        window.removeEventListener(name, active);
    };
  }, []);
  useEffect(() => {
    fetch('/api/data')
      .then(async (r) => {
        const b = await r.json();
        if (r.status === 401 || r.status === 403) {
          location.reload();
          return;
        }
        if (!r.ok)
          throw Error(
            b.error ||
              'No se pudieron guardar los cambios. Revisa la conexión y vuelve a intentarlo.',
          );
        setData(b.data);
        if (b.data) updateNotifications(b.data, b.version);
        setVersion(b.version);
        setStorage(b.storage || 'postgres');
        setConnected(true);
      })
      .catch((e) => {
        setConnected(false);
        setError(e.message);
      });
  }, []);
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/data?since=' + notificationVersion.current, {
          headers: {
            'X-Session-Probe':
              document.hidden || Date.now() - lastActivity.current > 60000 ? '1' : '0',
          },
        });
        setConnected(r.ok);
        if (r.status === 401 || r.status === 403) {
          sessionStorage.clear();
          location.reload();
          return;
        }
        if (r.ok) {
          const b = await r.json();
          setStorage(b.storage || 'postgres');
          if (b.data) updateNotifications(b.data, b.version);
        }
      } catch {
        setConnected(false);
      }
    };
    const timer = setInterval(check, 30000);
    window.addEventListener('online', check);
    const offline = () => setConnected(false);
    window.addEventListener('offline', offline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', offline);
    };
  }, []);
  async function refresh() {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fetch('/api/data');
      const b = await r.json();
      if (!r.ok) throw Error(b.error || 'No se pueden actualizar los datos');
      setData(b.data);
      setVersion(b.version);
      if (b.data) updateNotifications(b.data, b.version);
      setConnected(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(next: Data, onSaved?: (saved: Data) => void) {
    if (busy || saveLock.current) return false;
    saveLock.current = true;
    setBusy(true);
    setError('');
    try {
      let base = data!;
      const put = (payload: Data, v: number) =>
        fetch('/api/data', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: v, changes: entityChanges(base, payload) }),
        });
      let r = await put(next, version);
      if (r.status === 409) {
        const refresh = await fetch('/api/data');
        if (!refresh.ok)
          throw Error('No se pueden recuperar los datos actuales. Tu borrador se conserva.');
        const latest = await refresh.json();
        setData(latest.data);
        setVersion(latest.version);
        setConnected(true);
        const merged = mergeIndependent(data!, next, latest.data);
        base = latest.data;
        r = await put(merged, latest.version);
      }
      const b = await r.json();
      if (!r.ok) {
        if (r.status >= 500) setConnected(false);
        throw Error(b.error);
      }
      setConnected(true);
      if (b.changes) {
        b.data = applyEntityChanges(base, b.changes);
        if (b.zoneProgress !== undefined) b.data.zoneProgress = b.zoneProgress;
      }
      setData(b.data);
      if (b.data) updateNotifications(b.data, b.version);
      setVersion(b.version);
      setNotice('Cambios guardados');
      setTimeout(() => setNotice(''), 6000);
      onSaved?.(b.data);
      return true;
    } catch (e) {
      if (e instanceof TypeError) setConnected(false);
      setError((e as Error).message);
      return false;
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  return {
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
  };
}

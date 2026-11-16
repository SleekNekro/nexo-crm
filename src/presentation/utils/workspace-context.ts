let workspaceId = 'nexo';
let accountId = '';
export function configureWorkspace(id: string, userId: string) {
  workspaceId = id;
  accountId = userId;
}
export const scopedKey = (key: string) => `crm:${accountId}:${workspaceId}:${key}`;
export const photoUrl = (src: string) =>
  src.startsWith('/api/photos/') ? src + '?workspace=' + encodeURIComponent(workspaceId) : src;
export function bindWorkspaceFetch(id: string) {
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.href,
    );
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      headers.set('X-CRM-Workspace', id);
      return original(input, { ...init, headers });
    }
    return original(input, init);
  };
  return () => {
    window.fetch = original;
  };
}

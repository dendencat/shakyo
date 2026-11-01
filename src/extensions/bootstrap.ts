// Trusted SDK source evaluated ONLY inside QuickJS, never in the browser realm.
export const BOOTSTRAP = `
(() => {
  const send = globalThis.__send;
  const pending = new Map();
  const handlers = new Map();
  const listeners = new Map();
  let next = 0;
  const call = (method, args) => new Promise((resolve, reject) => {
    if (pending.size >= 16) { reject(new Error('同時処理の上限です。')); return; }
    const id = ++next;
    pending.set(id, { resolve, reject });
    send(JSON.stringify({ type: 'rpc', id, method, args: args ?? null }));
  });
  globalThis.__deliver = (id, ok, value) => {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    if (ok) item.resolve(value); else item.reject(new Error(value));
  };
  const listen = (name, callback) => {
    let set = listeners.get(name);
    if (!set) { set = new Set(); listeners.set(name, set); }
    set.add(callback);
    call('events.subscribe', name).catch(() => set.delete(callback));
    return { dispose() { set.delete(callback); } };
  };
  globalThis.__event = (name, value) => {
    for (const callback of listeners.get(name) || []) callback(value);
  };
  const context = Object.freeze({
    extension: Object.freeze(globalThis.__info),
    subscriptions: [],
    commands: Object.freeze({ register(id, handler) {
      if (!globalThis.__commandIds.includes(id) || typeof handler !== 'function' || handlers.has(id)) throw new Error('コマンド登録が不正です。');
      handlers.set(id, handler);
      return { dispose() { handlers.delete(id); } };
    }}),
    editor: Object.freeze({ getSnapshot: () => call('editor.getSnapshot'), applyEdits: input => call('editor.applyEdits', input), onDidChange: cb => listen('editor', cb) }),
    reference: Object.freeze({ getCurrent: () => call('reference.getCurrent'), openText: input => call('reference.openText', input), openUrl: url => call('reference.openUrl', url), onDidChange: cb => listen('reference', cb) }),
    ui: Object.freeze({ notify: message => call('ui.notify', message), confirm: message => call('ui.confirm', message), input: message => call('ui.input', message), select: (message, options) => call('ui.select', { message, options }) }),
    settings: Object.freeze({ get: key => call('settings.get', key), onDidChange: cb => listen('settings', cb) }),
    storage: Object.freeze({ get: key => call('storage.get', key), set: (key, value) => call('storage.set', { key, value }), delete: key => call('storage.delete', key) }),
    assets: Object.freeze({ readText: path => call('assets.readText', path), readJson: path => call('assets.readJson', path) }),
    network: Object.freeze({ fetch: input => call('network.fetch', input) }),
  });
  globalThis.__dispatch = async (id, operation, value) => {
    try {
      if (operation === 'activate') {
        if (typeof globalThis.__extensionModule.activate !== 'function') throw new Error();
        await globalThis.__extensionModule.activate(context);
      } else if (operation === 'command') {
        if (!handlers.has(value)) throw new Error();
        await handlers.get(value)();
      } else if (operation === 'deactivate') {
        for (const item of context.subscriptions) item.dispose();
        if (globalThis.__extensionModule.deactivate) await globalThis.__extensionModule.deactivate();
      }
      send(JSON.stringify({ type: 'done', id, ok: true }));
    } catch { send(JSON.stringify({ type: 'done', id, ok: false })); }
  };
})();
`

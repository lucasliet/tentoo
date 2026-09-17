const http = await import('node:http');

async function resolveWebSocketImpl() {
  try {
    const ws = await import('ws');
    if (ws.default) return ws.default;
  } catch {}
  return globalThis.WebSocket;
}

/** @param {{ host?: string, port?: number, targetId?: string, url?: string }} options CDP connection options; resolves a page target by targetId or URL, creating one when needed */
export async function connect({ host = 'localhost', port = 9222, targetId, url } = {}) {
  const request = (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.default.request({ host, port, path, method }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data ? JSON.parse(data) : null));
    });
    req.on('error', reject);
    req.end();
  });

  let target;
  if (targetId) {
    target = (await request('/json/list')).find((t) => t.id === targetId);
  } else if (url) {
    target = (await request('/json/list')).find((t) => t.type === 'page' && t.url.startsWith(url));
    if (!target) target = await request('/json/new?' + encodeURIComponent(url), 'PUT');
  }
  if (!target) throw new Error('No matching CDP page target');

  const WebSocketImpl = await resolveWebSocketImpl();
  if (!WebSocketImpl) throw new Error('No WebSocket implementation available; install ws and register its node_modules via js_add_node_module_dir');

  const ws = new WebSocketImpl(target.webSocketDebuggerUrl);
  const rawText = (arg) => (typeof arg === 'string' ? arg : arg?.data !== undefined ? String(arg.data) : String(arg));
  const addHandler = (event, handler) => {
    if (typeof ws.on === 'function') ws.on(event, handler);
    else ws.addEventListener(event, handler);
  };

  let nextId = 0;
  const pending = new Map();
  const pageListeners = [];

  addHandler('message', (arg) => {
    const msg = JSON.parse(rawText(arg));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
    if (msg.method && msg.method.startsWith('Page.')) {
      for (const listener of [...pageListeners]) listener(msg);
    }
  });

  await new Promise((resolve, reject) => {
    addHandler('open', resolve);
    addHandler('error', reject);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');

  return {
    targetId: target.id,
    ws,
    send,
    onPageEvent: (handler) => pageListeners.push(handler),
    /** @param {string} expression @returns {Promise<any>} Evaluated value; throws on page exception */
    evalJs: async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) {
        throw new Error('PAGE EXC: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
      }
      return result.result.value;
    },
    /** @returns {Promise<void>} Resolves on the next Page.loadEventFired */
    waitForLoad: () => new Promise((resolve) => {
      const handler = (msg) => {
        if (msg.method === 'Page.loadEventFired') {
          pageListeners.splice(pageListeners.indexOf(handler), 1);
          resolve();
        }
      };
      pageListeners.push(handler);
    }),
    /** @returns {Promise<Buffer>} PNG screenshot of the viewport */
    screenshot: async () => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(shot.data, 'base64');
    },
    close: () => ws.close()
  };
}

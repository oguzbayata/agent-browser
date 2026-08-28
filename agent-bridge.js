'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const BODY_LIMIT = 1024 * 1024;
const CATALOG = Object.freeze({
  name: 'Agent Browser Control Plane',
  multiAgent: true,
  bind: '127.0.0.1',
  hint: 'Have each agent open its own tab (POST /v1/tabs). Tag the job with X-Agent-Id. Send activate: true to bring a tab forward.',
  endpoints: [
    'GET /v1',
    'GET /v1/health',
    'GET /v1/tabs',
    'POST /v1/tabs',
    'GET /v1/tabs/:id',
    'DELETE /v1/tabs/:id',
    'POST /v1/tabs/:id/activate',
    'POST /v1/tabs/:id/navigate',
    'POST /v1/tabs/:id/back',
    'POST /v1/tabs/:id/forward',
    'POST /v1/tabs/:id/reload',
    'GET /v1/tabs/:id/text',
    'GET /v1/tabs/:id/screenshot',
    'POST /v1/tabs/:id/evaluate',
    'POST /v1/tabs/:id/click',
    'POST /v1/tabs/:id/type',
  ],
});

let server = null;
let listenInfo = null;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function isLocalOrigin(origin) {
  if (!origin) {
    return true;
  }
  try {
    const parsed = new URL(origin);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Agent-Token, X-Agent-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
}

function tokensEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length === 0 || left.length !== right.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

function readToken(req, url) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const custom = req.headers['x-agent-token'];
  if (typeof custom === 'string' && custom.trim()) {
    return custom.trim();
  }
  const queryToken = url.searchParams.get('token');
  return queryToken ? queryToken.trim() : '';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || req.method === 'DELETE') {
      resolve({});
      return;
    }

    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid-json'));
      }
    });
    req.on('error', reject);
  });
}

async function route(method, parts, body, agentId, handlers) {
  if (method === 'GET' && parts.length === 1 && parts[0] === 'v1') {
    return { status: 200, payload: { ok: true, ...CATALOG } };
  }
  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'health' && parts.length === 2) {
    return { status: 200, payload: await handlers.health() };
  }
  if (method === 'GET' && parts[0] === 'v1' && parts[1] === 'tabs' && parts.length === 2) {
    return { status: 200, payload: await handlers.listTabs() };
  }
  if (method === 'POST' && parts[0] === 'v1' && parts[1] === 'tabs' && parts.length === 2) {
    return { status: 201, payload: await handlers.createTab(body, agentId) };
  }

  if (parts[0] === 'v1' && parts[1] === 'tabs' && parts.length >= 3) {
    const tabId = parts[2];
    const action = parts[3];
    if (method === 'GET' && parts.length === 3) {
      return { status: 200, payload: await handlers.getTab(tabId) };
    }
    if (method === 'DELETE' && parts.length === 3) {
      return { status: 200, payload: await handlers.closeTab(tabId) };
    }
    if (method === 'POST' && action === 'activate' && parts.length === 4) {
      return { status: 200, payload: await handlers.activateTab(tabId) };
    }
    if (method === 'POST' && action === 'navigate' && parts.length === 4) {
      return { status: 200, payload: await handlers.navigate(tabId, body) };
    }
    if (method === 'POST' && action === 'back' && parts.length === 4) {
      return { status: 200, payload: await handlers.back(tabId) };
    }
    if (method === 'POST' && action === 'forward' && parts.length === 4) {
      return { status: 200, payload: await handlers.forward(tabId) };
    }
    if (method === 'POST' && action === 'reload' && parts.length === 4) {
      return { status: 200, payload: await handlers.reload(tabId) };
    }
    if (method === 'GET' && action === 'text' && parts.length === 4) {
      return { status: 200, payload: await handlers.text(tabId) };
    }
    if (method === 'GET' && action === 'screenshot' && parts.length === 4) {
      return { status: 200, payload: await handlers.screenshot(tabId) };
    }
    if (method === 'POST' && action === 'evaluate' && parts.length === 4) {
      return { status: 200, payload: await handlers.evaluate(tabId, body) };
    }
    if (method === 'POST' && action === 'click' && parts.length === 4) {
      return { status: 200, payload: await handlers.click(tabId, body) };
    }
    if (method === 'POST' && action === 'type' && parts.length === 4) {
      return { status: 200, payload: await handlers.type(tabId, body) };
    }
  }

  return { status: 404, payload: { ok: false, error: 'not-found' } };
}

async function handleRequest(req, res, getToken, handlers) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let url;
  try {
    url = new URL(req.url || '/', 'http://127.0.0.1');
  } catch {
    json(res, 400, { ok: false, error: 'bad-url' });
    return;
  }

  if (!tokensEqual(readToken(req, url), getToken())) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    const code = error instanceof Error && error.message === 'too-large' ? 413 : 400;
    json(res, code, { ok: false, error: code === 413 ? 'too-large' : 'invalid-json' });
    return;
  }

  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const agentId = typeof req.headers['x-agent-id'] === 'string' ? req.headers['x-agent-id'].trim().slice(0, 80) : '';
  const result = await route(req.method, parts, body, agentId, handlers);
  json(res, result.status, result.payload);
}

function startAgentBridgeServer({ host, port, getToken, handlers }) {
  if (server) {
    return Promise.resolve(listenInfo);
  }

  return new Promise((resolve, reject) => {
    const httpServer = http.createServer((req, res) => {
      handleRequest(req, res, getToken, handlers).catch(() => {
        if (!res.writableEnded) {
          json(res, 500, { ok: false, error: 'internal' });
        }
      });
    });

    const onError = (error) => {
      httpServer.off('error', onError);
      reject(error);
    };
    httpServer.once('error', onError);
    httpServer.listen(port, host, () => {
      httpServer.off('error', onError);
      server = httpServer;
      const address = httpServer.address();
      listenInfo = {
        host,
        port: address && typeof address === 'object' ? address.port : port,
      };
      resolve(listenInfo);
    });
  });
}

function stopAgentBridgeServer() {
  return new Promise((resolve) => {
    if (!server) {
      listenInfo = null;
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      listenInfo = null;
      resolve();
    });
  });
}

function getListenInfo() {
  return listenInfo;
}

module.exports = {
  startAgentBridgeServer,
  stopAgentBridgeServer,
  getListenInfo,
};

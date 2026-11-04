import { randomBytes, randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node-pty';

const loopback = (ip) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
const cookieName = 'kelaode_terminal';
const tokenOf = (req) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
const send = (ws, value) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 1024 * 1024) return ws.close(1013, 'Slow connection');
  ws.send(JSON.stringify(value));
};
const dimensions = (cols, rows) => Number.isInteger(cols) && Number.isInteger(rows) && cols >= 2 && cols <= 500 && rows >= 1 && rows <= 300;

// Deliberately local-only: this capability must not become a public shell behind a proxy.
export function createTerminalService(env = process.env, options = {}) {
  const owners = new Map(), sessions = new Map();
  const cwd = resolve(options.cwd || process.cwd());
  const shell = options.shell || process.env.SHELL || '/bin/bash';
  const enabled = env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost', '::1'].includes(env.HOST || '127.0.0.1');
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  function allowed(req) {
    if (!enabled || !loopback(req.socket.remoteAddress) || req.headers.forwarded || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) return false;
    try {
      const host = new URL('http://' + req.headers.host);
      const port = String(req.socket.localPort);
      return ['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) && host.port === port && req.headers.origin === host.origin;
    } catch { return false; }
  }
  function remove(session) {
    sessions.delete(session.id);
    for (const ws of session.clients) ws.close(1000, 'Session closed');
    try { session.pty.kill(); } catch { /* Already exited. */ }
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) if (!session.clients.size && now - session.detachedAt > 30 * 60 * 1000) remove(session);
    for (const [token, time] of owners) if (now - time > 24 * 60 * 60 * 1000) {
      owners.delete(token);
      for (const s of sessions.values()) if (s.owner === token) remove(s);
    }
  }, 60000);
  sweep.unref();
  return {
    handle(req, res) {
      if (req.url?.split('?')[0] !== '/api/terminal/bootstrap') return false;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method !== 'POST' || !allowed(req)) {
        res.writeHead(403).end(JSON.stringify({ error: '终端仅支持本机开发服务。请从 http://127.0.0.1:4174 打开。' })); return true;
      }
      let owner = tokenOf(req);
      if (!owners.has(owner)) {
        if (owners.size >= 100) { res.writeHead(429).end('{}'); return true; }
        owner = randomBytes(32).toString('hex');
      }
      owners.set(owner, Date.now());
      res.setHeader('Set-Cookie', `${cookieName}=${owner}; HttpOnly; SameSite=Strict; Path=/api/terminal`);
      res.end(JSON.stringify({ cwd, project: basename(cwd), shell: basename(shell), host: '本机', sessions: [...sessions.values()].filter(s => s.owner === owner).map(s => ({ id: s.id, label: s.label, exited: s.exited })) }));
      return true;
    },
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        if (req.url?.split('?')[0] !== '/api/terminal/socket') return;
        const owner = tokenOf(req);
        if (!allowed(req) || !owners.has(owner)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
        const query = new URL(req.url, 'http://localhost').searchParams;
        const requested = query.get('id');
        let session = requested ? sessions.get(requested) : null;
        if ((requested && (!session || session.owner !== owner)) || (!requested && [...sessions.values()].filter(s => s.owner === owner).length >= 8)) {
          socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          if (!session) {
            try {
              const childEnv = Object.fromEntries(['HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
              const pty = spawn(shell, options.shellArgs || ['-i'], { cwd, cols: 100, rows: 30, name: 'xterm-256color', env: { ...childEnv, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
              session = { id: randomUUID(), owner, label: basename(shell), pty, clients: new Set(), history: '', exited: false, detachedAt: Date.now() };
              sessions.set(session.id, session);
              pty.onData(data => {
                session.history = (session.history + data).slice(-256000);
                for (const client of session.clients) send(client, { type: 'output', data });
              });
              pty.onExit(({ exitCode }) => {
                session.exited = true;
                for (const client of session.clients) send(client, { type: 'exit', exitCode });
              });
            } catch { send(ws, { type: 'error', message: 'Shell 启动失败，请检查服务器终端依赖。' }); ws.close(); return; }
          }
          session.clients.add(ws);
          send(ws, { type: 'ready', id: session.id, label: session.label, history: session.history, exited: session.exited });
          ws.on('message', raw => {
            let message;
            try { message = JSON.parse(raw.toString()); } catch { ws.close(1008, 'Invalid message'); return; }
            if (!message || typeof message !== 'object') return;
            try {
              if (message.type === 'input' && typeof message.data === 'string' && message.data.length <= 32768 && !session.exited) session.pty.write(message.data);
              if (message.type === 'resize' && dimensions(message.cols, message.rows) && !session.exited) session.pty.resize(message.cols, message.rows);
              if (message.type === 'terminate') remove(session);
            } catch { send(ws, { type: 'error', message: '终端进程已不可用，请新建会话。' }); }
          });
          ws.on('close', () => { session.clients.delete(ws); session.detachedAt = Date.now(); });
          ws.on('error', () => {});
        });
      });
      server.on('close', () => this.close());
    },
    close() { clearInterval(sweep); for (const s of sessions.values()) remove(s); wss.close(); },
  };
}

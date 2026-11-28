/* Local dev server: static files + POST /api/realistic (same handler as on Vercel).
   Run: node --env-file=.env.local tools/dev-server.js   (PORT defaults to 3000) */

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const handler = require('../api/realistic.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 4_000_000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    req.on('error', reject);
  });
}

/* Minimal Vercel-like res: status().json() */
function wrapRes(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    json(obj) { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return this; },
  };
}

async function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.statusCode = 400; res.end('Bad request'); return; }
  const file = path.resolve(ROOT, `.${urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath}`);
  const blocked = !file.startsWith(ROOT + path.sep) || path.relative(ROOT, file).split(path.sep).some(p => p.startsWith('.'));
  if (blocked) { res.statusCode = 403; res.end('Forbidden'); return; }
  try {
    const data = await fs.readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
}

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/realistic')) {
    try {
      const body = req.method === 'POST' ? await readJson(req) : null;
      const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
      await handler({ method: req.method, query, headers: { 'x-forwarded-for': req.socket.remoteAddress, ...req.headers }, body }, wrapRes(res));
    } catch (err) {
      wrapRes(res).status(err.status || 500).json({ error: 'Ошибка сервера' });
    }
    return;
  }
  await serveStatic(req, res);
}).listen(PORT, '127.0.0.1', () => process.stdout.write(`Dev server: http://localhost:${PORT}\n`));

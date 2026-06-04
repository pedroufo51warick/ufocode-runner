// Mini servidor de controle do runner — UFOCode.
// Roda em :8081 e é proxied pelo vite em /_runner/* (porta 8080).
// Não — fizemos diferente: o vite expõe :8080 direto e este servidor faz
// bind em :8081 escutando localmente; o entrypoint usa um proxy embutido?
// Simplificação: deixamos vite servir :8080 e este servidor escuta :8081
// externo via Fly internal services? Para simplificar drasticamente, esse
// servidor escuta também na porta 8080 ANTES do vite e faz proxy de tudo
// que não começa com /_runner para o vite em 8082.
//
// Para evitar dois processos disputando a 8080, a estratégia é:
//   - Este servidor (fastify) escuta em :8080 (público)
//   - Faz proxy http simples para http://127.0.0.1:8082 (vite)
//   - Trata /_runner/* localmente
//
// O entrypoint deve subir vite em PORT_INTERNAL=8082.
import Fastify from 'fastify';
import { readFile, writeFile, readdir, stat, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const PORT = parseInt(process.env.PORT || '8080', 10);
const VITE_PORT = parseInt(process.env.VITE_PORT || '8082', 10);
const RUNNER_KEY = process.env.UFOCODE_RUNNER_KEY;
const ROOT = '/data/src';

if (!RUNNER_KEY) {
  console.error('UFOCODE_RUNNER_KEY missing');
  process.exit(1);
}

const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });

app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/_runner/')) return;
  if (req.headers['x-runner-key'] !== RUNNER_KEY) {
    reply.code(401).send({ error: 'unauthorized' });
  }
});

function safe(p) {
  const abs = path.resolve(ROOT, p);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) throw new Error('path escape');
  return abs;
}

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs, rel)));
    else out.push(rel);
  }
  return out;
}

const startedAt = Date.now();

app.get('/_runner/health', async () => ({ ok: true, uptime_s: Math.round((Date.now() - startedAt) / 1000) }));

app.get('/_runner/files', async () => ({ files: await walk(ROOT) }));

app.get('/_runner/file', async (req, reply) => {
  const p = req.query?.path;
  if (!p) return reply.code(400).send({ error: 'path obrigatório' });
  const abs = safe(p);
  const content = await readFile(abs, 'utf8');
  return { content };
});

app.post('/_runner/apply-patch', async (req, reply) => {
  const { files } = req.body || {};
  if (!Array.isArray(files)) return reply.code(400).send({ error: 'files obrigatório' });
  for (const f of files) {
    const abs = safe(f.path);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, f.content ?? '', 'utf8');
  }
  return { ok: true, applied: files.length };
});

app.post('/_runner/delete-file', async (req, reply) => {
  const { path: p } = req.body || {};
  if (!p) return reply.code(400).send({ error: 'path obrigatório' });
  const abs = safe(p);
  if (existsSync(abs)) await unlink(abs);
  return { ok: true };
});

app.post('/_runner/restart', async () => {
  setTimeout(() => process.exit(0), 250); // Fly reinicia a machine
  return { ok: true };
});

// Proxy reverso pro vite (porta interna)
app.all('/*', async (req, reply) => {
  if (req.url.startsWith('/_runner/')) return; // já tratado
  await new Promise((resolve) => {
    const upstream = http.request({
      host: '127.0.0.1', port: VITE_PORT, path: req.url, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${VITE_PORT}` },
    }, (upRes) => {
      reply.code(upRes.statusCode || 502);
      for (const [k, v] of Object.entries(upRes.headers)) reply.header(k, v);
      upRes.pipe(reply.raw);
      upRes.on('end', resolve);
    });
    upstream.on('error', (e) => {
      reply.code(502).send({ error: 'vite indisponível', detail: e.message });
      resolve();
    });
    if (req.body) upstream.end(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    else req.raw.pipe(upstream);
  });
});

app.listen({ host: '0.0.0.0', port: PORT }).then(() => {
  console.log(`[runner-server] up :${PORT} → vite :${VITE_PORT}`);
});
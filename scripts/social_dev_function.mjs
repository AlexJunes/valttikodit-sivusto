// Paikallinen testipalvelin Some-julkaisupalvelulle (EI oikeaa Facebookia).
// Käynnistys (repon juuressa):   node scripts/social_dev_function.mjs
// - 127.0.0.1:8788  = social-publish -funktio (sama koodi kuin Supabase Edge Functionissa)
// - 127.0.0.1:8789  = Facebook Graph API -jäljitelmä, joka tallentaa kutsut muistiin ja vastaa kuten Facebook
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const src = readFileSync(new URL('../supabase/functions/social-publish/index.ts', import.meta.url), 'utf8');
const tmp = '/tmp/_social_publish_dev.mjs';
writeFileSync(tmp, src);
const { handle } = await import(pathToFileURL(tmp).href + '?t=' + Date.now());

const status = JSON.parse(execSync('supabase status -o json', { env: { ...process.env, PATH: process.env.PATH + ':' + process.env.HOME + '/.docker/bin' } }).toString().replace(/^[^{]*/, ''));
const env = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SECRET_KEY || status.SERVICE_ROLE_KEY,
  META_PAGE_ID: '1234567890', META_PAGE_TOKEN: 'local-test-token', GRAPH_BASE: 'http://127.0.0.1:8789',
};

const calls = [];
http.createServer((req, res) => {   // Graph-jäljitelmä
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    calls.push({ method: req.method, url: req.url.replace(/access_token=[^&]*/, 'access_token=***'), body: b.replace(/access_token=[^&]*/, 'access_token=***') });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') res.end(JSON.stringify({ id: '1234567890_' + (100 + calls.length) }));
    else if (req.method === 'DELETE') res.end(JSON.stringify({ success: true }));
    else if (/fields=name/.test(req.url)) res.end(JSON.stringify({ name: 'Valttikodit Oy (testi)', followers_count: 58 }));
    else res.end(JSON.stringify({ is_published: true, permalink_url: 'https://www.facebook.com/test/posts/1' }));
  });
}).listen(8789, '127.0.0.1');

http.createServer(async (req, res) => {
  if (req.url === '/_calls') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(calls, null, 1)); return; }
  const chunks = []; for await (const c of req) chunks.push(c);
  const url = `http://${req.headers.host}${req.url}`;
  const r = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const out = await handle(r, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(8788, '127.0.0.1', () => console.log('social-publish dev: http://127.0.0.1:8788 (Graph-jäljitelmä :8789, kutsut: /_calls)'));

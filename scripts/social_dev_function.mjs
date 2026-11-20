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
  META_PAGE_ID: '1234567890', META_PAGE_TOKEN: 'local-test-token', GRAPH_BASE: 'http://127.0.0.1:8789', RUPLOAD_BASE: 'http://127.0.0.1:8789/rupload', CRON_SECRET: 'local-cron-secret',
};

const calls = [];
const igContainers = {}, igPublished = [];
http.createServer((req, res) => {   // Graph-jäljitelmä
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const hasToken = /access_token=local-test-token/.test(req.url + '&' + b);   // Facebook vaatii avaimen myos DELETE-kutsussa
    calls.push({ method: req.method, url: req.url.replace(/access_token=[^&]*/, 'access_token=***'), body: b.replace(/access_token=[^&]*/, 'access_token=***'), hasToken });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && /^\/rupload\//.test(req.url)) {   // rupload: avain Authorization-otsakkeessa, video file_url-otsakkeessa
      const ok = req.headers.authorization === 'OAuth local-test-token' && /^https:\/\//.test(req.headers.file_url || '');
      calls[calls.length - 1].file_url = req.headers.file_url || null;
      if (!ok) res.statusCode = 400;
      res.end(JSON.stringify(ok ? { success: true } : { debug_info: { message: 'Invalid file_url or token' } })); return;
    }
    if (!hasToken) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: "Unsupported delete request. Object with ID does not exist, cannot be loaded due to missing permissions, or does not support this operation" } })); return; }
    // ---- Instagram (tili 17840000000000001): kontti -> kasittely -> media_publish ----
    const IG = '17840000000000001';
    if (req.method === 'GET' && /^\/1234567890\?/.test(req.url) && /instagram_business_account/.test(req.url)) { res.end(JSON.stringify({ id: '1234567890', instagram_business_account: { id: IG } })); return; }
    if (req.method === 'POST' && req.url === `/${IG}/media`) {
      const q = new URLSearchParams(b);
      if (/badratio/.test(q.get('image_url') || '')) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: 'The aspect ratio is not supported.' } })); return; }
      const id = '91' + (100 + calls.length); igContainers[id] = { video: q.get('media_type') === 'REELS', polls: 0, caption: q.get('caption') };
      res.end(JSON.stringify({ id })); return;
    }
    if (req.method === 'GET' && /^\/91\d+\?/.test(req.url)) {   // kontin tila: video kasittelee yhden kierroksen
      const c = igContainers[req.url.match(/^\/(\d+)/)[1]] || { video: false, polls: 0 }; c.polls++;
      res.end(JSON.stringify({ status_code: c.video && c.polls < 2 ? 'IN_PROGRESS' : 'FINISHED' })); return;
    }
    if (req.method === 'POST' && req.url === `/${IG}/media_publish`) { const id = '92' + (100 + calls.length); igPublished.push({ id, creation: new URLSearchParams(b).get('creation_id') }); res.end(JSON.stringify({ id })); return; }
    if (req.method === 'GET' && /^\/92\d+\?/.test(req.url)) { const id = req.url.match(/^\/(\d+)/)[1]; res.end(JSON.stringify({ id, permalink: `https://www.instagram.com/p/${id}/`, timestamp: new Date().toISOString() })); return; }
    if (req.method === 'GET' && req.url.startsWith(`/${IG}?`)) { res.end(JSON.stringify({ id: IG, username: 'valttikodit_oy_testi', followers_count: 174 })); return; }
    if (req.method === 'GET' && req.url.startsWith(`/${IG}/media?`)) {
      const data = igPublished.map((x) => ({ id: x.id, caption: 'Testijulkaisu', media_type: 'IMAGE', permalink: `https://www.instagram.com/p/${x.id}/`, timestamp: new Date().toISOString(), like_count: 5, comments_count: 1 }));
      data.push({ id: '9000', caption: 'x'.repeat(299) + '\u{1F3E1} Emoji osuu katkaisukohtaan', media_type: 'VIDEO', permalink: 'https://www.instagram.com/reel/9000/', timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), like_count: 20, comments_count: 3 });
      res.end(JSON.stringify({ data })); return;
    }
    if (req.method === 'GET' && /^\/(92\d+|9000)\/insights/.test(req.url)) {
      res.end(JSON.stringify({ data: [{ name: 'reach', period: 'lifetime', values: [{ value: 120 }] }, { name: 'views', period: 'lifetime', values: [{ value: 300 }] }, { name: 'saved', period: 'lifetime', values: [{ value: 4 }] }, { name: 'shares', period: 'lifetime', values: [{ value: 2 }] }] })); return;
    }
    if (req.method === 'GET' && /fields=id$/.test(req.url.replace(/&access_token=[^&]*/, ''))) { res.end(JSON.stringify({ id: 'x' })); return; }
    if (req.method === 'GET' && /\/insights\?/.test(req.url)) {   // tilastot
      const metrics = decodeURIComponent((req.url.match(/metric=([^&]*)/) || [])[1] || '').split(',');
      if (/^\/1234567890\/insights/.test(req.url)) {   // sivun taso: 8 paivaa
        const vals = Array.from({ length: 8 }, (_, i) => ({ value: 100 + i * 10 + (metrics[0] === 'page_follows' ? 50 : 0), end_time: new Date(Date.now() - (7 - i) * 86400000).toISOString().slice(0, 10) + 'T07:00:00+0000' }));
        res.end(JSON.stringify({ data: [{ name: metrics[0], period: 'day', values: vals }] })); return;
      }
      const o = { post_media_view: 337, post_total_media_view_unique: 190, post_clicks: 14, post_reactions_by_type_total: { like: 12, love: 2 } };
      // Facebook palauttaa osalle mittareista sekä lifetime- että day-rivin (day-rivi voi olla 0)
      const data = metrics.map((m) => ({ name: m, period: 'lifetime', values: [{ value: o[m] ?? 0 }] }));
      if (metrics.includes('post_total_media_view_unique')) data.push({ name: 'post_total_media_view_unique', period: 'day', values: [{ value: 0, end_time: '2026-11-10T08:00:00+0000' }] });
      res.end(JSON.stringify({ data })); return;
    }
    if (req.method === 'GET' && /^\/1234567890\/posts\?/.test(req.url)) {   // sivun julkaisut (yksi vastaa ajastettua testijulkaisua)
      const mine = calls.filter((c) => c.method === 'POST' && /\/(feed|photos)$/.test(c.url)).length ? '1234567890_101' : null;
      const data = [{ id: '1234567890_900', created_time: new Date(Date.now() - 5 * 86400000).toISOString(), message: 'Vanha julkaisu (ei yllapidosta)', permalink_url: 'https://www.facebook.com/x/posts/900' }];
      if (mine) data.unshift({ id: mine, created_time: new Date(Date.now() - 3600000).toISOString(), message: 'Testijulkaisu ylapidosta', permalink_url: 'https://www.facebook.com/x/posts/101' });
      res.end(JSON.stringify({ data })); return;
    }
    // Reels: aloitus, videon haku osoitteesta (rupload) ja ajastus
    if (req.method === 'POST' && /\/video_reels$/.test(req.url)) {
      if (/upload_phase=start/.test(b)) res.end(JSON.stringify({ video_id: String(7000 + calls.length), upload_url: 'http://127.0.0.1:8789/rupload/x' }));
      else res.end(JSON.stringify({ success: /video_state=SCHEDULED/.test(b) && /scheduled_publish_time=\d+/.test(b) }));
      return;
    }
    if (req.method === 'GET' && /^\/\d+\?/.test(req.url) && /fields=status/.test(req.url)) {   // videon tila
      const id = req.url.match(/^\/(\d+)/)[1];
      if (id === '7999') res.end(JSON.stringify({ id, status: { video_status: 'error', processing_phase: { status: 'error', error: { message: 'Video is too short' } }, publishing_phase: { status: 'not_started' } } }));
      else res.end(JSON.stringify({ id, post_id: '88' + id, permalink_url: `/reel/${id}/`, created_time: new Date().toISOString(), status: { video_status: 'ready', publishing_phase: { status: 'complete', publish_status: 'published', publish_time: new Date(Date.now() - 600000).toISOString() } } }));
      return;
    }
    // Kuten Facebook: ajastettu KUVA palauttaa pelkän kuvan tunnisteen (ei alaviivaa), tekstijulkaisu sivu_julkaisu-tunnisteen
    if (req.method === 'POST' && /\/photos$/.test(req.url)) res.end(JSON.stringify({ id: String(5000 + calls.length) }));
    else if (req.method === 'GET' && /^\/\d+\?/.test(req.url) && !/^\/1234567890\?/.test(req.url)) {   // kuvaobjekti
      const id = req.url.match(/^\/(\d+)/)[1];
      if (/is_published/.test(req.url)) { res.statusCode = 400; res.end(JSON.stringify({ error: { message: '(#100) Tried accessing nonexisting field (is_published)' } })); }
      else res.end(JSON.stringify({ id, page_story_id: '1234567890_' + id }));
    }
    else if (req.method === 'POST') res.end(JSON.stringify({ id: '1234567890_' + (100 + calls.length) }));
    else if (req.method === 'DELETE') res.end(JSON.stringify({ success: true }));
    else if (/fields=name/.test(req.url)) res.end(JSON.stringify({ name: 'Valttikodit Oy (testi)', followers_count: 58 }));
    else res.end(JSON.stringify({ is_published: true, permalink_url: 'https://www.facebook.com/test/posts/1', created_time: new Date(Date.now() - 3600000).toISOString() }));
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
}).listen(8788, '0.0.0.0', () => console.log('social-publish dev: http://127.0.0.1:8788 (Graph-jäljitelmä :8789, kutsut: /_calls)'));

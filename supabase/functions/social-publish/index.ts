// Edge Function: social-publish
// Yllapitosivun Some-hallinnan julkaisupalvelu. Ainoa paikka, jossa Facebook-avain (META_PAGE_TOKEN) on kaytossa.
// Toiminnot: health | schedule | cancel | refresh. Kutsuja tunnistetaan Supabase-istunnolla (vain yllapitaja + MFA).
// Facebookiin tehdaan vain: ajastettu julkaisu (POST), ajastuksen peruutus (DELETE) ja luku (GET). Julkaisua ei koskaan tehda heti.
// Salaisuudet (Supabase -> Edge Functions -> Secrets): META_PAGE_ID, META_PAGE_TOKEN. SUPABASE_* tulevat automaattisesti.

const ALLOWED_ORIGINS = ['https://www.valttikodit.fi', 'https://valttikodit.fi', 'http://localhost:8099', 'http://127.0.0.1:8099'];
const MIN_LEAD_MS = 11 * 60 * 1000;            // Facebook vaatii vahintaan 10 min; varmuusvara
const MAX_LEAD_MS = 29 * 24 * 60 * 60 * 1000;  // enintaan 30 vrk eteenpain; varmuusvara

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
}

function decodeJwt(token) {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4)));
  } catch (e) { return null; }
}

export async function handle(req, env, f = fetch, now = () => Date.now()) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { ok: false, error: 'Vain POST' });

  const GRAPH = env.GRAPH_BASE || 'https://graph.facebook.com/v26.0';
  const PAGE = env.META_PAGE_ID, TOKEN = env.META_PAGE_TOKEN;
  const scrub = (s) => String(s == null ? '' : s).split(TOKEN || '\u0000').join('***').slice(0, 500);

  // 1. Tunnistautuminen: (a) ajastettu yoajo salaisuudella (vain sync) tai (b) yllapitaja + MFA (aal2)
  let body = {};
  try { body = await req.json(); } catch (e) { return json(req, 400, { ok: false, error: 'Virheellinen pyynto' }); }
  const cronOk = !!env.CRON_SECRET && req.headers.get('x-cron-secret') === env.CRON_SECRET;
  let actor = 'cron';
  if (cronOk) {
    if (body.action !== 'sync') return json(req, 403, { ok: false, error: 'Cron saa tehda vain sync-toiminnon' });
  } else {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const claims = jwt ? decodeJwt(jwt) : null;
    if (!claims || claims.aal !== 'aal2') return json(req, 403, { ok: false, error: 'Kirjautuminen ja kaksivaiheinen tunnistus vaaditaan' });
    const adminRes = await f(`${env.SUPABASE_URL}/rest/v1/rpc/is_site_admin`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!adminRes.ok || (await adminRes.json()) !== true) return json(req, 403, { ok: false, error: 'Vain yllapitaja' });
    actor = claims.email || 'tuntematon';
  }
  if (!PAGE || !TOKEN) return json(req, 500, { ok: false, error: 'Facebook-asetukset (META_PAGE_ID, META_PAGE_TOKEN) puuttuvat julkaisupalvelusta' });

  const SR = env.SUPABASE_SERVICE_ROLE_KEY;
  const db = async (method, path, payload, prefer) => {
    const r = await f(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method, headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const t = await r.text();
    if (!r.ok) throw new Error('Tietokantavirhe: ' + t.slice(0, 200));
    return t ? JSON.parse(t) : [];
  };
  const graph = async (method, path, params) => {
    const form = new URLSearchParams({ ...(params || {}), access_token: TOKEN });
    const url = `${GRAPH}/${path}`;
    // GET ja DELETE: avain kyselyparametrina; POST: lomakkeen mukana
    const r = (method === 'GET' || method === 'DELETE') ? await f(`${url}?${form}`, { method }) : await f(url, { method, body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const t = await r.text();
    let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { raw: t }; }
    if (!r.ok || j.error) throw new Error(scrub((j.error && (j.error.message || j.error.error_user_msg)) || 'Facebook-virhe ' + r.status));
    return j;
  };
  const getPost = async (id) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new Error('Virheellinen julkaisun tunniste');
    const rows = await db('GET', `social_posts?id=eq.${id}&select=*`);
    if (!rows.length) throw new Error('Julkaisua ei l\u00f6ytynyt');
    return rows[0];
  };
  const fail = async (post, msg) => { try { await db('PATCH', `social_posts?id=eq.${post.id}`, { last_error: msg }); } catch (e) {} return json(req, 200, { ok: false, error: msg }); };

  try {
    // ---- health ----
    if (body.action === 'health') {
      const r = await graph('GET', PAGE, { fields: 'name,followers_count' });
      return json(req, 200, { ok: true, page: r.name, followers: r.followers_count ?? null });
    }

    // ---- schedule ----
    if (body.action === 'schedule') {
      const post = await getPost(body.post_id);
      if (post.status !== 'APPROVED' || !post.approved_by) return json(req, 200, { ok: false, error: 'Julkaisu pit\u00e4\u00e4 hyv\u00e4ksy\u00e4 ennen ajastusta' });
      if (!post.scheduled_at) return json(req, 200, { ok: false, error: 'Ajankohta puuttuu' });
      const t = Date.parse(post.scheduled_at);
      if (!(t >= now() + MIN_LEAD_MS)) return fail(post, 'Ajankohdan pit\u00e4\u00e4 olla v\u00e4hint\u00e4\u00e4n 11 minuutin p\u00e4\u00e4ss\u00e4');
      if (!(t <= now() + MAX_LEAD_MS)) return fail(post, 'Facebook ajastaa enint\u00e4\u00e4n 30 p\u00e4iv\u00e4\u00e4 eteenp\u00e4in');
      if (/\[LIS[\u00c4A]{1}[^\]]*\]/i.test(post.body || '') || !(post.body || '').trim()) return fail(post, 'Tekstiss\u00e4 on t\u00e4ytt\u00e4m\u00e4t\u00f6n paikanvaraaja tai teksti puuttuu');

      const unix = String(Math.floor(t / 1000));
      let r;
      if (post.image_url) {
        const caption = post.link_url ? `${post.body}\n\n${post.link_url}` : post.body;
        r = await graph('POST', `${PAGE}/photos`, { url: post.image_url, caption, published: 'false', scheduled_publish_time: unix });
      } else {
        const p = { message: post.body, published: 'false', scheduled_publish_time: unix };
        if (post.link_url) p.link = post.link_url;
        r = await graph('POST', `${PAGE}/feed`, p);
      }
      const fbId = r.post_id || r.id;
      await db('PATCH', `social_posts?id=eq.${post.id}`, { status: 'SCHEDULED', fb_post_id: fbId, last_error: null });
      return json(req, 200, { ok: true, fb_post_id: fbId, actor });
    }

    // ---- cancel ----
    if (body.action === 'cancel') {
      const post = await getPost(body.post_id);
      if (post.status !== 'SCHEDULED' || !post.fb_post_id) return json(req, 200, { ok: false, error: 'Vain ajastetun julkaisun ajastuksen voi perua' });
      try { await graph('DELETE', post.fb_post_id); }
      catch (e) {
        // Jos poisto "epaonnistui", tarkista ettei julkaisu edelleen ole Facebookissa; vasta sitten merkitaan peruutetuksi
        let stillThere = false;
        try { await graph('GET', post.fb_post_id, { fields: 'id' }); stillThere = true; } catch (e2) { stillThere = false; }
        if (stillThere) return json(req, 200, { ok: false, error: 'Facebook ei poistanut ajastettua julkaisua: ' + scrub(e && e.message) + ' Poista se Facebookin Suunnittelutyokalusta kasin.' });
      }
      await db('PATCH', `social_posts?id=eq.${post.id}`, { status: 'CANCELLED', fb_post_id: null, last_error: null });
      return json(req, 200, { ok: true, actor });
    }

    // ---- refresh (onko ajastettu julkaisu ehtinyt julkaistua) ----
    const doRefresh = async () => {
      const rows = await db('GET', `social_posts?status=eq.SCHEDULED&scheduled_at=lte.${new Date(now()).toISOString()}&select=id,fb_post_id`);
      let published = 0; const errors = [];
      for (const p of rows) {
        try {
          // Kuvajulkaisun ajastus palauttaa KUVAN tunnisteen (ei alaviivaa). Julkaisun tila luetaan sen
          // tarinasta (page_story_id); kuvalla itsellaan ei ole is_published-kenttaa.
          let storyId = String(p.fb_post_id || '');
          if (!storyId) continue;
          if (!storyId.includes('_')) {
            const ph = await graph('GET', storyId, { fields: 'page_story_id' });
            storyId = ph.page_story_id || '';
            if (!storyId) continue;
          }
          const r = await graph('GET', storyId, { fields: 'is_published,permalink_url,created_time' });
          if (r.is_published === true) {
            const at = r.created_time && !isNaN(Date.parse(r.created_time)) ? new Date(Date.parse(r.created_time)).toISOString() : new Date(now()).toISOString();
            await db('PATCH', `social_posts?id=eq.${p.id}`, { status: 'PUBLISHED', published_at: at, fb_permalink: r.permalink_url || null, fb_post_id: storyId });
            published++;
          }
        } catch (e) { errors.push(scrub(e && e.message)); }
      }
      return { checked: rows.length, published, errors };
    };
    if (body.action === 'refresh') return json(req, 200, { ok: true, ...(await doRefresh()) });

    // ---- sync: hae Facebook-tilastot tauluihin (sivu paivittain + julkaisut) ----
    if (body.action === 'sync') {
      const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
      const nowMs = now(), today = dayOf(nowMs);
      const summary = { page_days: 0, posts: 0, metrics: 0, errors: [] };
      const upsert = (table, rows, conflict) => rows.length ? db('POST', `${table}?on_conflict=${conflict}`, rows, 'resolution=merge-duplicates,return=minimal') : Promise.resolve();
      const num = (v) => (typeof v === 'number' ? v : (v && typeof v === 'object' ? Object.values(v).reduce((a, b) => a + (Number(b) || 0), 0) : null));
      try { summary.refresh = await doRefresh(); } catch (e) { summary.errors.push('refresh: ' + scrub(e.message)); }

      // Sivun tason luvut (viimeiset 8 vrk)
      const cols = { views: 'page_media_view', page_views: 'page_views_total', engagements: 'page_post_engagements', followers: 'page_follows' };
      const days = {};
      for (const [col, metric] of Object.entries(cols)) {
        try {
          const r = await graph('GET', `${PAGE}/insights`, { metric, period: 'day', since: String(Math.floor((nowMs - 8 * 86400000) / 1000)), until: String(Math.floor(nowMs / 1000)) });
          for (const v of ((r.data && r.data[0] && r.data[0].values) || [])) {
            const d = dayOf(Date.parse(v.end_time) - 86400000);
            (days[d] = days[d] || { day: d })[col] = num(v.value);
          }
        } catch (e) { summary.errors.push(metric + ': ' + scrub(e.message)); }
      }
      const pageRows = Object.values(days).map((r) => ({ views: null, page_views: null, engagements: null, followers: null, ...r, fetched_at: new Date(nowMs).toISOString() }));
      try { await upsert('social_page_metrics', pageRows, 'day'); summary.page_days = pageRows.length; } catch (e) { summary.errors.push('page_metrics: ' + scrub(e.message)); }

      // Julkaisut (viimeiset 120 vrk) ja niiden luvut
      let fbPosts = [];
      try {
        const r = await graph('GET', `${PAGE}/posts`, { fields: 'id,created_time,message,permalink_url', limit: '50', since: String(Math.floor((nowMs - 120 * 86400000) / 1000)) });
        fbPosts = r.data || [];
        await upsert('social_fb_posts', fbPosts.map((p) => ({ fb_post_id: p.id, created_time: p.created_time, message: (p.message || '').slice(0, 300), permalink: p.permalink_url || null, updated_at: new Date(nowMs).toISOString() })), 'fb_post_id');
        summary.posts = fbPosts.length;
        // Facebookista poistetut julkaisut pois tilastoista (vain kun lista on varmasti kokonainen)
        if (fbPosts.length > 0 && fbPosts.length < 50) {
          const sinceIso = new Date(nowMs - 119 * 86400000).toISOString();
          const have = await db('GET', `social_fb_posts?created_time=gte.${sinceIso}&select=fb_post_id`);
          const keep = new Set(fbPosts.map((p) => p.id));
          const gone = have.map((x) => x.fb_post_id).filter((id) => !keep.has(id));
          for (const id of gone) await db('DELETE', `social_fb_posts?fb_post_id=eq.${encodeURIComponent(id)}`, null, 'return=minimal');
          summary.removed = gone.length;
        }
      } catch (e) { summary.errors.push('posts: ' + scrub(e.message)); }
      const metricRows = [];
      const one = async (p) => {
        try {
          const r = await graph('GET', `${p.id}/insights`, { metric: 'post_media_view,post_total_media_view_unique,post_clicks,post_reactions_by_type_total' });
          const m = {}; for (const d of (r.data || [])) { if (d.period && d.period !== 'lifetime') continue; m[d.name] = num(d.values && d.values[0] && d.values[0].value); }   // vain kumulatiivinen (lifetime) arvo; paivakohtainen rivi ylikirjoittaisi sen nollalla
          metricRows.push({ fb_post_id: p.id, day: today, views: m.post_media_view ?? null, unique_views: m.post_total_media_view_unique ?? null, clicks: m.post_clicks ?? null, reactions: m.post_reactions_by_type_total ?? null, fetched_at: new Date(nowMs).toISOString() });
        } catch (e) { summary.errors.push('insights ' + p.id + ': ' + scrub(e.message)); }
      };
      const list = fbPosts.slice(0, 40);
      for (let i = 0; i < list.length; i += 5) await Promise.all(list.slice(i, i + 5).map(one));
      try { await upsert('social_post_metrics', metricRows, 'fb_post_id,day'); summary.metrics = metricRows.length; } catch (e) { summary.errors.push('post_metrics: ' + scrub(e.message)); }
      try { await db('POST', 'social_sync_log', [{ source: body.source || actor, summary }], 'return=minimal'); } catch (e) { /* loki ei ole kriittinen */ }
      return json(req, 200, { ok: true, ...summary });
    }

    return json(req, 400, { ok: false, error: 'Tuntematon toiminto' });
  } catch (e) {
    return json(req, 200, { ok: false, error: scrub(e && e.message) });
  }
}

// Suoritus Supabase Edge Runtimessa (Deno). Node-testit tuovat vain handle-funktion.
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((req) => handle(req, Deno.env.toObject()));
}

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

  // 1. Tunnistautuminen: yllapitaja + MFA (aal2)
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const claims = jwt ? decodeJwt(jwt) : null;
  if (!claims || claims.aal !== 'aal2') return json(req, 403, { ok: false, error: 'Kirjautuminen ja kaksivaiheinen tunnistus vaaditaan' });
  const adminRes = await f(`${env.SUPABASE_URL}/rest/v1/rpc/is_site_admin`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!adminRes.ok || (await adminRes.json()) !== true) return json(req, 403, { ok: false, error: 'Vain yll\u00e4pit\u00e4j\u00e4' });
  const actor = claims.email || 'tuntematon';

  let body = {};
  try { body = await req.json(); } catch (e) { return json(req, 400, { ok: false, error: 'Virheellinen pyynt\u00f6' }); }
  if (!PAGE || !TOKEN) return json(req, 500, { ok: false, error: 'Facebook-asetukset (META_PAGE_ID, META_PAGE_TOKEN) puuttuvat julkaisupalvelusta' });

  const SR = env.SUPABASE_SERVICE_ROLE_KEY;
  const db = async (method, path, payload) => {
    const r = await f(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method, headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
    if (body.action === 'refresh') {
      const rows = await db('GET', `social_posts?status=eq.SCHEDULED&scheduled_at=lte.${new Date(now()).toISOString()}&select=id,fb_post_id`);
      let published = 0;
      for (const p of rows) {
        try {
          const r = await graph('GET', p.fb_post_id, { fields: 'is_published,permalink_url' });
          if (r.is_published === true || r.permalink_url) {
            await db('PATCH', `social_posts?id=eq.${p.id}`, { status: 'PUBLISHED', published_at: new Date(now()).toISOString(), fb_permalink: r.permalink_url || null });
            published++;
          }
        } catch (e) { /* seuraava */ }
      }
      return json(req, 200, { ok: true, checked: rows.length, published });
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

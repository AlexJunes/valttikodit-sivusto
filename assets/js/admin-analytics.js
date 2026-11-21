// assets/js/admin-analytics.js
// Analytiikka (admin/analytics.html): verkkosivut, some ja liidit yhdessä näkymässä.
// Luvut lasketaan tietokannassa (rpc analytics_report: valittu jakso + edellinen samanpituinen jakso + erittelyt).
// Kaaviot ovat omaa SVG:tä (ei ulkoisia kirjastoja). Käyttää admin.js:n globaaleja SUPABASE_URL / SUPABASE_ANON_KEY / IS_LOCAL_ENV ja esc().
document.addEventListener('DOMContentLoaded', async () => {
    const view = document.getElementById('an-view');
    if (!view || !window.supabase) return;
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const $ = (id) => document.getElementById(id);
    const FN_URL = IS_LOCAL_ENV ? 'http://127.0.0.1:8788/social-publish' : `${SUPABASE_URL}/functions/v1/social-publish`;

    // Kanavien värit (validoitu värisokeille): entiteetti pitää värinsä kaikissa kaavioissa
    const C = { site: '#2a78d6', facebook: '#eb6834', instagram: '#1baf7a', ink: '#1f2937' };
    const EVENTS_SINCE = '2026-11-20';   // painallukset ja lukuaika kerätty tästä alkaen
    const FB_LIVE_SINCE = '2026-11-20';  // Some-sivun julkaisut näkyivät kaikille tästä alkaen

    const state = { range: '30', from: null, to: null, tab: (location.hash || '').replace('#', '') || 'overview', channel: 'all', data: null, titles: {} };
    if (!['overview', 'web', 'some'].includes(state.tab)) state.tab = 'overview';
    state.filters = {}; state.dayBack = null;

    // ---------- suodattimet (klikkaa palkkia, riviä, julkaisua tai kaavion päivää) ----------
    const FL = { source: 'Lähde', device: 'Laite', path: 'Sivu', campaign: 'Kampanja', content: 'Julkaisu' };
    const fKeys = () => Object.keys(state.filters);
    const only = (...keys) => fKeys().every((k) => keys.includes(k));
    const socialSrc = () => !state.filters.source || ['Facebook', 'Instagram'].includes(state.filters.source);
    // Mihin dataan suodatin voi vaikuttaa (muut kortit himmennetään, jotta luvut eivät johda harhaan)
    const FILTERABLE = {
        web: () => true,
        events: () => true,
        leads: () => !state.filters.path,
        social: () => only('source') && socialSrc(),
        posts: () => only('source', 'content', 'campaign') && socialSrc(),
    };
    const dim = (kind) => kind && !FILTERABLE[kind]();
    const fAttr = (k, v) => (v == null || v === '' ? '' : ` data-fk="${esc(k)}" data-fv="${esc(v)}"`);
    const fCls = (k, v) => (v == null || v === '' ? '' : state.filters[k] === v ? ' an-click an-active' : ' an-click');

    // ---------- apufunktiot ----------
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const parseD = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
    const fiD = (s) => { const d = parseD(s); return `${d.getDate()}.${d.getMonth() + 1}.`; };
    const fiDY = (s) => { const d = parseD(s); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
    const n = (v) => (v == null ? null : Number(v));
    const fmtN = (v) => (v == null ? '–' : Number(v).toLocaleString('fi-FI'));
    const sumOr = (...vals) => (vals.every((v) => v == null) ? null : vals.reduce((a, b) => a + (Number(b) || 0), 0));
    const delta = (cur, prev) => {
        if (cur == null || prev == null) return null;
        if (Number(prev) === 0) return Number(cur) === 0 ? 0 : null;
        return Math.round(((Number(cur) - Number(prev)) / Number(prev)) * 100);
    };
    // Akselin askel: 1 / 2 / 2,5 / 5 × 10^k (kokonaisluvuille vähintään 1), ylärajana 4 askelta
    const niceStep = (raw) => { const e = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))); const f = raw / e; return Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e); };
    const pct = (a, b) => (b ? (Math.round((Number(a) / Number(b)) * 1000) / 10).toLocaleString('fi-FI') + ' %' : '–');

    const pageName = (p) => {
        if (!p) return '–';
        const k = p.match(/kohde=([^&]+)/); if (k) return 'Kohde: ' + (state.titles['p:' + k[1]] || k[1]);
        const r = p.match(/[?&]r=([^&]+)/); if (r) return 'Referenssi: ' + (state.titles['r:' + r[1]] || r[1]);
        const map = { '/index.html': 'Etusivu', '/': 'Etusivu', '/kohde': 'Kohdesivu', '/kohteet': 'Kaikki kohteet', '/referenssit': 'Referenssit', '/tietosuojaseloste': 'Tietosuojaseloste', '/kiitos': 'Kiitos-sivu', '/myy-tonttisi': 'Myy tonttisi', '/kohteet.html': 'Kaikki kohteet', '/myy-tonttisi.html': 'Myy tonttisi', '/myy-tonttisi': 'Myy tonttisi',
            '/yhteys': 'Ota yhteyttä', '/yhteys.html': 'Ota yhteyttä', '/tarinamme': 'Tarinamme', '/tarinamme.html': 'Tarinamme', '/referenssit': 'Referenssit', '/referenssit.html': 'Referenssit', '/kiitos.html': 'Kiitos-sivu' };
        if (map[p]) return map[p];
        const kk = p.match(/^\/kohteet\/([^/?#]+)/); if (kk) return 'Kohde: ' + (state.titles['p:' + kk[1]] || kk[1]);
        return p;
    };

    // ---------- komponentit ----------
    const kpi = (label, cur, prev, opts = {}) => {
        const d = opts.noDelta ? null : delta(cur, prev);
        const shown = opts.format ? opts.format(cur) : fmtN(cur);
        let badge = '';
        if (d != null) {
            const up = d > 0, good = opts.invert ? !up : up;
            badge = d === 0 ? '<span class="an-delta">±0 %</span>' : `<span class="an-delta ${good ? 'an-up' : 'an-down'}">${up ? '▲' : '▼'} ${up ? '+' : '−'}${Math.abs(d)} %</span>`;
        } else if (!opts.noDelta && cur != null && Number(cur) > 0 && Number(prev) === 0) badge = '<span class="an-delta an-up">▲ uusi</span>';
        return `<div class="an-kpi${dim(opts.kind) ? ' an-dim' : ''}"${dim(opts.kind) ? ' title="Ei suodatettavissa valitulla rajauksella"' : ''}><div class="an-kpi-l">${esc(label)}</div><div class="an-kpi-v">${esc(shown)}</div>
            <div class="an-kpi-s">${badge}${opts.sub ? `<span>${esc(opts.sub)}</span>` : ''}</div></div>`;
    };
    const card = (title, body, opts = {}) => `<section class="admin-card an-card ${opts.cls || ''}${dim(opts.kind) ? ' an-dim' : ''}"><div class="an-card-h"><h2>${esc(title)}</h2>${dim(opts.kind) ? '<span class="an-dim-tag">Ei suodatettavissa tällä rajauksella</span>' : ''}${opts.right || ''}</div>${opts.desc ? `<p class="an-sub" style="margin:-0.35rem 0 0.75rem;">${esc(opts.desc)}</p>` : ''}${body}</section>`;
    const legend = (series) => (series.length > 1 ? `<div class="an-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>` : '');

    // Viivakaavio: sama yksikkö kaikilla sarjoilla (ei kahta y-akselia). Hover: pystyviiva + kaikkien sarjojen arvot.
    const charts = [];
    const lineChart = (id, days, series, opts = {}) => {
        charts.push({ id, days, series, opts });
        return `${legend(series)}<div class="an-chart" id="${id}" style="height:${opts.h || 220}px;"></div>`;
    };
    const drawCharts = () => charts.forEach(({ id, days, series, opts }) => {
        const el = $(id); if (!el) return;
        const W = Math.max(280, el.clientWidth), H = opts.h || 220, L = 44, R = 12, T = 10, B = 26, nDays = days.length;
        if (nDays < 2) { el.innerHTML = '<div class="an-sub">Liian lyhyt jakso kaaviolle.</div>'; return; }
        const all = series.flatMap((s) => s.values.filter((v) => v != null));
        if (!all.length) { el.innerHTML = '<div class="an-empty">Ei dataa tällä jaksolla.</div>'; return; }
        const stepV = niceStep(Math.max(...all, 1) / 4), top = stepV * 4;
        const X = (i) => L + (i / (nDays - 1)) * (W - L - R), Y = (v) => T + (1 - v / top) * (H - T - B);
        const ticks = [0, 1, 2, 3, 4].map((k) => stepV * k);
        const step = Math.max(1, Math.ceil(nDays / Math.max(2, Math.floor((W - L - R) / 56))));
        let svg = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" class="an-grid"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end" class="an-ax">${fmtN(Math.round(t))}</text>`).join('');
        days.forEach((d, i) => { if (i % step === 0 && nDays - 1 - i >= step * 0.6 || i === nDays - 1) svg += `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === nDays - 1 ? 'end' : 'middle'}" class="an-ax">${fiD(d)}</text>`; });
        series.forEach((s) => {
            // katkos puuttuvan arvon kohdalla
            let path = '', pen = false;
            s.values.forEach((v, i) => { if (v == null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
            if (series.length === 1 && opts.area !== false) {
                const first = s.values.findIndex((v) => v != null), last = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null);
                if (first >= 0 && s.values.slice(first, last + 1).every((v) => v != null)) svg += `<path d="${path}L${X(last)},${Y(0)}L${X(first)},${Y(0)}Z" fill="${s.color}" opacity="0.08"/>`;
            }
            svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        });
        svg += `<line class="an-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/>${series.map((s, k) => `<circle class="an-dot" data-k="${k}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2" style="display:none"/>`).join('')}
            <rect class="an-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
        el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.label).join(', '))} päivittäin">${svg}</svg>`;
        const s0 = el.querySelector('svg'), cross = el.querySelector('.an-cross'), dots = el.querySelectorAll('.an-dot'), tip = $('an-tip');
        const move = (ev) => {
            const r = s0.getBoundingClientRect(), px = ev.clientX - r.left;
            const i = Math.max(0, Math.min(nDays - 1, Math.round(((px - L) / (W - L - R)) * (nDays - 1))));
            cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.style.display = '';
            dots.forEach((dt) => { const v = series[dt.dataset.k].values[i]; if (v == null) { dt.style.display = 'none'; return; } dt.setAttribute('cx', X(i)); dt.setAttribute('cy', Y(v)); dt.style.display = ''; });
            tip.innerHTML = `<div class="an-tip-h">${fiDY(days[i])}</div>${series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.label)} <b>${fmtN(s.values[i])}</b></div>`).join('')}`;
            tip.hidden = false;
            const tx = r.left + X(i) + 14, tw = tip.offsetWidth;
            tip.style.left = Math.min(window.innerWidth - tw - 8, tx > window.innerWidth - tw - 20 ? r.left + X(i) - tw - 14 : tx) + 'px';
            tip.style.top = (r.top + window.scrollY + 8) + 'px';
        };
        const hide = () => { cross.style.display = 'none'; dots.forEach((dt) => { dt.style.display = 'none'; }); tip.hidden = true; };
        const hit = el.querySelector('.an-hit');
        hit.addEventListener('mousemove', move); hit.addEventListener('mouseleave', hide);
        hit.addEventListener('click', (ev) => { const r = s0.getBoundingClientRect(); const i = Math.max(0, Math.min(nDays - 1, Math.round(((ev.clientX - r.left - L) / (W - L - R)) * (nDays - 1)))); tip.hidden = true; setDay(days[i]); });
        hit.addEventListener('touchstart', (e) => move(e.touches[0]), { passive: true }); hit.addEventListener('touchmove', (e) => move(e.touches[0]), { passive: true });
        hit.addEventListener('touchend', () => setTimeout(hide, 1500));
    });
    let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawCharts, 150); });

    // Vaakapalkit (yksi mittari, arvo aina näkyvissä tekstinä)
    const bars = (items, color, opts = {}) => {
        if (!items.length) return '<div class="an-empty">Ei dataa tällä jaksolla.</div>';
        const max = Math.max(...items.map((x) => Number(x.value) || 0), 1);
        return `<div class="an-bars">${items.map((x) => `<div class="an-bar-row${x.f ? fCls(x.f[0], x.f[1]) : ''}"${x.f ? fAttr(x.f[0], x.f[1]) : ''} title="${esc(x.label)}: ${fmtN(x.value)}${x.f ? ' (rajaa klikkaamalla)' : ''}">
            <div class="an-bar-l"><span>${esc(x.label)}</span>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</div>
            <div class="an-bar-t"><div class="an-bar-f" style="width:${Math.max(1.5, ((Number(x.value) || 0) / max) * 100)}%;background:${x.color || color}"></div></div>
            <div class="an-bar-v">${esc(opts.format ? opts.format(x.value) : fmtN(x.value))}</div></div>`).join('')}</div>`;
    };
    const table = (head, rows, empty) => (rows.length ? `<div class="an-table-wrap"><table class="admin-table an-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="an-empty">${esc(empty || 'Ei dataa tällä jaksolla.')}</div>`);

    // ---------- näkymät ----------
    const notes = () => {
        const out = [];
        if (state.from < EVENTS_SINCE) out.push(`Painallukset, lomakkeen aloitukset, lukuaika ja vieritys on kerätty ${fiDY(EVENTS_SINCE)} alkaen; aiemmilta päiviltä niitä ei ole.`);
        if (state.from < FB_LIVE_SINCE) out.push(`Ennen ${fiDY(FB_LIVE_SINCE)} Some-sivun kautta tehdyt Facebook-julkaisut näkyivät vain ylläpitäjille (sovelluksen kehitystila), joten niiden luvut eivät ole vertailukelpoisia.`);
        $('an-notes').innerHTML = out.length ? `<div class="so-note an-notes">${out.map((t) => `<div>ⓘ ${esc(t)}</div>`).join('')}</div>` : '';
    };

    const insights = (d) => {
        const c = d.cur, p = d.prev, out = [];
        const add = (label, cur, prev, min = 10) => { const x = delta(cur, prev); if (x != null && Math.max(Number(cur), Number(prev)) >= min && Math.abs(x) >= 15) out.push({ w: Math.abs(x), t: `${label} ${x > 0 ? 'kasvoi' : 'laski'} ${Math.abs(x)} % (${fmtN(prev)} → ${fmtN(cur)}).` }); };
        add('Käynnit sivustolla', c.visits, p.visits);
        add('Käynnit somesta', c.social_visits, p.social_visits, 5);
        add('Liidit', c.leads, p.leads, 3);
        add('Facebook-näytöt', c.fb_views, p.fb_views, 50);
        add('Instagram-tavoittavuus', c.ig_reach, p.ig_reach, 50);
        const res = out.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.t);
        const src = (d.sources || []).filter((s) => s.leads > 0).sort((a, b) => b.leads - a.leads)[0];
        if (src) res.push(`Eniten liidejä toi ${src.source} (${fmtN(src.leads)} liidiä ${fmtN(src.visits)} käynnistä).`);
        const pg = (d.pages || []).filter((x) => x.actions > 0).sort((a, b) => b.actions - a.actions)[0];
        if (pg) res.push(`Eniten yhteydenottoaikeita (painalluksia ja lomakkeen aloituksia) syntyi sivulla ${pageName(pg.path)} (${fmtN(pg.actions)}).`);
        const posts = [...(d.ig_posts || []).map((x) => ({ ch: 'Instagram', t: x.title || x.caption, v: n(x.reach) })), ...(d.fb_posts || []).map((x) => ({ ch: 'Facebook', t: x.title || x.message, v: n(x.views) }))].filter((x) => x.v != null).sort((a, b) => b.v - a.v)[0];
        if (posts) res.push(`Tavoittavin julkaisu: ${posts.ch}, "${String(posts.t || '').slice(0, 60)}${String(posts.t || '').length > 60 ? '…' : ''}" (${fmtN(posts.v)}).`);
        return res.length ? `<ul class="an-insights">${res.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<div class="an-empty">Ei merkittäviä muutoksia tai liian vähän dataa johtopäätöksiin.</div>';
    };

    // Suppilo vaiheina: jokaisella vaiheella oma, perusteltu vertailukohta (ei yhteistä pylväsasteikkoa,
    // koska somen näkyvyys on kertaluokkia suurempi kuin muut vaiheet)
    const funnel = (c) => {
        const reach = FILTERABLE.social() ? (state.filters.source === 'Facebook' ? n(c.fb_views) : state.filters.source === 'Instagram' ? n(c.ig_reach) : sumOr(c.fb_views, c.ig_reach)) : null;
        const actions = sumOr(c.cta_phone, c.cta_email, c.brochure, c.form_start);
        const steps = [
            { l: 'Somen näkyvyys', v: reach, s: 'Facebook-näytöt + Instagram-tavoittavuus', color: C.facebook },
            { l: 'Käynnit somesta', v: c.social_visits, s: 'sivustolle Facebookista tai Instagramista', conv: pct(c.social_visits, reach), of: 'näkyvyydestä', color: C.facebook },
            { l: 'Käynnit yhteensä', v: c.visits, s: 'kaikista lähteistä', conv: pct(c.social_visits, c.visits), of: 'tuli somesta', color: C.site },
            { l: 'Yhteydenottoaikeet', v: actions, s: 'soita, sähköposti, esite, lomakkeen aloitus', conv: pct(actions, c.visits), of: 'käynneistä', color: C.ink },
            { l: 'Liidit', v: c.leads, s: 'lähetetyt lomakkeet', conv: pct(c.leads, c.visits), of: 'käynneistä (konversio)', color: C.ink },
            { l: 'Kaupat', v: c.leads_won, s: 'Janin merkitsemät', conv: pct(c.leads_won, c.leads), of: 'liideistä', color: C.ink },
        ];
        return `<ol class="an-steps">${steps.map((x) => `<li style="--c:${x.color}">
            <div class="an-step-v">${fmtN(x.v)}</div><div class="an-step-l">${esc(x.l)}</div><div class="an-step-s">${esc(x.s)}</div>
            ${x.conv ? `<div class="an-step-c">${esc(x.conv)} <span>${esc(x.of)}</span></div>` : ''}</li>`).join('')}</ol>`;
    };

    // Tekoälyn vinkit: pilviagentti kirjoittaa ne tauluun analytics_insights (pyyntö napista tai joka aamu 30 pv)
    const ins = { row: null, pending: null, timer: null, err: '' };
    const loadInsights = async () => {
        const [exact, latest, pend] = await Promise.all([
            sb.from('analytics_insights').select('*').eq('status', 'READY').eq('p_from', state.from).eq('p_to', state.to).order('created_at', { ascending: false }).limit(1),
            sb.from('analytics_insights').select('*').eq('status', 'READY').order('created_at', { ascending: false }).limit(1),
            sb.from('analytics_insights').select('*').in('status', ['PENDING', 'RUNNING', 'FAILED']).gte('created_at', new Date(Date.now() - 15 * 60000).toISOString()).order('created_at', { ascending: false }).limit(1),
        ]);
        ins.row = (exact.data && exact.data[0]) || (latest.data && latest.data[0]) || null;
        const p = pend.data && pend.data[0];
        ins.pending = p && p.status !== 'FAILED' && (!ins.row || Date.parse(p.created_at) > Date.parse(ins.row.created_at)) ? p : null;
        ins.err = p && p.status === 'FAILED' && (!ins.row || Date.parse(p.created_at) > Date.parse(ins.row.created_at)) ? (p.error || 'tuntematon virhe') : '';
        const el = $('an-ins'); if (el) el.outerHTML = insightsCard();
        wireInsights();
        clearTimeout(ins.timer);
        if (ins.pending) ins.timer = setTimeout(loadInsights, 8000);
    };
    const insightsCard = () => {
        const r = ins.row, same = r && r.p_from === state.from && r.p_to === state.to;
        const meta = r ? `Luotu ${new Date(r.finished_at || r.created_at).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} jaksolle ${fiD(r.p_from)}–${fiDY(r.p_to)}${same ? '' : ' (eri jakso kuin nyt valittu)'}` : 'Vinkkejä ei ole vielä luotu.';
        const tips = r && Array.isArray(r.tips) ? r.tips : [];
        const status = ins.pending ? '<span class="an-ins-busy">Tekoäly analysoi lukuja… vinkit valmistuvat yleensä 1–2 minuutissa.</span>' : ins.err ? `<span class="an-down">Edellinen pyyntö epäonnistui: ${esc(ins.err)}</span>` : '';
        return `<section class="admin-card an-card an-ins" id="an-ins">
            <div class="an-card-h"><h2>✦ Tekoälyn vinkit: kolme tärkeintä toimenpidettä</h2>
                <button type="button" class="btn btn-outline an-btn-sm" id="an-ins-req" ${ins.pending ? 'disabled' : ''}>${ins.pending ? 'Analysoidaan…' : same ? 'Päivitä vinkit' : 'Pyydä vinkit tälle jaksolle'}</button></div>
            ${tips.length ? `<ol class="an-tips">${tips.slice(0, 3).map((t) => `<li><div class="an-tip-t">${esc(t.title)}${t.area ? ` <span class="an-tag">${esc(t.area)}</span>` : ''}</div>
                <div class="an-tip-w"><b>Miksi:</b> ${esc(t.why)}</div><div class="an-tip-a"><b>Mitä tehdä:</b> ${esc(t.action)}</div></li>`).join('')}</ol>` : ''}
            ${r && r.summary ? `<p class="an-sub" style="margin:0.6rem 0 0;">${esc(r.summary)}</p>` : ''}
            <div class="an-ins-foot"><span class="an-sub">${fKeys().length ? 'Vinkit koskevat koko dataa ilman suodattimia. ' : ''}${esc(meta)} · Vinkit perustuvat lukuihin ja markkinoinnin tavoitteisiin; tarkista ennen toimenpiteitä.</span>${status}</div>
        </section>`;
    };
    const wireInsights = () => {
        const b = $('an-ins-req'); if (!b) return;
        b.addEventListener('click', async () => {
            b.disabled = true; b.textContent = 'Lähetetään…';
            const { error } = await sb.rpc('analytics_request_insights', { p_from: state.from, p_to: state.to });
            if (error) { b.disabled = false; b.textContent = 'Pyydä vinkit'; alert('Vinkkien pyyntö epäonnistui: ' + error.message); return; }
            loadInsights();
        });
    };

    const renderOverview = (d) => {
        const c = d.cur, p = d.prev, days = d.daily.map((x) => x.d);
        const fol = sumOr(c.fb_followers, c.ig_followers), folP = sumOr(p.fb_followers, p.ig_followers);
        const act = sumOr(c.cta_phone, c.cta_email, c.brochure, c.form_start), actP = sumOr(p.cta_phone, p.cta_email, p.brochure, p.form_start);
        const other = d.daily.map((x) => Math.max(0, x.visits - x.fb_visits - x.ig_visits));
        return `${insightsCard()}<div class="an-kpis">
                ${kpi('Käynnit sivustolla', c.visits, p.visits, { sub: `${fmtN(c.pageviews)} sivukatselua` })}
                ${kpi('Käynnit somesta', c.social_visits, p.social_visits, { sub: c.visits ? `${Math.round((c.social_visits / c.visits) * 100)} % käynneistä` : '' })}
                ${kpi('Yhteydenottoaikeet', act, actP, { sub: 'painallukset + lomakkeet' })}
                ${kpi('Liidit', c.leads, p.leads, { sub: `${fmtN(c.leads_won)} kauppaa`, kind: 'leads' })}
                ${kpi('Somen näkyvyys', sumOr(c.fb_views, c.ig_reach), sumOr(p.fb_views, p.ig_reach), { sub: 'Facebook + Instagram', kind: 'social' })}
                ${kpi('Seuraajat', fol, folP, { sub: `FB ${fmtN(c.fb_followers)} · IG ${fmtN(c.ig_followers)}`, kind: 'social' })}
            </div>
            <div class="an-grid2">
                ${card('Mikä muuttui', insights(d), { desc: 'Verrattuna edelliseen samanpituiseen jaksoon.' })}
                ${card('Myyntisuppilo', funnel(c), { desc: 'Somesta sivustolle, sivustolta yhteydenottoon ja kauppaan.' })}
            </div>
            ${card('Käynnit lähteittäin', lineChart('ch-ov-visits', days, [
                { label: 'Muut lähteet', color: C.site, values: other },
                { label: 'Facebook', color: C.facebook, values: d.daily.map((x) => x.fb_visits) },
                { label: 'Instagram', color: C.instagram, values: d.daily.map((x) => x.ig_visits) },
            ]))}
            <div class="an-grid2">
                ${card('Liidit päivittäin', lineChart('ch-ov-leads', days, [{ label: 'Liidit', color: C.ink, values: d.daily.map((x) => x.leads) }], { h: 180 }), { kind: 'leads' })}
                ${card('Liidit ja kaupat kanavittain', bars((d.lead_channels || []).map((x) => ({ label: x.channel === 'Ei seurantatunnistetta' ? 'Muu / ei tunnistetta' : x.channel, value: x.leads, sub: `${fmtN(x.won)} kauppaa`, color: x.channel === 'Facebook' ? C.facebook : x.channel === 'Instagram' ? C.instagram : C.site, f: x.channel === 'Ei seurantatunnistetta' ? null : ['source', x.channel] })), C.site),
                    { desc: 'Kanava päätellään liidin seurantatunnisteesta. Kaupat merkitään liidin tietoihin.', kind: 'leads' })}
            </div>`;
    };

    const renderWeb = (d) => {
        const c = d.cur, p = d.prev, days = d.daily.map((x) => x.d);
        const srcColor = (s) => (s === 'Facebook' ? C.facebook : s === 'Instagram' ? C.instagram : C.site);
        return `<div class="an-kpis">
                ${kpi('Käynnit', c.visits, p.visits)}
                ${kpi('Sivukatselut', c.pageviews, p.pageviews, { sub: c.visits ? `${(c.pageviews / c.visits).toFixed(1).replace('.', ',')} / käynti` : '' })}
                ${kpi('Lukuaika keskimäärin', c.avg_seconds, p.avg_seconds, { format: (v) => (v == null ? '–' : `${Math.floor(v / 60) ? Math.floor(v / 60) + ' min ' : ''}${v % 60} s`), sub: `${fmtN(c.engagement_samples)} mittausta` })}
                ${kpi('Vieritys keskimäärin', c.avg_scroll, p.avg_scroll, { format: (v) => (v == null ? '–' : v + ' %'), sub: c.engaged_share != null ? `${c.engaged_share} % luki yli 30 s` : '' })}
                ${kpi('Painallukset', sumOr(c.cta_phone, c.cta_email, c.brochure), sumOr(p.cta_phone, p.cta_email, p.brochure), { sub: `☎ ${fmtN(c.cta_phone)} · ✉ ${fmtN(c.cta_email)} · esite ${fmtN(c.brochure)}` })}
                ${kpi('Lomakkeen aloitukset', c.form_start, p.form_start)}
            </div>
            ${card('Käynnit ja sivukatselut', lineChart('ch-web', days, [
                { label: 'Sivukatselut', color: C.ink, values: d.daily.map((x) => x.pageviews) },
                { label: 'Käynnit', color: C.site, values: d.daily.map((x) => x.visits) },
            ]))}
            <div class="an-grid2">
                ${card('Mistä kävijät tulevat', bars((d.sources || []).map((x) => ({ label: x.source, value: x.visits, sub: ['Facebook', 'Instagram'].includes(x.source) ? `${fmtN(x.leads)} liidiä` : '', color: srcColor(x.source), f: ['source', x.source] })), C.site),
                    { desc: 'Käynnit lähteittäin. Somesta tulleet liidit tunnistetaan seurantatunnisteesta.' })}
                ${card('Laitteet', bars((d.devices || []).map((x) => ({ label: x.device, value: x.views, f: x.device === 'Tuntematon' ? null : ['device', x.device] })), C.site), { desc: 'Sivukatselut laitetyypeittäin.' })}
            </div>
            ${card('Sivut', table(['Sivu', 'Katselut', 'Lukuaika', 'Vieritys', 'Yhteydenottoaikeet'],
                (d.pages || []).map((x) => `<tr class="${fCls('path', x.path).trim()}"${fAttr('path', x.path)}><td><strong>${esc(pageName(x.path))}</strong><div class="an-sub an-mono">${esc(x.path)}</div></td><td>${fmtN(x.views)}</td>
                    <td>${x.avg_seconds == null ? '–' : fmtN(x.avg_seconds) + ' s'}</td><td>${x.avg_scroll == null ? '–' : x.avg_scroll + ' %'}</td><td>${fmtN(x.actions)}</td></tr>`)),
                { desc: 'Lukuaika ja vieritys ovat keskiarvoja. Yhteydenottoaikeet = painallukset ja lomakkeen aloitukset sivulla.' })}
            ${card('Kampanjat', table(['Kampanja', 'Lähde', 'Käynnit', 'Liidit'], (d.campaigns || []).map((x) => `<tr class="${fCls('campaign', x.campaign).trim()}"${fAttr('campaign', x.campaign)}><td>${esc(x.campaign)}</td><td>${esc(x.source)}</td><td>${fmtN(x.visits)}</td><td>${fmtN(x.leads)}</td></tr>`), 'Ei seurantatunnisteellisia käyntejä tällä jaksolla.'))}`;
    };

    const renderSome = (d) => {
        const c = d.cur, p = d.prev, days = d.daily.map((x) => x.d);
        const ch = state.filters.source === 'Facebook' ? 'facebook' : state.filters.source === 'Instagram' ? 'instagram' : state.channel;
        const fb = ch !== 'instagram', ig = ch !== 'facebook';
        const synced = d.social_synced_at ? new Date(d.social_synced_at).toLocaleString('fi-FI') : 'ei vielä';
        const seg = `<div class="an-seg an-seg-sm" id="an-channel">${[['all', 'Kaikki'], ['facebook', 'Facebook'], ['instagram', 'Instagram']].map(([k, t]) => `<button type="button" data-ch="${k}" class="${ch === k ? 'active' : ''}">${t}</button>`).join('')}</div>`;
        const posts = [
            ...(fb ? (d.fb_posts || []).map((x) => ({ ch: 'Facebook', at: x.created_time, t: x.title || x.message, link: x.permalink, a: n(x.views), b: n(x.unique_views), cl: n(x.clicks), re: n(x.reactions), sv: x.title ? n(x.site_visits) : null, uc: x.utm_content })) : []),
            ...(ig ? (d.ig_posts || []).map((x) => ({ ch: 'Instagram', at: x.posted_at, t: x.title || x.caption, link: x.permalink, a: n(x.views), b: n(x.reach), cl: null, re: sumOr(x.likes, x.comments), sv: null, reel: x.media_type === 'VIDEO', saves: n(x.saves), shares: n(x.shares), uc: x.utm_content })) : []),
        ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        const fbS = { label: 'Facebook-näytöt', color: C.facebook, values: d.daily.map((x) => x.fb_views) };
        const igS = { label: 'Instagram-tavoittavuus', color: C.instagram, values: d.daily.map((x) => x.ig_reach) };
        const postsN = (fb ? Number(c.fb_posts) || 0 : 0) + (ig ? Number(c.ig_posts) || 0 : 0), postsP = (fb ? Number(p.fb_posts) || 0 : 0) + (ig ? Number(p.ig_posts) || 0 : 0);
        const camps = (d.campaigns || []).filter((x) => (fb && x.source === 'Facebook') || (ig && x.source === 'Instagram'));
        return `<div class="an-row-between">${seg}<div class="an-sub">Somen luvut päivitetty ${esc(synced)}</div></div>
            <div class="an-kpis">
                ${fb ? kpi('Facebook-näytöt', c.fb_views, p.fb_views, { kind: 'social' }) : ''}
                ${fb ? kpi('Facebook-vuorovaikutukset', c.fb_engagements, p.fb_engagements, { kind: 'social' }) : ''}
                ${fb ? kpi('Facebook-seuraajat', c.fb_followers, p.fb_followers, { kind: 'social' }) : ''}
                ${ig ? kpi('Instagram-tavoittavuus', c.ig_reach, p.ig_reach, { sub: 'tavoitetut tilit päivittäin yhteensä', kind: 'social' }) : ''}
                ${ig ? kpi('Profiilikäynnit', c.ig_profile_views, p.ig_profile_views, { sub: `${fmtN(c.ig_website_clicks)} painoi profiilin linkkiä`, kind: 'social' }) : ''}
                ${ig ? kpi('Instagram-seuraajat', c.ig_followers, p.ig_followers, { kind: 'social' }) : ''}
                ${kpi('Julkaisuja', postsN, postsP, { kind: 'social' })}
                ${kpi('Käynnit sivustolla somesta', ch === 'all' ? c.social_visits : sumOr(...d.daily.map((x) => (ch === 'facebook' ? x.fb_visits : x.ig_visits))), ch === 'all' ? p.social_visits : null, { noDelta: ch !== 'all' })}
            </div>
            <div class="an-grid2">
                ${fb ? card('Facebook-näytöt päivittäin', lineChart('ch-fb', days, [fbS], { h: 190 }), { kind: 'social' }) : ''}
                ${ig ? card('Instagram-tavoittavuus päivittäin', lineChart('ch-ig', days, [igS], { h: 190 }), { kind: 'social' }) : ''}
            </div>
            ${card('Käynnit sivustolla somesta', lineChart('ch-sv', days, [
                ...(fb ? [{ label: 'Facebook', color: C.facebook, values: d.daily.map((x) => x.fb_visits) }] : []),
                ...(ig ? [{ label: 'Instagram', color: C.instagram, values: d.daily.map((x) => x.ig_visits) }] : []),
            ], { h: 190 }))}
            ${card('Julkaisut', table(['Päivä', 'Kanava', 'Julkaisu', 'Näytöt', 'Tavoitetut', 'Klikit', 'Reaktiot', 'Tallennukset', 'Jaot', 'Sivustolle'],
                posts.map((x) => `<tr class="${fCls('content', x.uc).trim()}"${fAttr('content', x.uc)}${x.uc ? ' title="Rajaa sivuston luvut tähän julkaisuun"' : ''}><td>${esc(new Date(x.at).toLocaleDateString('fi-FI'))}</td><td><span class="so-ch so-ch-${x.ch === 'Instagram' ? 'ig' : 'fb'}">${x.ch === 'Instagram' ? 'IG' : 'FB'}</span>${x.reel ? ' <span class="so-agent so-reel">Reels</span>' : ''}</td>
                    <td style="max-width:340px;">${esc(String(x.t || '(ei tekstiä)').slice(0, 90))}${x.link ? ` <a href="${esc(x.link)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
                    <td>${fmtN(x.a)}</td><td>${fmtN(x.b)}</td><td>${fmtN(x.cl)}</td><td>${fmtN(x.re)}</td><td>${fmtN(x.saves)}</td><td>${fmtN(x.shares)}</td><td>${x.sv == null ? '–' : fmtN(x.sv)}</td></tr>`),
                'Ei julkaisuja tällä jaksolla.'), { desc: 'Facebook: näytöt ja eri henkilöt. Instagram: näytöt ja tavoitetut tilit, reaktiot = tykkäykset + kommentit. Sivustolle = Some-sivulta ajastetun julkaisun seurantalinkin käynnit. Klikkaa Some-sivulta ajastettua julkaisua rajataksesi sivuston luvut siihen.', kind: 'posts' })}
            ${card('Kampanjat', table(['Kampanja', 'Lähde', 'Käynnit sivustolla', 'Liidit'], camps.map((x) => `<tr class="${fCls('campaign', x.campaign).trim()}"${fAttr('campaign', x.campaign)}><td>${esc(x.campaign)}</td><td>${esc(x.source)}</td><td>${fmtN(x.visits)}</td><td>${fmtN(x.leads)}</td></tr>`), 'Ei kampanjaliikennettä tällä jaksolla.'),
                { desc: 'Seurantatunnisteellisten linkkien käynnit ja niistä tulleet liidit kampanjoittain.' })}`;
    };

    const render = () => {
        const d = state.data; if (!d) return;
        charts.length = 0;
        document.querySelectorAll('#an-tabs .so-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
        const chips = fKeys().map((k) => `<button type="button" class="an-chip" data-rm="${esc(k)}">${esc(FL[k])}: <b>${esc(k === 'path' ? pageName(state.filters[k]) : state.filters[k])}</b> ×</button>`);
        if (state.dayBack) chips.unshift(`<button type="button" class="an-chip" data-rm="__day">Päivä: <b>${fiDY(state.from)}</b> ×</button>`);
        $('an-fbar').innerHTML = chips.length ? `<span class="an-sub">Rajaus:</span>${chips.join('')}<button type="button" class="an-chip an-chip-clear" data-rm="__all">Poista kaikki</button>` : '<span class="an-sub">Vinkki: klikkaa lähdettä, laitetta, sivua, kampanjaa, julkaisua tai kaavion päivää rajataksesi kaikki luvut siihen.</span>';
        view.innerHTML = state.tab === 'web' ? renderWeb(d) : state.tab === 'some' ? renderSome(d) : renderOverview(d);
        drawCharts();
        const chSeg = $('an-channel'); if (chSeg) chSeg.addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (!b) return; state.channel = b.dataset.ch; render(); });
        wireInsights();
    };

    // ---------- lataus ----------
    const setRange = () => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (state.range !== 'custom') {
            const from = new Date(today); from.setDate(from.getDate() - (Number(state.range) - 1));
            state.from = iso(from); state.to = iso(today);
        }
        const days = Math.round((parseD(state.to) - parseD(state.from)) / 86400000) + 1;
        const pf = parseD(state.from); pf.setDate(pf.getDate() - days); const pt = parseD(state.from); pt.setDate(pt.getDate() - 1);
        $('an-period').textContent = `${fiDY(state.from)} – ${fiDY(state.to)} · verrataan jaksoon ${fiD(iso(pf))}–${fiDY(iso(pt))}`;
    };
    const load = async () => {
        setRange(); notes();
        view.style.opacity = '0.5';
        const { data, error } = await sb.rpc('analytics_report', { p_from: state.from, p_to: state.to, p_filters: state.filters });
        view.style.opacity = '';
        if (error) { view.innerHTML = `<div class="so-note so-err">Analytiikan lataus epäonnistui: ${esc(error.message)}</div>`; return; }
        state.data = data; render(); loadInsights();
        // Vanhentuneet somen luvut haetaan taustalla (kerran sivun avauksella)
        if (!load.synced && (!data.social_synced_at || Date.now() - Date.parse(data.social_synced_at) > 20 * 3600 * 1000)) { load.synced = true; syncSocial(true); }
    };
    // Päivitä data: hakee somen luvut Facebookista ja Instagramista ja laskee kaikki luvut uudelleen (sivuston ja liidien data on aina ajantasaista)
    const syncSocial = async (silent) => {
        const b = $('an-refresh'); if (b) { b.disabled = true; b.textContent = 'Päivitetään…'; }
        try {
            const { data: { session } } = await sb.auth.getSession();
            const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session && session.access_token), apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'sync' }) });
            const j = await r.json().catch(() => ({ ok: false, error: 'Julkaisupalvelu ei vastannut' }));
            if (!j.ok && !silent) alert('Päivitys epäonnistui: ' + j.error);
            else if (j.errors && j.errors.length && !silent) alert('Osa tiedoista puuttui:\n' + j.errors.slice(0, 4).join('\n'));
        } catch (e) { if (!silent) alert('Päivitys epäonnistui: ' + e.message); }
        const { data } = await sb.rpc('analytics_report', { p_from: state.from, p_to: state.to, p_filters: state.filters });
        if (data) { state.data = data; render(); loadInsights(); }
        if (b) { b.disabled = false; b.textContent = 'Päivitä data'; }
        $('an-updated').textContent = 'Päivitetty ' + new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    };
    $('an-refresh').addEventListener('click', () => syncSocial(false));

    const toggleFilter = (k, v) => { if (state.filters[k] === v) delete state.filters[k]; else state.filters[k] = v; load(); };
    const setDay = (day) => {
        if (!state.dayBack) state.dayBack = { range: state.range, from: state.from, to: state.to };
        state.range = 'custom'; state.from = day; state.to = day;
        document.querySelectorAll('#an-range button').forEach((x) => x.classList.remove('active'));
        load();
    };
    const clearDay = () => {
        const b = state.dayBack; if (!b) return; state.dayBack = null;
        state.range = b.range; state.from = b.from; state.to = b.to;
        document.querySelectorAll('#an-range button').forEach((x) => x.classList.toggle('active', x.dataset.range === b.range));
    };
    view.addEventListener('click', (e) => {
        if (e.target.closest('a, button, input, select')) return;
        const el = e.target.closest('[data-fk]'); if (!el) return;
        toggleFilter(el.dataset.fk, el.dataset.fv);
    });
    $('an-fbar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        const k = b.dataset.rm;
        if (k === '__all') { state.filters = {}; clearDay(); } else if (k === '__day') clearDay(); else delete state.filters[k];
        load();
    });

    $('an-range').addEventListener('click', (e) => {
        const b = e.target.closest('[data-range]'); if (!b) return;
        state.dayBack = null;
        document.querySelectorAll('#an-range button').forEach((x) => x.classList.toggle('active', x === b));
        state.range = b.dataset.range;
        $('an-custom').hidden = state.range !== 'custom';
        if (state.range === 'custom') { $('an-from').value = state.from; $('an-to').value = state.to; return; }
        load();
    });
    $('an-apply').addEventListener('click', () => {
        const f = $('an-from').value, t = $('an-to').value;
        if (!f || !t || t < f) { alert('Valitse alku- ja loppupäivä (alku ennen loppua).'); return; }
        if ((parseD(t) - parseD(f)) / 86400000 > 366) { alert('Enintään vuoden jakso kerrallaan.'); return; }
        state.from = f; state.to = t; load();
    });
    window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (['overview', 'web', 'some'].includes(h) && h !== state.tab) { state.tab = h; render(); } });
    $('an-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        state.tab = b.dataset.tab; history.replaceState(null, '', '#' + state.tab); render();
    });

    // Kohteiden ja referenssien nimet sivulistaan
    try {
        const [pr, rf] = await Promise.all([sb.from('projects').select('slug,title'), sb.from('reference_cases').select('slug,title')]);
        (pr.data || []).forEach((x) => { state.titles['p:' + x.slug] = x.title; });
        (rf.data || []).forEach((x) => { state.titles['r:' + x.slug] = x.title; });
    } catch (e) { /* nimet eivät ole kriittisiä */ }
    await load();
});

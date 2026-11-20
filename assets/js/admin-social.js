// assets/js/admin-social.js
// Some-hallinta (admin/social.html): Facebook-julkaisujen luonnokset, hyväksyntä ja ajastus.
// Facebook-avain ei ole selaimessa: ajastus, peruutus ja yhteystesti tehdään Supabase Edge Functionilla (social-publish).
// Käyttää admin.js:n globaaleja SUPABASE_URL / SUPABASE_ANON_KEY / IS_LOCAL_ENV ja esc(); kirjautuminen + MFA tulee admin.js:stä.
document.addEventListener('DOMContentLoaded', async () => {
    const listEl = document.getElementById('so-list');
    if (!listEl || !window.supabase) return;
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const $ = (id) => document.getElementById(id);
    const FN_URL = IS_LOCAL_ENV ? 'http://127.0.0.1:8788/social-publish' : `${SUPABASE_URL}/functions/v1/social-publish`;
    const SITE = 'https://www.valttikodit.fi';
    const STATUS = {
        DRAFT: ['Luonnos', '#6b7280'], APPROVED: ['Hyväksytty', '#b45309'], SCHEDULED: ['Ajastettu', '#1d4ed8'],
        PUBLISHED: ['Julkaistu', '#15803d'], CANCELLED: ['Peruttu', '#6b7280'], FAILED: ['Epäonnistui', '#b91c1c'],
    };
    let posts = [], campaigns = [], projects = [], refs = [], filter = 'all', cur = null, busy = false;

    const slugify = (s) => String(s || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    const fmt = (iso) => iso ? new Date(iso).toLocaleString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
    const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    const chip = (st) => { const [t, c] = STATUS[st] || [st, '#6b7280']; return `<span class="so-status" style="background:${c}1a;color:${c};">${esc(t)}</span>`; };

    const callFn = async (action, postId) => {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error('Kirjaudu uudelleen');
        const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ action, post_id: postId }) });
        let j; try { j = await r.json(); } catch (e) { throw new Error('Julkaisupalvelu ei vastannut (' + r.status + ')'); }
        return j;
    };

    // ---------- lataus ----------
    const load = async () => {
        const [p, c, pr, rf] = await Promise.all([
            sb.from('social_posts').select('*').order('scheduled_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
            sb.from('social_campaigns').select('*').order('created_at', { ascending: false }),
            sb.from('projects').select('slug,title,status,hero_image,gallery_images,details').eq('published', true).order('title'),
            sb.from('reference_cases').select('slug,title,hero_image,gallery').eq('published', true).order('title'),
        ]);
        if (p.error) { listEl.innerHTML = `<tr><td colspan="5" style="color:red;">Virhe: ${esc(p.error.message)}</td></tr>`; return; }
        posts = p.data || []; campaigns = c.data || []; projects = pr.data || []; refs = rf.data || []; buildSiteImages();
        render();
    };

    // Sivuston kuvat valitsinta varten: kohteet, referenssit ja Myy tonttisi -sivun ilmakuva
    let siteImages = [];
    const absUrl = (u) => { if (!u || typeof u !== 'string') return null; if (/^https:\/\//.test(u)) return u; if (/^(\.\.\/)?assets\//.test(u)) return SITE + '/' + u.replace(/^\.\.\//, ''); return null; };
    const buildSiteImages = () => {
        const seen = new Set(), out = [];
        const add = (u, label, group) => { const a = absUrl(u); if (a && !seen.has(a)) { seen.add(a); out.push({ url: a, label, group }); } };
        add('assets/img/myy-tonttisi/ilmakuva2-1600.jpg', 'Ilmakuva (Myy tonttisi)', 'Tontit');
        projects.forEach((x) => {
            add(x.details && x.details['Esitekuva'], x.title + ' (esitekuva)', 'Kohteet'); add(x.hero_image, x.title, 'Kohteet');
            (Array.isArray(x.gallery_images) ? x.gallery_images : []).forEach((u) => add(u, x.title, 'Kohteet'));
        });
        refs.forEach((x) => {
            add(x.hero_image, x.title, 'Referenssit');
            (Array.isArray(x.gallery) ? x.gallery : []).forEach((g) => add(g && g.url ? g.url : g, x.title, 'Referenssit'));
        });
        siteImages = out;
    };

    const chansOf = (x) => (Array.isArray(x.channels) && x.channels.length ? x.channels : ['facebook']);
    const chanBadges = (x) => chansOf(x).map((c) => ` <span class="so-ch so-ch-${c === 'instagram' ? 'ig' : 'fb'}">${c === 'instagram' ? 'IG' : 'FB'}</span>`).join('');
    const IG_ST = { PENDING: 'Instagram: odottaa ajankohtaa', PROCESSING: 'Instagram: käsitellään', PUBLISHED: 'Instagram: julkaistu', FAILED: 'Instagram: epäonnistui' };
    const igLine = (x) => (x.ig_status && x.status === 'SCHEDULED' ? `<div class="so-sub">${esc(IG_ST[x.ig_status] || x.ig_status)}</div>` : '');

    const render = () => {
        const rows = posts.filter((x) => filter === 'all' || x.status === filter);
        if (!rows.length) { listEl.innerHTML = '<tr><td colspan="5">Ei julkaisuja tässä näkymässä. Paina "Uusi julkaisu".</td></tr>'; return; }
        listEl.innerHTML = rows.map((x) => {
            const camp = campaigns.find((c) => c.id === x.campaign_id);
            return `<tr data-id="${esc(x.id)}" class="so-row">
                <td style="font-weight:500;">${esc(x.title)}${x.source === 'agent' ? ' <span class="so-agent">Agentin ehdotus</span>' : ''}${chanBadges(x)}${x.video_url ? ' <span class="so-agent so-reel">Reels</span>' : ''}<div class="so-sub">${esc((x.body || '').slice(0, 70))}${(x.body || '').length > 70 ? '…' : ''}</div></td>
                <td>${camp ? esc(camp.name) : '–'}</td>
                <td>${esc(fmt(x.scheduled_at))}</td>
                <td>${chip(x.status)}${igLine(x)}${x.last_error ? `<div class="so-sub" style="color:#b91c1c;">${esc(x.last_error)}</div>` : ''}</td>
                <td style="text-align:right;"><button class="btn btn-outline" style="padding:0.25rem 0.75rem;font-size:0.75rem;" data-open="${esc(x.id)}">Avaa</button></td></tr>`;
        }).join('');
    };

    $('so-filters').addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]'); if (!b) return;
        filter = b.dataset.f; document.querySelectorAll('#so-filters .so-chip').forEach((c) => c.classList.toggle('active', c === b)); render();
    });
    listEl.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); const r = e.target.closest('tr[data-id]'); const id = b ? b.dataset.open : (r && r.dataset.id); if (id) openEditor(posts.find((x) => x.id === id)); });
    $('so-new').addEventListener('click', () => openEditor(null));

    $('so-health').addEventListener('click', async () => {
        const out = $('so-health-result'); out.style.display = 'block'; out.textContent = 'Testataan yhteyttä...';
        try {
            const j = await callFn('health');
            const igTxt = j.instagram ? (j.instagram.error ? ` Instagram ei toimi: ${esc(j.instagram.error)}` : ` Instagram: <strong>@${esc(j.instagram.username)}</strong>${j.instagram.followers != null ? ` (${esc(j.instagram.followers)} seuraajaa)` : ''}.`) : '';
            out.innerHTML = j.ok ? `Yhteys toimii: <strong>${esc(j.page)}</strong>${j.followers != null ? ` (${esc(j.followers)} seuraajaa)` : ''}.${igTxt}` : `Yhteys ei toimi: ${esc(j.error)}`;
            out.className = 'so-note ' + (j.ok ? 'so-ok' : 'so-err');
        } catch (e) { out.className = 'so-note so-err'; out.textContent = 'Yhteys ei toimi: ' + e.message; }
    });

    // ---------- muokkain ----------
    const modal = document.createElement('dialog'); modal.id = 'so-modal'; modal.className = 'lead-modal so-modal';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

    const buildLink = (f) => {
        let base = '';
        if (f.kind === 'kohde' && f.slug) base = `${SITE}/kohde.html?kohde=${encodeURIComponent(f.slug)}`;
        else if (f.kind === 'referenssi' && f.slug) base = `${SITE}/referenssi.html?r=${encodeURIComponent(f.slug)}`;
        else if (f.kind === 'tontti') base = `${SITE}/myy-tonttisi.html`;
        else if (f.kind === 'muu' && /^https:\/\/www\.valttikodit\.fi\//.test(f.custom || '')) base = f.custom.split('#')[0];
        if (!base) return '';
        const camp = campaigns.find((c) => c.id === f.campaign_id);
        const utm = `utm_source=facebook&utm_medium=social&utm_campaign=${camp ? camp.slug : 'yleinen'}&utm_content=${slugify(f.title) || 'julkaisu'}`;
        return base + (base.includes('?') ? '&' : '?') + utm;
    };

    const openEditor = async (post) => {
        cur = post ? { ...post } : { id: null, title: '', body: '', image_url: '', video_url: '', channels: ['facebook'], ig_body: '', link_kind: '', link_slug: '', link_url: '', scheduled_at: null, status: 'DRAFT', campaign_id: null };
        const locked = ['SCHEDULED', 'PUBLISHED'].includes(cur.status);
        const dis = locked ? 'disabled' : '';
        const kinds = [['', 'Ei linkkiä'], ['kohde', 'Kohdesivu'], ['referenssi', 'Referenssi'], ['tontti', 'Myy tonttisi -sivu'], ['muu', 'Muu valttikodit.fi-osoite']];
        const customVal = cur.link_kind === 'muu' ? (cur.link_url || '').split(/[?&]utm_source/)[0] : '';
        let hist = [];
        if (cur.id) { const h = await sb.from('social_audit').select('at,actor,action').eq('post_id', cur.id).order('at', { ascending: false }).limit(10); hist = h.data || []; }
        modal.innerHTML = `
            <div class="lead-modal-head"><div><h2>${cur.id ? 'Julkaisu' : 'Uusi julkaisu'} ${cur.id ? chip(cur.status) : ''}</h2></div><button type="button" class="lead-x" data-close aria-label="Sulje">&times;</button></div>
            ${cur.last_error ? `<div class="so-note so-err">${esc(cur.last_error)}</div>` : ''}
            ${cur.source === 'agent' ? `<div class="so-note"><strong>Agentin ehdotus.</strong> Tarkista teksti, kuva ja ajankohta ennen hyväksyntää.${cur.agent_note ? `<br>Perustelu: ${esc(cur.agent_note)}` : ''}</div>` : ''}
            <div class="so-grid">
                <div>
                    <label class="form-label">Sisäinen nimi *</label>
                    <input id="so-title" class="form-input" value="${esc(cur.title)}" maxlength="80" ${dis}>
                    <label class="form-label" style="margin-top:0.9rem;">Kanavat *</label>
                    <div style="display:flex;gap:1.25rem;flex-wrap:wrap;">
                        <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9375rem;"><input type="checkbox" id="so-ch-fb" ${chansOf(cur).includes('facebook') ? 'checked' : ''} ${dis}> Facebook</label>
                        <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9375rem;"><input type="checkbox" id="so-ch-ig" ${chansOf(cur).includes('instagram') ? 'checked' : ''} ${dis}> Instagram</label>
                    </div>
                    ${cur.ig_permalink ? `<div class="so-sub"><a href="${esc(cur.ig_permalink)}" target="_blank" rel="noopener">Avaa Instagram-julkaisu ↗</a></div>` : ''}
                    <label class="form-label" style="margin-top:0.9rem;">Kampanja</label>
                    <select id="so-camp" class="form-input" ${dis}><option value="">(ei kampanjaa)</option>${campaigns.map((c) => `<option value="${esc(c.id)}" ${c.id === cur.campaign_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">+ Uusi kampanja…</option></select>
                    <label class="form-label" style="margin-top:0.9rem;">Julkaisuteksti *</label>
                    <textarea id="so-body" class="form-input" rows="9" ${dis}>${esc(cur.body)}</textarea>
                    <div class="so-sub"><span id="so-count">0</span> merkkiä</div>
                    <div id="so-igbody-wrap">
                        <label class="form-label" style="margin-top:0.9rem;">Instagram-teksti (valinnainen)</label>
                        <textarea id="so-igbody" class="form-input" rows="7" maxlength="2200" placeholder="Jos jätät tyhjäksi, Instagramiin menee sama teksti kuin yllä." ${dis}>${esc(cur.ig_body || '')}</textarea>
                        <div class="so-sub"><span id="so-igcount">0</span> / 2200 merkkiä. Instagramissa linkki ei ole klikattava: käytä esim. "Linkki profiilissa".</div>
                    </div>
                    <label class="form-label" style="margin-top:0.9rem;">Kuva</label>
                    <input id="so-img" class="form-input" placeholder="Kuvan osoite (https://…) tai lataa kuva alta" value="${esc(cur.image_url || '')}" ${dis}>
                    <input type="file" id="so-img-file" accept="image/*" style="margin-top:0.4rem;" ${dis}>
                    ${locked ? '' : '<button type="button" id="so-img-pick" class="btn btn-outline" style="margin-top:0.4rem;padding:0.3rem 0.8rem;font-size:0.8rem;">Valitse sivuston kuvista</button><div id="so-img-grid" class="so-img-grid" hidden></div>'}
                    <label class="form-label" style="margin-top:0.9rem;">Reels-video (valinnainen)</label>
                    <input type="hidden" id="so-video" value="${esc(cur.video_url || '')}">
                    <div id="so-video-info" class="so-sub"></div>
                    ${locked ? '' : '<input type="file" id="so-video-file" accept="video/mp4,video/quicktime" style="margin-top:0.4rem;"> <button type="button" id="so-video-del" class="btn btn-outline" style="padding:0.25rem 0.7rem;font-size:0.75rem;">Poista video</button>'}
                    <div class="so-sub">Pystyvideo (9:16), 3–90 s, mp4 tai mov, enintään 50 Mt. Kun video on valittu, julkaisu tehdään Reels-videona eikä kuvaa käytetä.</div>
                    <label class="form-label" style="margin-top:0.9rem;">Linkki</label>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                        <select id="so-kind" class="form-input" style="flex:1;min-width:150px;" ${dis}>${kinds.map(([v, t]) => `<option value="${v}" ${v === (cur.link_kind || '') ? 'selected' : ''}>${t}</option>`).join('')}</select>
                        <select id="so-slug" class="form-input" style="flex:2;min-width:180px;" ${dis}></select>
                        <input id="so-custom" class="form-input" style="flex:2;min-width:180px;" placeholder="https://www.valttikodit.fi/…" value="${esc(customVal)}" ${dis}>
                    </div>
                    <div class="so-sub" id="so-linkview" style="word-break:break-all;"></div>
                    <label class="form-label" style="margin-top:0.9rem;">Julkaisuajankohta *</label>
                    <input type="datetime-local" id="so-when" class="form-input" value="${esc(toLocalInput(cur.scheduled_at))}" ${dis}>
                    <div class="so-sub">Vähintään noin 12 minuutin päässä ja enintään 29 päivän päässä (Facebookin rajat).</div>
                    <div id="so-warn"></div>
                </div>
                <div>
                    <div class="form-label">Esikatselu</div>
                    <div class="so-fb"><div class="so-fb-head"><span class="so-fb-logo">V</span><div><strong>Valttikodit Oy</strong><div class="so-sub" id="so-fb-when"></div></div></div>
                        <div class="so-fb-text" id="so-fb-text"></div><img id="so-fb-img" alt="" style="display:none;"><video id="so-fb-video" controls muted playsinline preload="metadata" style="display:none;width:100%;max-height:420px;background:#000;"></video><div class="so-fb-link" id="so-fb-link"></div></div>
                    ${hist.length ? `<div class="form-label" style="margin-top:1.25rem;">Historia</div><ul class="so-hist">${hist.map((h) => `<li>${esc(fmt(h.at))} – ${esc(h.actor)}: ${esc(h.action)}</li>`).join('')}</ul>` : ''}
                    ${cur.fb_permalink ? `<p style="margin-top:1rem;"><a href="${esc(cur.fb_permalink)}" target="_blank" rel="noopener">Avaa julkaisu Facebookissa</a></p>` : ''}
                </div>
            </div>
            <div class="lead-actions" id="so-actions"></div>`;
        modal.showModal();
        wire(locked);
    };

    const fillSlugSelect = () => {
        const kind = $('so-kind').value, sel = $('so-slug'), cu = $('so-custom');
        sel.style.display = (kind === 'kohde' || kind === 'referenssi') ? '' : 'none';
        cu.style.display = kind === 'muu' ? '' : 'none';
        if (kind === 'kohde') sel.innerHTML = projects.map((p) => `<option value="${esc(p.slug)}" ${p.slug === cur.link_slug ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
        if (kind === 'referenssi') sel.innerHTML = refs.map((p) => `<option value="${esc(p.slug)}" ${p.slug === cur.link_slug ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
    };

    const readForm = () => {
        const kind = $('so-kind').value;
        const f = { title: $('so-title').value.trim(), campaign_id: $('so-camp').value && $('so-camp').value !== '__new' ? $('so-camp').value : null,
            body: $('so-body').value, ig_body: $('so-igbody').value.trim() ? $('so-igbody').value : null, image_url: $('so-img').value.trim() || null, video_url: $('so-video').value.trim() || null,
            channels: [$('so-ch-fb').checked ? 'facebook' : null, $('so-ch-ig').checked ? 'instagram' : null].filter(Boolean), kind, slug: ($('so-slug').value || '') , custom: $('so-custom').value.trim(),
            when: $('so-when').value ? new Date($('so-when').value).toISOString() : null };
        f.link_url = buildLink(f) || null;
        return f;
    };

    const checks = (f) => {
        const errs = [], warns = [];
        if (!f.title) errs.push('Sisäinen nimi puuttuu.');
        if (!f.body.trim()) errs.push('Julkaisuteksti puuttuu.');
        if (f.channels.includes('instagram') && /\[LIS[ÄA][^\]]*\]/i.test(f.ig_body || '')) errs.push('Instagram-tekstissä on täyttämätön paikanvaraaja.');
        if (/\[LIS[ÄA][^\]]*\]/i.test(f.body)) errs.push('Tekstissä on täyttämätön paikanvaraaja (esim. [LISÄÄ NÄYTTÖAIKA]).');
        if (f.kind && !f.link_url) errs.push('Linkki ei ole kelvollinen.');
        if (f.image_url && !/^https:\/\//.test(f.image_url)) errs.push('Kuvan osoitteen pitää alkaa https://');
        if (/€|\bhinta|hintaan|euro/i.test(f.body)) warns.push('Tekstissä on hintaan viittaava maininta: tarkista, että tiedot ovat oikein ja noudattavat markkinointisääntöjä.');
        if (!f.link_url) warns.push('Julkaisussa ei ole linkkiä, joten kävijöitä ei voida seurata.');
        const ig = f.channels.includes('instagram');
        if (!f.channels.length) errs.push('Valitse vähintään yksi kanava.');
        if (ig && !f.image_url && !f.video_url) errs.push('Instagram vaatii kuvan tai videon.');
        if (ig && !f.video_url && f.image_url && imgRatio.url === f.image_url && imgRatio.r && (imgRatio.r < 0.8 || imgRatio.r > 1.91))
            errs.push(`Instagram ei hyväksy kuvan muotoa (${imgRatio.w} × ${imgRatio.h}). Kuvasuhteen pitää olla 4:5 (pysty) – 1,91:1 (vaaka). Valitse toinen kuva tai poista Instagram kanavista.`);
        if (ig && f.link_url && !/profiili|bio|viesti|DM/i.test(f.ig_body || f.body)) warns.push('Instagramissa linkki ei ole klikattava. Lisää Instagram-tekstiin esim. "Linkki profiilissa", jos ohjaat sivustolle.');
        if (f.video_url && f.link_url && f.channels.includes('facebook')) warns.push('Reels-videon tekstissä linkki ei ole klikattava. Kävijöitä tulee siksi vähemmän kuin kuvajulkaisun linkistä.');
        if (!f.image_url && !f.video_url && !ig) warns.push('Kuvaton julkaisu tavoittaa yleensä huonommin.');
        if (f.body.length > 700) warns.push('Teksti on pitkä (yli 700 merkkiä).');
        return { errs, warns };
    };
    const whenError = (f) => {
        if (!f.when) return 'Julkaisuajankohta puuttuu.';
        const t = Date.parse(f.when), now = Date.now();
        if (t < now + 12 * 60 * 1000) return 'Ajankohdan pitää olla vähintään 12 minuutin päässä.';
        if (t > now + 29 * 24 * 60 * 60 * 1000) return 'Facebook ajastaa enintään 29 päivää eteenpäin.';
        return '';
    };

    let imgRatio = { url: null };
    const measureImg = (url) => {
        if (!url || imgRatio.url === url) return;
        imgRatio = { url };
        const im = new Image();
        im.onload = () => { if (imgRatio.url === url) { imgRatio = { url, w: im.naturalWidth, h: im.naturalHeight, r: im.naturalWidth / im.naturalHeight }; refreshPreview(); } };
        im.src = url;
    };
    const refreshPreview = () => {
        const f = readForm();
        measureImg(f.image_url);
        $('so-count').textContent = f.body.length;
        $('so-igcount').textContent = (f.ig_body || '').length;
        $('so-igbody-wrap').style.display = f.channels.includes('instagram') ? '' : 'none';
        $('so-fb-text').textContent = f.body || '(teksti)';
        $('so-fb-when').textContent = (f.when ? fmt(f.when) : 'ajankohtaa ei asetettu') + (f.channels.length ? ' · ' + f.channels.map((c) => (c === 'instagram' ? 'Instagram' : 'Facebook')).join(' + ') : '');
        const im = $('so-fb-img'), vd = $('so-fb-video');
        if (f.video_url) { if (vd.getAttribute('src') !== f.video_url) vd.src = f.video_url; vd.style.display = 'block'; im.style.display = 'none'; }
        else { vd.style.display = 'none'; if (vd.getAttribute('src')) vd.removeAttribute('src'); if (f.image_url) { im.src = f.image_url; im.style.display = 'block'; } else im.style.display = 'none'; }
        $('so-video-info').textContent = f.video_url ? 'Video valittu: julkaistaan Reels-videona.' : 'Ei videota.';
        $('so-fb-link').textContent = f.link_url ? f.link_url.replace(/^https:\/\//, '').split('?')[0] : '';
        $('so-linkview').textContent = f.link_url ? 'Valmis seurantalinkki: ' + f.link_url : '';
        const { errs, warns } = checks(f);
        $('so-warn').innerHTML = [...errs.map((m) => `<div class="so-note so-err">${esc(m)}</div>`), ...warns.map((m) => `<div class="so-note so-warn">${esc(m)}</div>`)].join('');
    };

    const wire = (locked) => {
        fillSlugSelect();
        modal.querySelector('[data-close]').onclick = () => modal.close();
        if (!locked) {
            ['so-title', 'so-camp', 'so-body', 'so-img', 'so-kind', 'so-slug', 'so-custom', 'so-when', 'so-ch-fb', 'so-ch-ig', 'so-igbody'].forEach((id) => $(id).addEventListener('input', refreshPreview));
            $('so-kind').addEventListener('change', () => { fillSlugSelect(); refreshPreview(); });
            $('so-camp').addEventListener('change', async () => {
                if ($('so-camp').value !== '__new') return;
                const name = (prompt('Kampanjan nimi (esim. "Saunaranta B lokakuu"):') || '').trim();
                if (!name) { $('so-camp').value = ''; refreshPreview(); return; }
                const slug = slugify(name);
                const { data, error } = await sb.from('social_campaigns').insert([{ name, slug }]).select().single();
                if (error) { alert('Kampanjan luonti epäonnistui: ' + error.message); $('so-camp').value = ''; return; }
                campaigns.unshift(data);
                $('so-camp').innerHTML = `<option value="">(ei kampanjaa)</option>${campaigns.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="__new">+ Uusi kampanja…</option>`;
                $('so-camp').value = data.id; refreshPreview();
            });
            $('so-img-pick').addEventListener('click', () => {
                const g = $('so-img-grid');
                if (!g.hidden) { g.hidden = true; return; }
                g.innerHTML = siteImages.length ? siteImages.map((im) => `<button type="button" class="so-img-opt" data-url="${esc(im.url)}" title="${esc(im.group + ': ' + im.label)}"><img src="${esc(im.url)}" alt="${esc(im.label)}" loading="lazy"><span>${esc(im.label)}</span></button>`).join('') : '<div class="so-sub">Sivustolla ei ole valittavia kuvia.</div>';
                g.hidden = false;
            });
            $('so-img-grid').addEventListener('click', (e) => {
                const b = e.target.closest('[data-url]'); if (!b) return;
                $('so-img').value = b.dataset.url; $('so-img-grid').hidden = true; refreshPreview();
            });
            // Reels-video: tarkista kesto ja koko ennen latausta
            const videoMeta = (file) => new Promise((res, rej) => {
                const v = document.createElement('video'); v.preload = 'metadata';
                v.onloadedmetadata = () => { const m = { d: v.duration, w: v.videoWidth, h: v.videoHeight }; URL.revokeObjectURL(v.src); res(m); };
                v.onerror = () => { URL.revokeObjectURL(v.src); rej(new Error('Videota ei voitu lukea. Käytä mp4- tai mov-tiedostoa.')); };
                v.src = URL.createObjectURL(file);
            });
            $('so-video-file').addEventListener('change', async (e) => {
                const file = e.target.files[0]; if (!file) return;
                const info = $('so-video-info');
                try {
                    if (!/^video\/(mp4|quicktime)$/.test(file.type)) throw new Error('Käytä mp4- tai mov-tiedostoa.');
                    if (file.size > 50 * 1024 * 1024) throw new Error('Video on liian suuri (' + Math.round(file.size / 1048576) + ' Mt). Enimmäiskoko on 50 Mt. Pienennä video ensin.');
                    const m = await videoMeta(file);
                    if (!(m.d >= 3 && m.d <= 90)) throw new Error('Videon pituuden pitää olla 3–90 sekuntia (nyt ' + Math.round(m.d) + ' s).');
                    if (m.w && m.h && m.w >= m.h && !confirm('Video ei ole pystysuuntainen (' + m.w + ' × ' + m.h + '). Facebook suosittelee Reels-videoille pystykuvaa 9:16. Ladataanko silti?')) { e.target.value = ''; return; }
                    info.textContent = 'Ladataan videota...';
                    const ext = file.type === 'video/quicktime' ? 'mov' : 'mp4';
                    const path = `social/video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                    const up = await sb.storage.from('images').upload(path, file, { contentType: file.type });
                    if (up.error) throw up.error;
                    $('so-video').value = sb.storage.from('images').getPublicUrl(path).data.publicUrl; refreshPreview();
                } catch (err) { e.target.value = ''; refreshPreview(); alert('Videon lataus epäonnistui: ' + (err.message || err)); }
            });
            $('so-video-del').addEventListener('click', () => { $('so-video').value = ''; $('so-video-file').value = ''; refreshPreview(); });
            $('so-img-file').addEventListener('change', async (e) => {
                const file = e.target.files[0]; if (!file) return;
                try {
                    const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / bmp.width);
                    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
                    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
                    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
                    const path = `social/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
                    const up = await sb.storage.from('images').upload(path, blob, { contentType: 'image/jpeg' });
                    if (up.error) throw up.error;
                    $('so-img').value = sb.storage.from('images').getPublicUrl(path).data.publicUrl; refreshPreview();
                } catch (err) { alert('Kuvan lataus epäonnistui: ' + (err.message || err)); }
            });
        }
        refreshPreview();
        renderActions(locked);
    };

    const renderActions = (locked) => {
        const st = cur.status, A = $('so-actions'); const btn = (id, cls, t, style = '') => `<button type="button" id="${id}" class="btn ${cls}" style="${style}">${t}</button>`;
        let h = '';
        if (st === 'DRAFT' || st === 'CANCELLED' || st === 'FAILED') h += btn('so-save', 'btn-outline', 'Tallenna luonnos') + btn('so-approve', 'btn-primary', 'Hyväksy ja ajasta Facebookiin');
        if (st === 'APPROVED') h += btn('so-retry', 'btn-primary', 'Ajasta Facebookiin') + btn('so-draft', 'btn-outline', 'Palauta luonnokseksi');
        if (st === 'SCHEDULED') h += btn('so-cancel', 'btn-outline', 'Peru ajastus', 'border-color:#ef4444;color:#ef4444;');
        if (cur.id && !['SCHEDULED', 'PUBLISHED'].includes(st)) h += btn('so-del', 'btn-outline', 'Poista', 'border-color:#ef4444;color:#ef4444;margin-left:auto;');
        A.innerHTML = h + '<span id="so-msg" class="so-sub" style="align-self:center;"></span>';
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = async () => { if (busy) return; busy = true; $('so-msg').textContent = 'Odota...'; try { await fn(); } catch (e) { $('so-msg').textContent = ''; alert(e.message || e); } finally { busy = false; } }; };
        on('so-save', () => save(false));
        on('so-approve', async () => {
            const f = readForm(), c = checks(f), we = whenError(f);
            if (c.errs.length || we) { alert([...c.errs, we].filter(Boolean).join('\n')); $('so-msg').textContent = ''; return; }
            if (c.warns.length && !confirm('Huomioita:\n- ' + c.warns.join('\n- ') + '\n\nHyväksytäänkö silti ja ajastetaanko julkaisu?')) { $('so-msg').textContent = ''; return; }
            await save(true);
        });
        on('so-retry', () => schedule());
        on('so-draft', async () => { await upd({ status: 'DRAFT' }); await done('Palautettu luonnokseksi.'); });
        on('so-cancel', async () => { if (!confirm('Perutaanko ajastus Facebookista?')) { $('so-msg').textContent = ''; return; } const j = await callFn('cancel', cur.id); if (!j.ok) throw new Error(j.error); await done('Ajastus peruttu.'); });
        on('so-del', async () => { if (!confirm('Poistetaanko julkaisu pysyvästi?')) { $('so-msg').textContent = ''; return; } const { error } = await sb.from('social_posts').delete().eq('id', cur.id); if (error) throw error; await done('Poistettu.', true); });
    };

    const upd = async (patch) => { const { error } = await sb.from('social_posts').update(patch).eq('id', cur.id); if (error) throw error; };
    const done = async (msg, close) => { await load(); if (close) { modal.close(); return; } const p = posts.find((x) => x.id === cur.id); if (p) await openEditor(p); const m = $('so-msg'); if (m) m.textContent = msg; };

    const save = async (approve) => {
        const f = readForm();
        const row = { title: f.title || '(nimetön)', body: f.body, ig_body: f.channels.includes('instagram') ? f.ig_body : null, image_url: f.image_url, video_url: f.video_url, channels: f.channels.length ? f.channels : ['facebook'], campaign_id: f.campaign_id, link_kind: f.kind || null,
            link_slug: (f.kind === 'kohde' || f.kind === 'referenssi') ? f.slug : null, link_url: f.link_url, scheduled_at: f.when };
        if (!cur.id) {
            const { data, error } = await sb.from('social_posts').insert([row]).select().single(); if (error) throw error; cur = data;
        } else { await upd(row); cur = { ...cur, ...row }; }
        if (!approve) { await done('Luonnos tallennettu.'); return; }
        await upd({ status: 'APPROVED' });
        cur.status = 'APPROVED';
        await schedule();
    };

    const schedule = async () => {
        const j = await callFn('schedule', cur.id);
        await load();
        const p = posts.find((x) => x.id === cur.id); if (p) await openEditor(p);
        const m = $('so-msg');
        if (!j.ok) { if (m) m.textContent = ''; throw new Error('Ajastus epäonnistui: ' + j.error + '\n\nJulkaisu on hyväksytty mutta ei vielä ajastettu. Voit yrittää uudelleen.'); }
        if (m && chansOf(cur).includes('instagram')) { m.textContent = 'Ajastettu. Instagram-julkaisu lähtee ajankohtana (enintään noin 10 min viiveellä' + (cur.video_url ? ', video vielä käsittelyn jälkeen' : '') + ').'; return; }
        if (m) m.textContent = cur.video_url ? 'Ajastettu Facebookiin Reels-videona. Facebook käsittelee videon vielä; jos käsittely epäonnistuu, tila muuttuu tilaan Epäonnistui.' : 'Ajastettu Facebookiin.';
    };

    // ---- Tavoitteet (some-agentti lukee) ----
    const PRIO = [['myynti', 'Myytävät kohteet (liidit ja kaupat)'], ['tontit', 'Tonttihankinta'], ['seuraajat', 'Seuraajien kasvu'], ['luottamus', 'Luottamus ja referenssit']];
    const PRIO_LV = [[0, 'Ei nyt'], [1, 'Normaali'], [2, 'Korkea'], [3, 'Tärkein']];
    const ST_FI = { MARKETING: 'ennakkomarkkinointi', AVAILABLE: 'vapaana', CONSTRUCTION: 'rakenteilla', RESERVED: 'varattu', SOLD: 'myyty' };
    const loadGoals = async () => {
        const [g, hst] = await Promise.all([
            sb.from('social_goals').select('*').eq('id', 1).maybeSingle(),
            sb.from('social_audit').select('at,actor,details').eq('action', 'tavoitteet paivitetty').order('at', { ascending: false }).limit(8),
        ]);
        if (g.error) { $('so-goals-form').innerHTML = `<div class="so-note so-err">Virhe: ${esc(g.error.message)}</div>`; return; }
        const goal = g.data || { focus_projects: [], focus_note: '', priorities: { myynti: 2, tontit: 1, seuraajat: 1, luottamus: 1 }, weekly_message: '', avoid: '', valid_until: null };
        const expired = goal.valid_until && goal.valid_until < new Date().toISOString().slice(0, 10);
        $('so-goals-form').innerHTML = `
            ${g.data ? `<div class="so-note ${expired ? 'so-err' : ''}">${expired ? 'Tavoitteet ovat vanhentuneet, joten agentti ei käytä niitä. Päivitä voimassaoloaika.' : 'Voimassa' + (goal.valid_until ? ' ' + esc(new Date(goal.valid_until).toLocaleDateString('fi-FI')) + ' asti' : ' toistaiseksi')}. Päivittänyt ${esc(goal.updated_by || '–')} ${esc(new Date(goal.updated_at).toLocaleString('fi-FI'))}.</div>` : '<div class="so-note">Tavoitteita ei ole vielä asetettu. Agentti käyttää oletuspainotuksia.</div>'}
            <label class="form-label">Tärkeimmät kohteet nyt</label>
            <div style="display:flex;flex-direction:column;gap:0.35rem;">${projects.map((x) => `<label style="display:flex;gap:0.5rem;align-items:center;font-size:0.9375rem;"><input type="checkbox" class="so-gp" value="${esc(x.slug)}" ${(goal.focus_projects || []).includes(x.slug) ? 'checked' : ''}> ${esc(x.title)} <span class="so-sub">(${esc(ST_FI[x.status] || x.status)})</span></label>`).join('') || '<span class="so-sub">Ei julkaistuja kohteita.</span>'}</div>
            <label class="form-label" style="margin-top:0.9rem;">Miksi nämä (agentille)</label>
            <textarea id="so-g-note" class="form-input" rows="2" maxlength="500" placeholder="Esim. Hieroja 3 pitää saada myytyä ennen joulua, rahoitus on valmiina.">${esc(goal.focus_note || '')}</textarea>
            <label class="form-label" style="margin-top:0.9rem;">Painotus</label>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.6rem;">${PRIO.map(([k, t]) => `<label style="font-size:0.875rem;">${esc(t)}<select class="form-input so-gprio" data-k="${k}" style="margin-top:0.25rem;">${PRIO_LV.map(([v, l]) => `<option value="${v}" ${Number((goal.priorities || {})[k] ?? 1) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}</div>
            <label class="form-label" style="margin-top:0.9rem;">Viikon erityisviesti</label>
            <textarea id="so-g-week" class="form-input" rows="2" maxlength="500" placeholder="Esim. Näyttö su 29.11. klo 13–15 Hieroja 3:ssa. Agentti käyttää tätä faktana.">${esc(goal.weekly_message || '')}</textarea>
            <label class="form-label" style="margin-top:0.9rem;">Vältettävät asiat</label>
            <textarea id="so-g-avoid" class="form-input" rows="2" maxlength="500" placeholder="Esim. Älä mainitse Saunaranta B:n hintaa.">${esc(goal.avoid || '')}</textarea>
            <label class="form-label" style="margin-top:0.9rem;">Voimassa asti</label>
            <input type="date" id="so-g-until" class="form-input" style="max-width:220px;" value="${esc(goal.valid_until || '')}">
            <div class="so-sub">Jätä tyhjäksi, jos tavoitteet ovat voimassa toistaiseksi. Vanhentuneita tavoitteita agentti ei käytä.</div>
            <div style="margin-top:1rem;display:flex;gap:0.75rem;align-items:center;"><button type="button" class="btn btn-primary" id="so-g-save">Tallenna tavoitteet</button><span id="so-g-msg" class="so-sub"></span></div>`;
        $('so-goals-hist').innerHTML = (hst.data || []).length ? hst.data.map((r) => `<tr><td>${esc(new Date(r.at).toLocaleString('fi-FI'))}</td><td>${esc(r.actor || '–')}</td><td>${esc(((r.details || {}).weekly_message || '–').slice(0, 80))}</td><td>${esc((r.details || {}).valid_until ? new Date(r.details.valid_until).toLocaleDateString('fi-FI') : 'toistaiseksi')}</td></tr>`).join('') : '<tr><td colspan="4">Ei muutoksia vielä.</td></tr>';
        $('so-g-save').addEventListener('click', async () => {
            const b = $('so-g-save'); b.disabled = true; $('so-g-msg').textContent = 'Tallennetaan...';
            const pr = {}; document.querySelectorAll('.so-gprio').forEach((el) => { pr[el.dataset.k] = Number(el.value); });
            const row = { id: 1, focus_projects: [...document.querySelectorAll('.so-gp:checked')].map((el) => el.value),
                focus_note: $('so-g-note').value.trim() || null, priorities: pr, weekly_message: $('so-g-week').value.trim() || null,
                avoid: $('so-g-avoid').value.trim() || null, valid_until: $('so-g-until').value || null };
            const { error } = await sb.from('social_goals').upsert(row, { onConflict: 'id' });
            b.disabled = false;
            if (error) { $('so-g-msg').textContent = 'Tallennus epäonnistui: ' + error.message; return; }
            await loadGoals(); $('so-g-msg').textContent = 'Tallennettu. Agentti käyttää näitä seuraavassa viikkosuunnitelmassa.';
        });
    };

    $('so-tabs').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        document.querySelectorAll('#so-tabs .so-tab').forEach((t) => t.classList.toggle('active', t === b));
        $('so-tab-posts').style.display = b.dataset.tab === 'posts' ? '' : 'none';
        $('so-tab-goals').style.display = b.dataset.tab === 'goals' ? '' : 'none';
        if (b.dataset.tab === 'goals') await loadGoals();
    });

    await load();
    // Tarkista ajastetut julkaisut, joiden aika on ohi (merkitään julkaistuiksi)
    try { if (posts.some((x) => x.status === 'SCHEDULED' && (x.video_url || (x.scheduled_at && Date.parse(x.scheduled_at) < Date.now())))) { const j = await callFn('refresh'); if (j.ok && (j.published || j.failed)) await load(); } } catch (e) {}
});

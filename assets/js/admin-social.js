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

    const render = () => {
        const rows = posts.filter((x) => filter === 'all' || x.status === filter);
        if (!rows.length) { listEl.innerHTML = '<tr><td colspan="5">Ei julkaisuja tässä näkymässä. Paina "Uusi julkaisu".</td></tr>'; return; }
        listEl.innerHTML = rows.map((x) => {
            const camp = campaigns.find((c) => c.id === x.campaign_id);
            return `<tr data-id="${esc(x.id)}" class="so-row">
                <td style="font-weight:500;">${esc(x.title)}${x.source === 'agent' ? ' <span class="so-agent">Agentin ehdotus</span>' : ''}<div class="so-sub">${esc((x.body || '').slice(0, 70))}${(x.body || '').length > 70 ? '…' : ''}</div></td>
                <td>${camp ? esc(camp.name) : '–'}</td>
                <td>${esc(fmt(x.scheduled_at))}</td>
                <td>${chip(x.status)}${x.last_error ? `<div class="so-sub" style="color:#b91c1c;">${esc(x.last_error)}</div>` : ''}</td>
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
            out.innerHTML = j.ok ? `Yhteys toimii: <strong>${esc(j.page)}</strong>${j.followers != null ? ` (${esc(j.followers)} seuraajaa)` : ''}.` : `Yhteys ei toimi: ${esc(j.error)}`;
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
        cur = post ? { ...post } : { id: null, title: '', body: '', image_url: '', link_kind: '', link_slug: '', link_url: '', scheduled_at: null, status: 'DRAFT', campaign_id: null };
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
                    <label class="form-label" style="margin-top:0.9rem;">Kampanja</label>
                    <select id="so-camp" class="form-input" ${dis}><option value="">(ei kampanjaa)</option>${campaigns.map((c) => `<option value="${esc(c.id)}" ${c.id === cur.campaign_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__new">+ Uusi kampanja…</option></select>
                    <label class="form-label" style="margin-top:0.9rem;">Julkaisuteksti *</label>
                    <textarea id="so-body" class="form-input" rows="9" ${dis}>${esc(cur.body)}</textarea>
                    <div class="so-sub"><span id="so-count">0</span> merkkiä</div>
                    <label class="form-label" style="margin-top:0.9rem;">Kuva</label>
                    <input id="so-img" class="form-input" placeholder="Kuvan osoite (https://…) tai lataa kuva alta" value="${esc(cur.image_url || '')}" ${dis}>
                    <input type="file" id="so-img-file" accept="image/*" style="margin-top:0.4rem;" ${dis}>
                    ${locked ? '' : '<button type="button" id="so-img-pick" class="btn btn-outline" style="margin-top:0.4rem;padding:0.3rem 0.8rem;font-size:0.8rem;">Valitse sivuston kuvista</button><div id="so-img-grid" class="so-img-grid" hidden></div>'}
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
                        <div class="so-fb-text" id="so-fb-text"></div><img id="so-fb-img" alt="" style="display:none;"><div class="so-fb-link" id="so-fb-link"></div></div>
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
            body: $('so-body').value, image_url: $('so-img').value.trim() || null, kind, slug: ($('so-slug').value || '') , custom: $('so-custom').value.trim(),
            when: $('so-when').value ? new Date($('so-when').value).toISOString() : null };
        f.link_url = buildLink(f) || null;
        return f;
    };

    const checks = (f) => {
        const errs = [], warns = [];
        if (!f.title) errs.push('Sisäinen nimi puuttuu.');
        if (!f.body.trim()) errs.push('Julkaisuteksti puuttuu.');
        if (/\[LIS[ÄA][^\]]*\]/i.test(f.body)) errs.push('Tekstissä on täyttämätön paikanvaraaja (esim. [LISÄÄ NÄYTTÖAIKA]).');
        if (f.kind && !f.link_url) errs.push('Linkki ei ole kelvollinen.');
        if (f.image_url && !/^https:\/\//.test(f.image_url)) errs.push('Kuvan osoitteen pitää alkaa https://');
        if (/€|\bhinta|hintaan|euro/i.test(f.body)) warns.push('Tekstissä on hintaan viittaava maininta: tarkista, että tiedot ovat oikein ja noudattavat markkinointisääntöjä.');
        if (!f.link_url) warns.push('Julkaisussa ei ole linkkiä, joten kävijöitä ei voida seurata.');
        if (!f.image_url) warns.push('Kuvaton julkaisu tavoittaa yleensä huonommin.');
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

    const refreshPreview = () => {
        const f = readForm();
        $('so-count').textContent = f.body.length;
        $('so-fb-text').textContent = f.body || '(teksti)';
        $('so-fb-when').textContent = f.when ? fmt(f.when) : 'ajankohtaa ei asetettu';
        const im = $('so-fb-img'); if (f.image_url) { im.src = f.image_url; im.style.display = 'block'; } else im.style.display = 'none';
        $('so-fb-link').textContent = f.link_url ? f.link_url.replace(/^https:\/\//, '').split('?')[0] : '';
        $('so-linkview').textContent = f.link_url ? 'Valmis seurantalinkki: ' + f.link_url : '';
        const { errs, warns } = checks(f);
        $('so-warn').innerHTML = [...errs.map((m) => `<div class="so-note so-err">${esc(m)}</div>`), ...warns.map((m) => `<div class="so-note so-warn">${esc(m)}</div>`)].join('');
    };

    const wire = (locked) => {
        fillSlugSelect();
        modal.querySelector('[data-close]').onclick = () => modal.close();
        if (!locked) {
            ['so-title', 'so-camp', 'so-body', 'so-img', 'so-kind', 'so-slug', 'so-custom', 'so-when'].forEach((id) => $(id).addEventListener('input', refreshPreview));
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
        const row = { title: f.title || '(nimetön)', body: f.body, image_url: f.image_url, campaign_id: f.campaign_id, link_kind: f.kind || null,
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
        if (m) m.textContent = 'Ajastettu Facebookiin.';
    };

    // ---------- Tulokset-välilehti ----------
    const fmtN = (n) => (n == null ? '–' : Number(n).toLocaleString('fi-FI'));
    const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
    let resDays = 30, chartPage = [];
    const niceMax = (m) => { const e = Math.pow(10, Math.floor(Math.log10(Math.max(m, 1)))); const f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
    const dayLabel = (d) => { const [, m, dd] = d.split('-'); return Number(dd) + '.' + Number(m) + '.'; };
    const drawChart = () => {
        const el = $('so-chart'); const page = chartPage;
        if (page.length < 2) { el.innerHTML = '<div class="so-sub">Ei vielä riittävästi dataa.</div>'; return; }
        const W = Math.max(320, el.clientWidth || 700), H = 230, L = 46, R = 14, T = 12, B = 30;
        const vals = page.map((x) => Number(x.views) || 0), top = niceMax(Math.max(...vals, 1)), n = page.length;
        const X = (i) => L + (i / (n - 1)) * (W - L - R), Y = (v) => T + (1 - v / top) * (H - T - B);
        const ticks = [0, 1, 2, 3, 4].map((k) => (top / 4) * k);
        const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 62))));
        const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#e5e7eb"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#6b7280">${esc(fmtN(Math.round(t * 10) / 10))}</text>`).join('');
        const xl = page.map((x, i) => (i % step === 0 || i === n - 1) && (n - 1 - i >= step * 0.6 || i === n - 1) ? `<text x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" font-size="11" fill="#6b7280">${esc(dayLabel(x.day))}</text>` : '').join('');
        const pts = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
        el.style.position = 'relative';
        el.innerHTML = `<svg width="${W}" height="${H}" style="display:block;max-width:100%;" role="img" aria-label="Sivun näytöt päivittäin">${grid}${xl}
            <polygon points="${L},${Y(0)} ${pts} ${X(n - 1)},${Y(0)}" fill="#1d4ed8" opacity="0.08"/>
            <polyline fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linejoin="round" points="${pts}"/>
            <line id="so-hl" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#9ca3af" stroke-dasharray="3 3" style="display:none;"/>
            <circle id="so-hd" r="4" fill="#1d4ed8" stroke="#fff" stroke-width="2" style="display:none;"/>
            <rect id="so-hover" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>
            <div id="so-tip" class="so-tip" style="display:none;"></div>
            <div class="so-sub">${esc(page[0].day)} – ${esc(page[n - 1].day)}, korkein ${fmtN(Math.max(...vals))} näyttöä/pv</div>`;
        const svg = el.querySelector('svg'), tip = $('so-tip'), hl = $('so-hl'), hd = $('so-hd');
        const hide = () => { tip.style.display = 'none'; hl.style.display = 'none'; hd.style.display = 'none'; };
        const move = (e) => {
            const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * (W / r.width);
            const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
            hl.setAttribute('x1', X(i)); hl.setAttribute('x2', X(i)); hl.style.display = '';
            hd.setAttribute('cx', X(i)); hd.setAttribute('cy', Y(vals[i])); hd.style.display = '';
            tip.innerHTML = `<strong>${esc(fmtN(vals[i]))}</strong> näyttöä<br>${esc(dayLabel(page[i].day))}`;
            tip.style.display = 'block';
            const tx = X(i) * (r.width / W);
            tip.style.left = Math.min(Math.max(tx - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth) + 'px';
            tip.style.top = Math.max(0, Y(vals[i]) * (r.height / H) - tip.offsetHeight - 10) + 'px';
        };
        $('so-hover').addEventListener('mousemove', move); $('so-hover').addEventListener('mouseleave', hide);
        $('so-hover').addEventListener('touchstart', (e) => move(e.touches[0]), { passive: true }); $('so-hover').addEventListener('touchmove', (e) => move(e.touches[0]), { passive: true });
    };
    let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if ($('so-tab-results').style.display !== 'none') drawChart(); }, 150); });
    const renderResults = (d) => {
        const page = d.page || [], posts = d.posts || [], camps = d.campaigns || [];
        const vN = sum(page.map((x) => x.views));
        const followers = page.length ? page[page.length - 1].followers : null;
        const postsN = posts.length;
        const siteViews = sum(camps.map((c) => c.site_views)), leads = sum(camps.map((c) => c.leads));
        $('so-sync-info').textContent = d.synced_at ? 'Tilastot päivitetty ' + new Date(d.synced_at).toLocaleString('fi-FI') : 'Tilastoja ei ole vielä haettu. Paina "Päivitä tilastot nyt".';
        $('so-cards').innerHTML = [
            ['Seuraajat', fmtN(followers), ''], [`Sivun näytöt ${resDays} pv`, fmtN(vN), ''],
            [`Julkaisuja ${resDays} pv`, fmtN(postsN), ''], ['Kävijöitä Facebookista sivustolle', fmtN(siteViews), `${fmtN(leads)} liidiä kampanjoista`],
        ].map(([t, v, s]) => `<div class="so-card"><div class="so-sub">${esc(t)}</div><div class="so-card-v">${esc(v)}</div><div class="so-sub">${esc(s)}</div></div>`).join('');
        chartPage = page; drawChart();
        $('so-res-title').textContent = `Julkaisut (${resDays} vrk)`;
        $('so-res-posts').innerHTML = posts.length ? posts.map((x) => `<tr><td>${esc(new Date(x.created_time).toLocaleDateString('fi-FI'))}</td>
            <td style="max-width:360px;">${x.title ? `<strong>${esc(x.title)}</strong>${x.campaign ? ` <span class="so-sub">(${esc(x.campaign)})</span>` : ''}` : esc((x.message || '(ei tekstiä)').slice(0, 90))}${x.permalink ? ` <a href="${esc(x.permalink)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
            <td>${fmtN(x.views)}</td><td>${fmtN(x.unique_views)}</td><td>${fmtN(x.clicks)}</td><td>${fmtN(x.reactions)}</td><td>${x.utm_content ? fmtN(x.site_views) : '<span class="so-sub">–</span>'}</td></tr>`).join('') : '<tr><td colspan="7">Ei julkaisuja. Paina "Päivitä tilastot nyt".</td></tr>';
        $('so-res-camps').innerHTML = camps.length ? camps.map((c) => `<tr><td>${esc(c.campaign)}</td><td>${fmtN(c.site_views)}</td><td>${fmtN(c.leads)}</td></tr>`).join('') : '<tr><td colspan="3">Ei kampanjaliikennettä vielä. Se alkaa kertyä, kun julkaisut, joissa on seurantalinkki, menevät ulos.</td></tr>';
    };
    let resLoaded = false;
    $('so-range').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-days]'); if (!b) return;
        resDays = Number(b.dataset.days);
        document.querySelectorAll('#so-range [data-days]').forEach((x) => x.classList.toggle('active', x === b));
        await loadResults();
    });
    const loadResults = async () => {
        const { data, error } = await sb.rpc('social_results', { p_days: resDays });
        if (error) { $('so-sync-info').textContent = 'Virhe: ' + error.message; return null; }
        renderResults(data); return data;
    };
    const syncNow = async (silent) => {
        const b = $('so-sync'); if (b) { b.disabled = true; b.textContent = 'Päivitetään...'; }
        try {
            const j = await callFn('sync');
            if (!j.ok && !silent) alert('Päivitys epäonnistui: ' + j.error);
            if (j.errors && j.errors.length && !silent) alert('Osa tiedoista puuttui:\n' + j.errors.slice(0, 4).join('\n'));
        } catch (e) { if (!silent) alert('Päivitys epäonnistui: ' + e.message); }
        await loadResults(); if (b) { b.disabled = false; b.textContent = 'Päivitä tilastot nyt'; }
    };
    $('so-sync').addEventListener('click', () => syncNow(false));
    $('so-tabs').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        document.querySelectorAll('#so-tabs .so-tab').forEach((t) => t.classList.toggle('active', t === b));
        $('so-tab-posts').style.display = b.dataset.tab === 'posts' ? '' : 'none';
        $('so-tab-results').style.display = b.dataset.tab === 'results' ? '' : 'none';
        if (b.dataset.tab === 'results' && !resLoaded) {
            resLoaded = true;
            const d = await loadResults();
            if (d && (!d.synced_at || Date.now() - Date.parse(d.synced_at) > 20 * 3600 * 1000)) await syncNow(true);   // vanhentuneet tilastot haetaan automaattisesti
        }
    });

    await load();
    // Tarkista ajastetut julkaisut, joiden aika on ohi (merkitään julkaistuiksi)
    try { if (posts.some((x) => x.status === 'SCHEDULED' && x.scheduled_at && Date.parse(x.scheduled_at) < Date.now())) { const j = await callFn('refresh'); if (j.ok && j.published) await load(); } } catch (e) {}
});

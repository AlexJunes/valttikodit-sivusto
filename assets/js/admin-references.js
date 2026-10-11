// assets/js/admin-references.js
// Referenssien ylläpito: lista (admin/references.html) ja muokkaus (admin/edit-reference.html).
// Käyttää admin.js:n globaaleja SUPABASE_URL / SUPABASE_ANON_KEY ja esc(); kirjautumis- ja MFA-tarkistus tulee admin.js:stä.
document.addEventListener('DOMContentLoaded', async () => {
    const listEl = document.getElementById('ref-admin-list');
    const form = document.getElementById('ref-edit-form');
    if ((!listEl && !form) || !window.supabase) return;
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const $ = (id) => document.getElementById(id);

    // ====================== LISTA ======================
    if (listEl) {
        const orderBtn = $('ref-save-order');
        let rows = [];

        const render = () => {
            if (!rows.length) { listEl.innerHTML = '<tr><td colspan="4">Ei referenssejä vielä. Lisää ensimmäinen painamalla "Lisää uusi referenssi".</td></tr>'; return; }
            listEl.innerHTML = rows.map((r, i) => `
                <tr data-id="${esc(r.id)}">
                    <td style="font-weight: 500;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="display: flex; flex-direction: column; background: #f9fafb; border: 1px solid var(--border); border-radius: 4px;">
                                <button class="btn" style="padding: 0.15rem 0.35rem; border: none; font-size: 0.65rem; background: transparent; cursor: pointer;" data-act="up" data-i="${i}" aria-label="Siirrä ylös">&#x25B2;</button>
                                <div style="height: 1px; background: var(--border);"></div>
                                <button class="btn" style="padding: 0.15rem 0.35rem; border: none; font-size: 0.65rem; background: transparent; cursor: pointer;" data-act="down" data-i="${i}" aria-label="Siirrä alas">&#x25BC;</button>
                            </div>
                            ${esc(r.title)}
                        </div>
                    </td>
                    <td>${esc([r.location, r.year].filter(Boolean).join(', ')) || '-'}</td>
                    <td>${r.published ? '<span style="color: green; font-weight: 600;">Kyllä</span>' : '<span style="color: red;">Ei</span>'}
                        <button class="btn btn-outline" style="padding: 0.15rem 0.6rem; font-size: 0.75rem; margin-left: 0.5rem;" data-act="toggle" data-i="${i}">${r.published ? 'Piilota' : 'Julkaise'}</button></td>
                    <td style="text-align: right; white-space: nowrap;">
                        <a class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; display: inline-flex;" href="../referenssi.html?r=${encodeURIComponent(r.slug)}" target="_blank" rel="noopener">Esikatsele</a>
                        <a class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; display: inline-flex;" href="edit-reference.html?id=${encodeURIComponent(r.id)}">Muokkaa</a>
                        <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;" data-act="del" data-i="${i}">Poista</button>
                    </td>
                </tr>`).join('');
        };

        const load = async () => {
            const { data, error } = await sb.from('reference_cases').select('id,slug,title,location,year,published,sort_order,created_at')
                .order('sort_order', { ascending: true }).order('created_at', { ascending: false });
            if (error) { listEl.innerHTML = `<tr><td colspan="4" style="color:red;">Virhe: ${esc(error.message)}</td></tr>`; return; }
            rows = data || [];
            render();
        };

        listEl.addEventListener('click', async (e) => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            const i = Number(b.dataset.i), act = b.dataset.act;
            if (act === 'up' && i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); orderBtn.style.display = 'inline-flex'; }
            if (act === 'down' && i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); orderBtn.style.display = 'inline-flex'; }
            if (act === 'toggle') {
                const r = rows[i];
                const { error } = await sb.from('reference_cases').update({ published: !r.published }).eq('id', r.id);
                if (error) alert('Päivitys epäonnistui: ' + error.message); else { r.published = !r.published; render(); }
            }
            if (act === 'del') {
                const r = rows[i];
                if (!confirm(`Poistetaanko referenssi "${r.title}" pysyvästi?`)) return;
                const { error } = await sb.from('reference_cases').delete().eq('id', r.id);
                if (error) alert('Poisto epäonnistui: ' + error.message); else load();
            }
        });

        orderBtn.addEventListener('click', async () => {
            orderBtn.disabled = true; orderBtn.textContent = 'Tallennetaan...';
            const results = await Promise.all(rows.map((r, i) => sb.from('reference_cases').update({ sort_order: i + 1 }).eq('id', r.id)));
            const err = results.find((x) => x.error);
            if (err) alert('Järjestyksen tallennus epäonnistui: ' + err.error.message);
            orderBtn.disabled = false; orderBtn.textContent = 'Tallenna järjestys'; orderBtn.style.display = 'none';
            load();
        });

        load();
        return;
    }

    // ====================== MUOKKAUS ======================
    const params = new URLSearchParams(window.location.search);
    let refId = params.get('id');
    const status = $('ref-status');
    const setStatus = (t, err) => { status.textContent = t || ''; status.style.color = err ? '#ef4444' : ''; };

    const state = {
        slots: { hero_image: { url: '', file: null }, story_image: { url: '', file: null }, location_image: { url: '', file: null } },
        gallery: [], features: [], specs: [], facts: [{}, {}, {}, {}], slugTouched: false
    };

    const slugify = (t) => String(t || '').toLowerCase().replace(/[äå]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // --- kuvapaikat (hero, tarina, sijainti) ---
    const renderSlot = (el) => {
        const key = el.dataset.slot, s = state.slots[key];
        el.innerHTML = `${s.url ? `<img src="${esc(s.url)}" alt="">` : '<div class="img-empty">Ei kuvaa</div>'}
            <div class="img-actions">
                <label class="btn btn-outline" style="cursor:pointer;">${s.url ? 'Vaihda kuva' : 'Valitse kuva'}<input type="file" accept="image/*" style="display:none;"></label>
                ${s.url ? '<button type="button" class="btn btn-outline" data-rm style="color:#ef4444;border-color:#ef4444;">Poista kuva</button>' : ''}
            </div>`;
        el.querySelector('input[type=file]').addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            s.file = f; s.url = URL.createObjectURL(f); renderSlot(el);
        });
        const rm = el.querySelector('[data-rm]');
        if (rm) rm.addEventListener('click', () => { s.file = null; s.url = ''; renderSlot(el); });
    };
    document.querySelectorAll('.img-slot').forEach(renderSlot);

    // --- tunnusluvut ---
    const renderFacts = () => {
        $('facts-rows').innerHTML = state.facts.map((f, i) => `<div class="row fact">
            <input class="form-input" data-fact="${i}" data-k="value" placeholder="Arvo, esim. 82,5 m²" value="${esc(f.value || '')}">
            <input class="form-input" data-fact="${i}" data-k="label" placeholder="Selite, esim. 4 huonetta ja sauna" value="${esc(f.label || '')}"></div>`).join('');
    };
    $('facts-rows').addEventListener('input', (e) => { const t = e.target; if (t.dataset.fact !== undefined) state.facts[Number(t.dataset.fact)][t.dataset.k] = t.value; });

    // --- ratkaisut ---
    const renderFeatures = () => {
        $('features-rows').innerHTML = state.features.map((f, i) => `<div class="row feature">
            <select class="form-input" data-feat="${i}" data-k="icon">${window.REF_ICON_OPTIONS.replace(`value="${esc(f.icon || 'home')}"`, `value="${esc(f.icon || 'home')}" selected`)}</select>
            <input class="form-input" data-feat="${i}" data-k="title" placeholder="Otsikko" value="${esc(f.title || '')}">
            <textarea class="form-input" data-feat="${i}" data-k="text" rows="2" placeholder="Kuvaus">${esc(f.text || '')}</textarea>
            <button type="button" class="row-del" data-feat-del="${i}" aria-label="Poista rivi">&times;</button></div>`).join('');
        $('features-add').style.display = state.features.length >= 6 ? 'none' : '';
    };
    $('features-rows').addEventListener('input', (e) => { const t = e.target; if (t.dataset.feat !== undefined) state.features[Number(t.dataset.feat)][t.dataset.k] = t.value; });
    $('features-rows').addEventListener('change', (e) => { const t = e.target; if (t.dataset.feat !== undefined) state.features[Number(t.dataset.feat)][t.dataset.k] = t.value; });
    $('features-rows').addEventListener('click', (e) => { const b = e.target.closest('[data-feat-del]'); if (b) { state.features.splice(Number(b.dataset.featDel), 1); renderFeatures(); } });
    $('features-add').addEventListener('click', () => { if (state.features.length < 6) { state.features.push({ icon: 'home', title: '', text: '' }); renderFeatures(); } });

    // --- tiedot ---
    const renderSpecs = () => {
        $('specs-rows').innerHTML = state.specs.map((s, i) => `<div class="row spec">
            <input class="form-input" data-spec="${i}" data-k="label" placeholder="Otsikko, esim. Energialuokka" value="${esc(s.label || '')}">
            <input class="form-input" data-spec="${i}" data-k="value" placeholder="Arvo, esim. A (2018)" value="${esc(s.value || '')}">
            <button type="button" class="row-del" data-spec-del="${i}" aria-label="Poista rivi">&times;</button></div>`).join('');
    };
    $('specs-rows').addEventListener('input', (e) => { const t = e.target; if (t.dataset.spec !== undefined) state.specs[Number(t.dataset.spec)][t.dataset.k] = t.value; });
    $('specs-rows').addEventListener('click', (e) => { const b = e.target.closest('[data-spec-del]'); if (b) { state.specs.splice(Number(b.dataset.specDel), 1); renderSpecs(); } });
    $('specs-add').addEventListener('click', () => { state.specs.push({ label: '', value: '' }); renderSpecs(); });

    // --- galleria ---
    const renderGallery = () => {
        $('gallery-rows').innerHTML = state.gallery.map((g, i) => `<div class="g-item">
            <img src="${esc(g.url)}" alt="">
            <div class="g-fields">
                <input class="form-input" data-gal="${i}" data-k="caption" placeholder="Kuvateksti (näkyy kuvan alla)" value="${esc(g.caption || '')}">
                <input class="form-input" data-gal="${i}" data-k="alt" placeholder="Kuvaus hakukoneille ja ruudunlukijoille (alt)" value="${esc(g.alt || '')}">
            </div>
            <div class="g-btns">
                <button type="button" data-gal-act="up" data-i="${i}" aria-label="Ylös">&#x25B2;</button>
                <button type="button" data-gal-act="down" data-i="${i}" aria-label="Alas">&#x25BC;</button>
                <button type="button" data-gal-act="del" data-i="${i}" style="color:#ef4444;" aria-label="Poista">&times;</button>
            </div></div>`).join('') || '<p class="hint">Ei kuvia vielä.</p>';
    };
    $('gallery-rows').addEventListener('input', (e) => { const t = e.target; if (t.dataset.gal !== undefined) state.gallery[Number(t.dataset.gal)][t.dataset.k] = t.value; });
    $('gallery-rows').addEventListener('click', (e) => {
        const b = e.target.closest('[data-gal-act]');
        if (!b) return;
        const i = Number(b.dataset.i), a = b.dataset.galAct, g = state.gallery;
        if (a === 'up' && i > 0) [g[i - 1], g[i]] = [g[i], g[i - 1]];
        if (a === 'down' && i < g.length - 1) [g[i + 1], g[i]] = [g[i], g[i + 1]];
        if (a === 'del') g.splice(i, 1);
        renderGallery();
    });
    $('gallery-add').addEventListener('change', (e) => {
        Array.from(e.target.files).forEach((f) => state.gallery.push({ url: URL.createObjectURL(f), file: f, alt: '', caption: '' }));
        e.target.value = '';
        renderGallery();
    });

    // --- kentät ---
    const F = { title: 'f-title', slug: 'f-slug', location: 'f-location', year: 'f-year', tagline: 'f-tagline', summary: 'f-summary', meta_description: 'f-meta',
        related_project_slug: 'f-related', story_title: 'f-story-title', story_text: 'f-story-text', quote_text: 'f-quote', quote_author: 'f-quote-author',
        location_title: 'f-loc-title', location_text: 'f-loc-text' };
    $('f-slug').addEventListener('input', () => { state.slugTouched = true; });
    $('f-title').addEventListener('input', () => { if (!state.slugTouched && !refId) $('f-slug').value = slugify($('f-title').value); });

    // myytävien kohteiden polkutunnisteet ehdotuksiksi
    sb.from('projects').select('slug,title').then(({ data }) => {
        $('projects-list').innerHTML = (data || []).map((p) => `<option value="${esc(p.slug)}">${esc(p.title)}</option>`).join('');
    });

    // --- lataus ---
    if (refId) {
        const { data, error } = await sb.from('reference_cases').select('*').eq('id', refId).maybeSingle();
        if (error || !data) { setStatus('Referenssiä ei löytynyt: ' + (error ? error.message : ''), true); }
        else {
            $('ref-page-title').textContent = 'Muokkaa: ' + data.title;
            Object.entries(F).forEach(([k, id]) => { $(id).value = data[k] || ''; });
            $('f-order').value = data.sort_order || 0;
            $('f-published').checked = !!data.published;
            ['hero_image', 'story_image', 'location_image'].forEach((k) => { state.slots[k].url = data[k] || ''; });
            state.facts = [0, 1, 2, 3].map((i) => (data.facts && data.facts[i]) || {});
            state.features = Array.isArray(data.features) ? data.features : [];
            state.specs = Array.isArray(data.specs) ? data.specs : [];
            state.gallery = (Array.isArray(data.gallery) ? data.gallery : []).map((g) => ({ url: g.url, alt: g.alt || '', caption: g.caption || '', file: null }));
            state.slugTouched = true;
        }
    } else {
        state.specs = ['Kohde', 'Talotyyppi', 'Asuinpinta-ala', 'Energialuokka', 'Rakennusvuosi'].map((l) => ({ label: l, value: '' }));
    }
    document.querySelectorAll('.img-slot').forEach(renderSlot);
    renderFacts(); renderFeatures(); renderSpecs(); renderGallery();

    // --- kuvien pienennys ja lataus ---
    async function toBlob(file, maxDim) {
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
        const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Kuvan käsittely epäonnistui'))), 'image/jpeg', 0.82));
    }
    async function upload(file, slug, maxDim) {
        const blob = await toBlob(file, maxDim);
        const path = `references/${slug}/${Math.random().toString(36).slice(2)}_${Date.now()}.jpg`;
        const { error } = await sb.storage.from('images').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw new Error('Kuvan lataus epäonnistui: ' + error.message);
        return sb.storage.from('images').getPublicUrl(path).data.publicUrl;
    }

    // --- tallennus ---
    async function save() {
        const title = $('f-title').value.trim();
        if (!title) { setStatus('Otsikko puuttuu.', true); $('f-title').focus(); return null; }
        let slug = slugify($('f-slug').value) || slugify(title);
        $('f-slug').value = slug;
        const saveBtn = $('ref-save'), prevBtn = $('ref-preview');
        saveBtn.disabled = prevBtn.disabled = true;
        try {
            let n = 0;
            const total = Object.values(state.slots).filter((s) => s.file).length + state.gallery.filter((g) => g.file).length;
            const prog = () => setStatus(`Ladataan kuvia ${++n}/${total}...`);
            for (const [key, s] of Object.entries(state.slots)) {
                if (s.file) { prog(); s.url = await upload(s.file, slug, key === 'hero_image' ? 2000 : 1800); s.file = null; }
            }
            for (const g of state.gallery) {
                if (g.file) { prog(); g.url = await upload(g.file, slug, 1800); g.file = null; }
            }
            setStatus('Tallennetaan...');
            const payload = {
                slug, title,
                location: $('f-location').value.trim() || null, year: $('f-year').value.trim() || null,
                tagline: $('f-tagline').value.trim() || null, summary: $('f-summary').value.trim() || null, meta_description: $('f-meta').value.trim() || null,
                related_project_slug: $('f-related').value.trim() || null,
                story_title: $('f-story-title').value.trim() || null, story_text: $('f-story-text').value.trim() || null,
                quote_text: $('f-quote').value.trim() || null, quote_author: $('f-quote-author').value.trim() || null,
                location_title: $('f-loc-title').value.trim() || null, location_text: $('f-loc-text').value.trim() || null,
                hero_image: state.slots.hero_image.url || null, story_image: state.slots.story_image.url || null, location_image: state.slots.location_image.url || null,
                facts: state.facts.filter((f) => (f.value || '').trim() || (f.label || '').trim()).map((f) => ({ value: (f.value || '').trim(), label: (f.label || '').trim() })),
                features: state.features.filter((f) => (f.title || '').trim() || (f.text || '').trim()).slice(0, 6).map((f) => ({ icon: f.icon || 'home', title: (f.title || '').trim(), text: (f.text || '').trim() })),
                specs: state.specs.filter((s) => (s.label || '').trim() && (s.value || '').trim()).map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
                gallery: state.gallery.filter((g) => g.url).map((g) => ({ url: g.url, alt: (g.alt || '').trim(), caption: (g.caption || '').trim() })),
                published: $('f-published').checked, sort_order: parseInt($('f-order').value, 10) || 0
            };
            let res;
            if (refId) res = await sb.from('reference_cases').update(payload).eq('id', refId).select('id').maybeSingle();
            else res = await sb.from('reference_cases').insert([payload]).select('id').maybeSingle();
            if (res.error) throw new Error(res.error.code === '23505' ? 'Polkutunniste on jo käytössä. Vaihda se toiseksi.' : res.error.message);
            if (!refId && res.data) { refId = res.data.id; history.replaceState({}, '', 'edit-reference.html?id=' + encodeURIComponent(refId)); }
            $('ref-page-title').textContent = 'Muokkaa: ' + title;
            renderGallery(); document.querySelectorAll('.img-slot').forEach(renderSlot);
            setStatus('Tallennettu ' + new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }));
            return slug;
        } catch (err) {
            console.error(err);
            setStatus(err.message, true);
            return null;
        } finally {
            saveBtn.disabled = prevBtn.disabled = false;
        }
    }

    form.addEventListener('submit', async (e) => { e.preventDefault(); const s = await save(); if (s) window.location.href = 'references.html'; });
    $('ref-preview').addEventListener('click', async () => {
        const w = window.open('about:blank', '_blank');
        const s = await save();
        if (s && w) w.location.href = '../referenssi.html?r=' + encodeURIComponent(s); else if (w) w.close();
    });
});

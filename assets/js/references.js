// assets/js/references.js
// Referenssien julkinen renderöinti: lista (referenssit.html) ja yksittäinen referenssi (referenssi.html?r=<slug>).
// Data: taulu reference_cases (Supabase). Kaikki referenssit käyttävät samaa sivupohjaa; sisältö tulee ylläpidosta.
// Käyttää main.js:n globaaleja SUPABASE_URL / SUPABASE_ANON_KEY (ympäristö valitaan siellä osoitteen mukaan).
(function () {
    'use strict';

    const SITE = 'https://www.valttikodit.fi';

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // Sallitaan vain http(s)-osoitteet ja repon suhteelliset polut
    const safeUrl = (u) => {
        const s = String(u || '').trim();
        return /^(https?:\/\/|\/?assets\/|\.\.\/assets\/)/i.test(s) ? s.replace(/^\.\.\//, '') : '';
    };
    const paragraphs = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    const arr = (v) => (Array.isArray(v) ? v : []);

    const ICONS = {
        sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
        layout: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M9 21V9"></path>',
        home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
        euro: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
        access: '<circle cx="12" cy="5" r="2"></circle><path d="M12 7v6m-4-3h8m-6 11l2-8 2 8"></path>',
        pin: '<path d="M12 22c4-3 7-6.5 7-11a7 7 0 0 0-14 0c0 4.5 3 8 7 11z"></path><circle cx="12" cy="11" r="2.5"></circle>',
        leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16"></path><path d="M2 21c2-4 5-7 9-9"></path>',
        key: '<circle cx="8" cy="15" r="4"></circle><path d="M10.8 12.2L20 3m-3 3l3 3m-5-1l2 2"></path>',
        shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"></path>',
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"></path>'
    };
    const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    // Yhteinen prosessiosio (sama kaikille referensseille, Valtti-tapa)
    const PROCESS = [
        ['Toimitussisällön valinta', 'Käydään yhdessä läpi tilaratkaisut, sisustusvalinnat ja toimitussisältö. Asiakas on mukana päättämässä jo alussa.'],
        ['Sopimus ja työmaan käynnistys', 'Sopimuksen teko, tonttisopimus kunnan kanssa ja työmaan aloitus suunnitellaan huolella.'],
        ['Rakennusvaihe', 'Seurantapalaverit sekä katselmukset rakennuksen eri vaiheissa, ennen lattian valua ja sisustusvaiheessa. Tiedät aina missä mennään.'],
        ['Käyttöönotto ja muutto', 'Käyttöönottokatselmus ja avainten luovutus. Sen jälkeen huoltokatselmus 1 kk ja takuukatselmus 1 vuoden kohdalla.']
    ];

    // <img> srcsetillä jos kuva noudattaa nimeämistä "...-1600.jpg" (vastaava "-800.jpg" on olemassa)
    function img(url, alt, opts) {
        opts = opts || {};
        const u = safeUrl(url);
        if (!u) return '';
        let srcset = '';
        const m = u.match(/-(1600|2000)\.jpg$/i);
        if (m) srcset = ` srcset="${esc(u.replace(/-(1600|2000)\.jpg$/i, '-800.jpg'))} 800w, ${esc(u)} ${m[1]}w" sizes="${esc(opts.sizes || '(max-width: 768px) 100vw, 1100px')}"`;
        return `<img src="${esc(u)}"${srcset} alt="${esc(alt || '')}" width="${opts.w || 1600}" height="${opts.h || 1066}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async">`;
    }

    function getClient() {
        if (!window.supabase || typeof SUPABASE_URL === 'undefined') return null;
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    const detailUrl = (slug) => `referenssi.html?r=${encodeURIComponent(slug)}`;

    function card(ref, featured) {
        const image = safeUrl(ref.hero_image);
        const meta = [ref.location, ref.year].filter(Boolean).map(esc).join(' · ');
        return `<a class="ref-card${featured ? ' ref-card--featured' : ''}" href="${detailUrl(ref.slug)}" data-aos="fade-up">
            <div class="ref-card-img">${image ? img(ref.hero_image, ref.title, { sizes: featured ? '(max-width: 768px) 100vw, 650px' : '(max-width: 768px) 100vw, 380px' }): ''}</div>
            <div class="ref-card-body">
                <span class="eyebrow">${meta || 'Referenssi'}</span>
                <h3>${esc(ref.title)}</h3>
                ${ref.summary ? `<p>${esc(ref.summary)}</p>` : ''}
                <span class="ref-card-link">Lue referenssitarina <span aria-hidden="true">&rarr;</span></span>
            </div>
        </a>`;
    }

    // ---------- LISTASIVU ----------
    async function renderList(root) {
        const sb = getClient();
        if (!sb) { root.innerHTML = '<p class="ref-empty">Sisältöä ei voitu ladata.</p>'; return; }
        const { data, error } = await sb.from('reference_cases')
            .select('id,slug,title,location,year,summary,hero_image,published,sort_order,created_at')
            .order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        if (error) { console.error(error); root.innerHTML = '<p class="ref-empty">Referenssien lataus epäonnistui. Yritä hetken kuluttua uudelleen.</p>'; return; }
        const refs = arr(data);
        if (!refs.length) { root.innerHTML = '<p class="ref-empty">Referenssejä lisätään pian. Tutustu sillä välin <a href="/kohteet" style="display:inline;text-decoration:underline;">myytäviin kohteisiimme</a>.</p>'; return; }
        const [first, ...rest] = refs;
        root.innerHTML = card(first, true) + (rest.length ? `<div class="ref-grid">${rest.map((r) => card(r, false)).join('')}</div>` : '');
        if (window.AOS) setTimeout(() => (window.AOS.refreshHard || window.AOS.refresh)(), 50);
    }

    // ---------- YKSITTÄINEN REFERENSSI ----------
    function setMeta(attr, key, content) {
        let el = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
        el.setAttribute('content', content);
    }

    function applySeo(ref) {
        const title = `${ref.title}${ref.location ? ', ' + ref.location : ''} | Referenssi | Valttikodit`;
        const desc = (ref.meta_description || ref.tagline || ref.summary || '').slice(0, 300);
        const pageUrl = `${SITE}/referenssi.html?r=${encodeURIComponent(ref.slug)}`;
        const hero = safeUrl(ref.hero_image);
        const heroAbs = hero ? (/^https?:/i.test(hero) ? hero : `${SITE}/${hero.replace(/^\//, '')}`) : '';
        document.title = title;
        if (desc) { setMeta('name', 'description', desc); setMeta('property', 'og:description', desc); }
        setMeta('property', 'og:title', title);
        setMeta('property', 'og:type', 'article');
        setMeta('property', 'og:url', pageUrl);
        if (heroAbs) setMeta('property', 'og:image', heroAbs);
        let canonical = document.head.querySelector('link[rel="canonical"]');
        if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
        canonical.href = pageUrl;
        const ld = {
            '@context': 'https://schema.org', '@type': 'Article', headline: ref.title, description: desc, inLanguage: 'fi',
            mainEntityOfPage: pageUrl, author: { '@type': 'Organization', name: 'Valttikodit Oy' },
            publisher: { '@type': 'Organization', name: 'Valttikodit Oy', url: SITE + '/' }
        };
        if (heroAbs) ld.image = [heroAbs];
        const s = document.createElement('script');
        s.type = 'application/ld+json';
        s.textContent = JSON.stringify(ld);
        document.head.appendChild(s);
    }

    function detailHtml(ref, others) {
        const facts = arr(ref.facts).filter((f) => f && (f.value || f.label)).slice(0, 4);
        const gallery = arr(ref.gallery).filter((g) => g && safeUrl(g.url));
        const features = arr(ref.features).filter((f) => f && (f.title || f.text)).slice(0, 6);
        const specs = arr(ref.specs).filter((s) => s && s.label);
        const meta = [ref.location, ref.year].filter(Boolean).map(esc).join(' · ');
        const hero = safeUrl(ref.hero_image);
        const out = [];

        // 1. Hero
        out.push(`<section class="ref-hero" style="${hero ? `background-image: linear-gradient(rgba(10,10,10,0.55), rgba(10,10,10,0.35)), url('${esc(hero)}');` : ''}">
            <div class="container" data-aos="fade-up"><div class="ref-hero-inner">
                <span class="eyebrow eyebrow--light">Referenssi${meta ? ' · ' + meta : ''}</span>
                <h1>${esc(ref.title)}</h1>
                ${ref.tagline ? `<p class="ref-hero-lead">${esc(ref.tagline)}</p>` : ''}
                <div class="cta-actions" style="justify-content: flex-start;">
                    <a href="#yhteys" class="btn btn-light">Haluan oman Valttikodin</a>
                    ${ref.story_text ? '<a href="#tarina" class="btn btn-ghost-light">Lue tarina</a>' : ''}
                </div>
            </div></div>
        </section>`);

        // 2. Luvut
        if (facts.length) {
            out.push(`<section class="ref-facts"><div class="container"><div class="stats" data-aos="fade-up">
                ${facts.map((f) => `<div class="stat"><strong>${esc(f.value)}</strong><span>${esc(f.label)}</span></div>`).join('')}
            </div></div></section>`);
        }

        // 3. Tarina
        if (ref.story_text || ref.story_title) {
            out.push(`<section class="section" id="tarina"><div class="container grid-split" style="align-items: center;">
                <div class="prose" data-aos="fade-up">
                    <span class="eyebrow">Lähtökohta</span>
                    ${ref.story_title ? `<h2>${esc(ref.story_title)}</h2>` : ''}
                    ${paragraphs(ref.story_text)}
                </div>
                ${safeUrl(ref.story_image) ? `<figure class="gal-item" data-aos="fade-up" data-aos-delay="150" style="margin: 0;">${img(ref.story_image, ref.title)}</figure>` : ''}
            </div></section>`);
        }

        // 4. Lainaus
        if (ref.quote_text) {
            out.push(`<section class="section section--white"><div class="container" style="max-width: 820px; text-align: center;" data-aos="fade-up">
                <blockquote class="ref-quote">"${esc(ref.quote_text)}"</blockquote>
                ${ref.quote_author ? `<div style="font-weight: 600; color: var(--text-muted);">${esc(ref.quote_author)}</div>` : ''}
            </div></section>`);
        }

        // 5. Galleria
        if (gallery.length) {
            out.push(`<section class="section"><div class="container">
                <div class="section-head" data-aos="fade-up"><span class="eyebrow">Kodin sisällä</span><h2>Näin valmis koti näyttää</h2><p>Oikeita kuvia valmistuneesta kohteesta. Napauta kuvaa nähdäksesi sen isompana.</p></div>
                <div class="gal-grid">
                ${gallery.map((g) => `<figure class="gal-item" data-aos="fade-up">
                    <button type="button" class="gal-open" data-full="${esc(safeUrl(g.url))}" data-alt="${esc(g.alt || g.caption || ref.title)}" aria-label="Suurenna kuva: ${esc(g.alt || g.caption || '')}">
                        ${img(g.url, g.alt || g.caption, { sizes: '(max-width: 768px) 50vw, 360px' })}
                    </button>
                    ${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}
                </figure>`).join('')}
                </div></div></section>`);
        }

        // 6. Ratkaisut
        if (features.length) {
            out.push(`<section class="section section--alt"><div class="container">
                <div class="section-head" data-aos="fade-up"><span class="eyebrow">Miksi se toimii</span><h2>Ratkaisut, jotka tekevät arjesta sujuvaa</h2><p>Jokainen valinta on tehty yhden kysymyksen kautta: miten tämä helpottaa asukkaan arkea?</p></div>
                <div class="grid-3">
                ${features.map((f, i) => `<div class="feature" data-aos="fade-up" data-aos-delay="${(i % 3) * 100}">
                    <div class="icon-circle"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[f.icon] || ICONS.home}</svg></div>
                    <h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`).join('')}
                </div></div></section>`);
        }

        // 7. Prosessi (yhteinen)
        out.push(`<section class="section"><div class="container">
            <div class="section-head" data-aos="fade-up"><span class="eyebrow">Näin toimimme</span><h2>Asiakas mukana jokaisessa vaiheessa</h2><p>Avoimuus ja selkeä viestintä koko rakennusprojektin ajan. Tiedät aina missä mennään, ja takuu- ja huoltokatselmukset kuuluvat asiaan.</p></div>
            <div class="steps" style="padding-top: 1rem;">
            ${PROCESS.map((p, i) => `<div class="step" data-aos="fade-up" data-aos-delay="${i * 100}"><div class="step-num">${i + 1}</div><h3>${esc(p[0])}</h3><p>${esc(p[1])}</p></div>`).join('')}
            </div></div></section>`);

        // 8. Sijainti
        if (ref.location_text || ref.location_title) {
            out.push(`<section class="section section--white"><div class="container grid-split" style="align-items: center;">
                ${safeUrl(ref.location_image) ? `<figure class="gal-item" data-aos="fade-up" style="margin: 0;">${img(ref.location_image, ref.location_title || ref.title, { sizes: '(max-width: 768px) 100vw, 550px' })}</figure>` : ''}
                <div class="prose" data-aos="fade-up" data-aos-delay="150">
                    <span class="eyebrow">Sijainti</span>
                    ${ref.location_title ? `<h2>${esc(ref.location_title)}</h2>` : ''}
                    ${paragraphs(ref.location_text)}
                </div>
            </div></section>`);
        }

        // 9. Tiedot
        if (specs.length) {
            out.push(`<section class="section"><div class="container" style="max-width: 900px;">
                <div class="section-head" data-aos="fade-up"><span class="eyebrow">Tiedot</span><h2>Kohteen tiedot lyhyesti</h2></div>
                <dl class="spec-list" data-aos="fade-up">${specs.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>
                ${ref.related_project_slug ? `<p style="text-align:center;margin-top:1.5rem;"><a href="kohde.html?kohde=${encodeURIComponent(ref.related_project_slug)}" class="btn btn-outline">Katso kohteen alkuperäinen esittely</a></p>` : ''}
            </div></section>`);
        }

        // 10. Muut referenssit
        if (others.length) {
            out.push(`<section class="section section--alt"><div class="container">
                <div class="section-head" data-aos="fade-up"><span class="eyebrow">Lisää referenssejä</span><h2>Tutustu myös näihin</h2></div>
                <div class="ref-grid">${others.map((r) => card(r, false)).join('')}</div>
                <p style="text-align:center;margin-top:2rem;"><a href="/referenssit" class="btn btn-outline">Kaikki referenssit</a></p>
            </div></section>`);
        }

        // 11. CTA + lomake
        out.push(`<section class="cta-band cta-band--form" id="yhteys"><div class="container grid-form" style="align-items: start; text-align: left;">
            <div data-aos="fade-up">
                <span class="eyebrow eyebrow--light">Seuraava koti voi olla sinun</span>
                <h2>Rakennetaan sinulle yhtä sujuva arki</h2>
                <p style="margin-left: 0;">Tutustu myytäviin kohteisiimme tai kerro, millaista kotia etsit. Lupaamme rennon jutteluhetken asiantuntijan kanssa, ilman velvoitteita.</p>
                <ul class="ref-bullets">
                    <li>${CHECK}<span>Selkeä hinta, ei piilokuluja</span></li>
                    <li>${CHECK}<span>Voit vaikuttaa materiaaleihin ajoissa mukana ollessasi</span></li>
                    <li>${CHECK}<span>Maksuton 2 viikon varausaika kohteelle</span></li>
                </ul>
                <div class="cta-actions" style="justify-content: flex-start; margin-top: 2rem;"><a href="/kohteet" class="btn btn-ghost-light">Katso myytävät kohteet</a></div>
            </div>
            <div class="form-card form-card--dark" data-aos="fade-up" data-aos-delay="150">
                <h3 style="margin-bottom: 1.25rem;">Ota yhteyttä</h3>
                <form action="https://api.web3forms.com/submit" method="POST" id="contact-form">
                    <input type="hidden" name="access_key" value="fa637672-a5ba-4717-8464-d1d29719c87b">
                    <input type="hidden" name="source" value="${esc('Referenssit-sivu (' + ref.title + ')')}">
                    <input type="hidden" name="subject" value="Uusi yhteydenotto Referenssit-sivulta">
                    <input type="hidden" name="redirect" value="https://www.valttikodit.fi/kiitos.html">
                    <div class="form-group"><label for="name" class="form-label">Nimi *</label><input type="text" id="name" name="name" class="form-input" required placeholder="Etu- ja sukunimi" autocomplete="name"></div>
                    <div class="form-row">
                        <div class="form-group"><label for="email" class="form-label">Sähköposti *</label><input type="email" id="email" name="email" class="form-input" required placeholder="matti@esimerkki.fi" autocomplete="email"></div>
                        <div class="form-group"><label for="phone" class="form-label">Puhelin</label><input type="tel" id="phone" name="phone" class="form-input" placeholder="040 123 4567" autocomplete="tel"></div>
                    </div>
                    <div class="form-group"><label for="message" class="form-label">Mitä haluaisit kuulla?</label><textarea id="message" name="message" class="form-input" rows="3" placeholder="Esim. millaista kotia etsit tai mistä kohteesta olet kiinnostunut"></textarea></div>
                    <input type="checkbox" name="botcheck" class="d-none" style="display: none;">
                    <button type="submit" class="btn btn-light" style="width: 100%;">Lähetä viesti</button>
                    <p class="form-note" style="color: rgba(255,255,255,0.7);">Lähettämällä lomakkeen hyväksyt tietosuojaselosteemme.</p>
                </form>
            </div>
        </div></section>`);
        return out.join('\n');
    }

    function initInteractions() {
        const items = Array.prototype.slice.call(document.querySelectorAll('.gal-open'));
        const dlg = document.getElementById('lightbox'), im = document.getElementById('lbImg');
        let cur = 0;
        if (dlg && items.length) {
            const show = (i) => { cur = (i + items.length) % items.length; im.src = items[cur].getAttribute('data-full'); im.alt = items[cur].getAttribute('data-alt') || ''; };
            items.forEach((b, i) => b.addEventListener('click', () => { show(i); if (dlg.showModal) dlg.showModal(); }));
            dlg.querySelector('.lb-close').addEventListener('click', () => dlg.close());
            dlg.querySelector('.lb-prev').addEventListener('click', () => show(cur - 1));
            dlg.querySelector('.lb-next').addEventListener('click', () => show(cur + 1));
            dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
            document.addEventListener('keydown', (e) => { if (!dlg.open) return; if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
        }
        // Mobiilin toimintapalkki: näytetään kun hero on ohitettu, piilotetaan lomakkeen kohdalla
        const bar = document.getElementById('stickyCta'), hero = document.querySelector('.ref-hero'), form = document.getElementById('yhteys');
        if (bar && hero && form && 'IntersectionObserver' in window) {
            let heroOut = false, formIn = false;
            const upd = () => { const on = heroOut && !formIn; bar.classList.toggle('show', on); bar.setAttribute('aria-hidden', on ? 'false' : 'true'); };
            new IntersectionObserver((e) => { heroOut = !e[0].isIntersecting; upd(); }).observe(hero);
            new IntersectionObserver((e) => { formIn = e[0].isIntersecting; upd(); }, { threshold: 0.15 }).observe(form);
        }
        if (window.AOS) setTimeout(() => (window.AOS.refreshHard || window.AOS.refresh)(), 100);
    }

    async function renderDetail(root) {
        const slug = new URLSearchParams(window.location.search).get('r');
        const sb = getClient();
        if (!sb || !slug) { root.innerHTML = notFound(); return; }
        const { data: ref, error } = await sb.from('reference_cases').select('*').eq('slug', slug).maybeSingle();
        if (error) console.error(error);
        if (!ref) { root.innerHTML = notFound(); return; }
        const { data: others } = await sb.from('reference_cases').select('id,slug,title,location,year,summary,hero_image,sort_order,created_at')
            .eq('published', true).neq('slug', slug).order('sort_order', { ascending: true }).order('created_at', { ascending: false }).limit(3);
        applySeo(ref);
        const preview = ref.published ? '' : '<div class="dev-banner" style="position:sticky;top:0;z-index:950;">ESIKATSELU – tämä referenssi ei ole vielä julkaistu, ja vain ylläpitäjä näkee sen.</div>';
        root.innerHTML = preview + detailHtml(ref, arr(others));
        initInteractions();
    }

    function notFound() {
        return `<section class="page-intro"><div class="container" style="max-width:700px;"><span class="eyebrow">Referenssit</span><h1 style="margin-bottom:1rem;">Referenssiä ei löytynyt</h1>
            <p class="lead">Sivua ei löytynyt tai sitä ei ole vielä julkaistu.</p>
            <p style="margin-top:2rem;"><a href="/referenssit" class="btn btn-primary">Kaikki referenssit</a></p></div></section>`;
    }

    function start() {
        const list = document.getElementById('ref-list');
        const detail = document.getElementById('ref-detail');
        if (list) renderList(list);
        if (detail) renderDetail(detail);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// assets/js/main.js
const SUPABASE_URL = 'https://xbeonksexpjvekqjxoph.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn';

document.addEventListener('DOMContentLoaded', async () => {
    let supabase = null;
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // EVÄSTEHALLINTA JA ANALYTIIKKA
    if (typeof supabase !== 'undefined') {
        const CONSENT_KEY = 'valttikodit_cookie_consent';
        let consent = null;
        try {
            consent = JSON.parse(localStorage.getItem(CONSENT_KEY));
        } catch(e) {}

        let cleanPath = window.location.pathname;
        if (cleanPath === '' || cleanPath === '/') cleanPath = '/index.html';
        
        // 1. Sessiotunniste (Vain jos analytiikka on sallittu)
        let sessionId = null;
        if (consent && consent.analytics) {
            sessionId = sessionStorage.getItem('v_session');
            if (!sessionId) {
                sessionId = Math.random().toString(36).substring(2, 15);
                sessionStorage.setItem('v_session', sessionId);
            }
        }

        // 2. Laitetyyppi karkeasti ruudun koon perusteella
        let device = 'Desktop';
        if (window.innerWidth < 768) device = 'Mobiili';
        else if (window.innerWidth < 1024) device = 'Tabletti';

        // 3. Referrer (vain ulkoiset)
        let ref = document.referrer;
        if (ref && ref.includes(window.location.host)) {
            ref = 'Sisäinen';
        } else if (!ref) {
            ref = 'Suora';
        }

        try {
            await supabase.from('page_views').insert([{ 
                path: cleanPath,
                session_id: sessionId,
                device_type: device,
                referrer: ref
            }]);
        } catch(e) {
            console.error("Pageview log failed:", e);
        }

        // --- COOKIE BANNER UI INJECTION ---
        if (!consent) {
            // Luo tyylit suoraan JS:stä raskaiden CSS latausten välttämiseksi
            const style = document.createElement('style');
            style.innerHTML = `
                .cookie-consent-overlay { position: fixed; bottom: 1.5rem; left: 1.5rem; max-width: 400px; width: calc(100% - 3rem); background: #ffffff; padding: 1.5rem; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); z-index: 99999; border: 1px solid #e5e7eb; font-family: 'Inter', sans-serif; opacity: 0; transform: translateY(20px); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .cookie-consent-overlay.show { opacity: 1; transform: translateY(0); }
                .cookie-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; color: #111827; }
                .cookie-text { font-size: 0.875rem; color: #4b5563; margin-bottom: 1rem; line-height: 1.5; }
                .cookie-buttons { display: flex; flex-direction: column; gap: 0.5rem; }
                .cookie-btn { padding: 0.625rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; text-align: center; border: none; }
                .cookie-btn-primary { background: #121212; color: #fff; }
                .cookie-btn-primary:hover { background: #333; transform: scale(1.02); }
                .cookie-btn-secondary { background: transparent; color: #4b5563; border: 1px solid #d1d5db; }
                .cookie-btn-secondary:hover { background: #f3f4f6; }
                .cookie-link { color: #6b7280; text-decoration: underline; font-size: 0.75rem; text-align: center; margin-top: 0.5rem; cursor: pointer; }
                
                .cookie-settings-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 450px; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); z-index: 100000; display: none; font-family: 'Inter', sans-serif;}
                .cookie-settings-modal.show { display: block; }
                .ck-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.3); backdrop-filter: blur(2px); z-index: 99998; display: none; }
                .ck-backdrop.show { display: block; }
                .ck-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb; }
                .ck-row:last-of-type { border-bottom: none; }
                
                /* Toggles */
                .ck-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
                .ck-switch input { opacity: 0; width: 0; height: 0; }
                .ck-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
                .ck-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                .ck-switch input:checked + .ck-slider { background-color: #10b981; }
                .ck-switch input:disabled + .ck-slider { opacity: 0.5; cursor: not-allowed; }
                .ck-switch input:checked + .ck-slider:before { transform: translateX(20px); }
                
                @media (max-width: 600px) {
                    .cookie-consent-overlay { bottom: 0; left: 0; max-width: 100%; width: 100%; border-radius: 12px 12px 0 0; }
                }
            `;
            document.head.appendChild(style);

            const banner = document.createElement('div');
            banner.className = 'cookie-consent-overlay';
            banner.innerHTML = `
                <div class="cookie-title">Kotivierailu evästeillä 🏡</div>
                <div class="cookie-text">
                    Käytämme evästeitä varmistaaksemme salamannopean sivuston ja tarjotaksemme kohdennettua palvelua juuri sinulle. Hyväksymällä autat meitä rakentamaan parempia koteja. Valinta on täysin sinun!
                </div>
                <div class="cookie-buttons">
                    <button class="cookie-btn cookie-btn-primary" id="btn-accept-all">Salli kaikki</button>
                    <button class="cookie-btn cookie-btn-secondary" id="btn-accept-necessary">Vain välttämättömät</button>
                    <div class="cookie-link" id="btn-cookie-settings">Hallitse asetuksia &rsaquo;</div>
                </div>
            `;
            document.body.appendChild(banner);

            const backdrop = document.createElement('div');
            backdrop.className = 'ck-backdrop';
            
            const modal = document.createElement('div');
            modal.className = 'cookie-settings-modal';
            modal.innerHTML = `
                <h3 style="margin-top:0; font-size:1.25rem;">Evästeasetukset</h3>
                <p style="font-size:0.875rem; color:#4b5563; margin-bottom:1.5rem;">Välttämättömät evästeet vaaditaan sivuston perustoiminnallisuuteen. Voit hallita muita asetuksia alta.</p>
                
                <div class="ck-row">
                    <div>
                        <strong>Välttämättömät</strong>
                        <div style="font-size:0.75rem; color:#6b7280;">Sivuston perustoimintaan</div>
                    </div>
                    <label class="ck-switch">
                        <input type="checkbox" checked disabled>
                        <span class="ck-slider"></span>
                    </label>
                </div>
                <div class="ck-row">
                    <div>
                        <strong>Analytiikka</strong>
                        <div style="font-size:0.75rem; color:#6b7280;">Auttaa meitä kehittämään sivustoa</div>
                    </div>
                    <label class="ck-switch">
                        <input type="checkbox" id="toggle-analytics" checked>
                        <span class="ck-slider"></span>
                    </label>
                </div>
                <div class="ck-row">
                    <div>
                        <strong>Markkinointi</strong>
                        <div style="font-size:0.75rem; color:#6b7280;">Sosiaalisen median kohdennuksiin</div>
                    </div>
                    <label class="ck-switch">
                        <input type="checkbox" id="toggle-marketing">
                        <span class="ck-slider"></span>
                    </label>
                </div>
                
                <button class="cookie-btn cookie-btn-primary" style="width:100%; margin-top:1rem;" id="btn-save-settings">Tallenna valinnat</button>
            `;
            
            document.body.appendChild(backdrop);
            document.body.appendChild(modal);

            // Animate banner in
            setTimeout(() => banner.classList.add('show'), 1000);

            const saveConsent = (data) => {
                localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
                banner.classList.remove('show');
                backdrop.classList.remove('show');
                modal.classList.remove('show');
                // Ei refreshata, koska sivulataus ehti jo tallentua, mutta jatkossa sessionTracker herää.
            };

            document.getElementById('btn-accept-all').onclick = () => saveConsent({ necessary: true, analytics: true, marketing: true });
            document.getElementById('btn-accept-necessary').onclick = () => saveConsent({ necessary: true, analytics: false, marketing: false });
            
            document.getElementById('btn-cookie-settings').onclick = () => {
                backdrop.classList.add('show');
                modal.classList.add('show');
            };

            document.getElementById('btn-save-settings').onclick = () => {
                saveConsent({
                    necessary: true,
                    analytics: document.getElementById('toggle-analytics').checked,
                    marketing: document.getElementById('toggle-marketing').checked
                });
            };
            
            backdrop.onclick = () => {
                backdrop.classList.remove('show');
                modal.classList.remove('show');
            };
            // Footer link injection for re-opening settings
            const injectSettingsLink = () => {
                const tsLink = document.querySelector('a[href="tietosuojaseloste.html"]');
                if (tsLink && !document.getElementById('footer-cookie-settings')) {
                    const span = document.createElement('span');
                    span.innerHTML = ' | <a href="#" id="footer-cookie-settings" style="text-decoration: underline; color: inherit;">Evästeasetukset</a>';
                    tsLink.parentNode.insertBefore(span, tsLink.nextSibling);
                    
                    document.getElementById('footer-cookie-settings').onclick = (e) => {
                        e.preventDefault();
                        if (consent) {
                            document.getElementById('toggle-analytics').checked = consent.analytics;
                            document.getElementById('toggle-marketing').checked = consent.marketing;
                        }
                        backdrop.classList.add('show');
                        modal.classList.add('show');
                    };
                }
            };
            injectSettingsLink();

        } else {
            // IF ALREADY CONSENTED, STILL INJECT SETTINGS LINK AND MODAL TO DOM SO THEY CAN CHANGE IT
            // (We need to inject the modal html if it doesn't exist, to let them change settings later)
            // To save space, we just let the previous code block handle the first time UI,
            // but for already consented users we must provide the same modal.
            
            const style = document.createElement('style');
            style.innerHTML = `
                .cookie-settings-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 450px; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); z-index: 100000; display: none; font-family: 'Inter', sans-serif;}
                .cookie-settings-modal.show { display: block; }
                .ck-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.3); backdrop-filter: blur(2px); z-index: 99998; display: none; }
                .ck-backdrop.show { display: block; }
                .ck-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb; }
                .ck-row:last-of-type { border-bottom: none; }
                .ck-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
                .ck-switch input { opacity: 0; width: 0; height: 0; }
                .ck-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
                .ck-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                .ck-switch input:checked + .ck-slider { background-color: #10b981; }
                .ck-switch input:disabled + .ck-slider { opacity: 0.5; cursor: not-allowed; }
                .ck-switch input:checked + .ck-slider:before { transform: translateX(20px); }
                .cookie-btn { padding: 0.625rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; text-align: center; border: none; }
                .cookie-btn-primary { background: #121212; color: #fff; }
            `;
            document.head.appendChild(style);

            const backdrop = document.createElement('div');
            backdrop.className = 'ck-backdrop';
            
            const modal = document.createElement('div');
            modal.className = 'cookie-settings-modal';
            modal.innerHTML = `
                <h3 style="margin-top:0; font-size:1.25rem;">Evästeasetukset</h3>
                <p style="font-size:0.875rem; color:#4b5563; margin-bottom:1.5rem;">Välttämättömät evästeet vaaditaan sivuston perustoiminnallisuuteen.</p>
                
                <div class="ck-row">
                    <div>
                        <strong>Välttämättömät</strong>
                    </div>
                    <label class="ck-switch">
                        <input type="checkbox" checked disabled>
                        <span class="ck-slider"></span>
                    </label>
                </div>
                <div class="ck-row">
                    <div>
                        <strong>Analytiikka</strong>
                    </div>
                    <label class="ck-switch">
                        <input type="checkbox" id="toggle-analytics" ${consent.analytics ? 'checked' : ''}>
                        <span class="ck-slider"></span>
                    </label>
                </div>
                <div class="ck-row">
                    <div>
                        <strong>Markkinointi</strong>
                    </div>
                    <label class="ck-switch">
                        <input type="checkbox" id="toggle-marketing" ${consent.marketing ? 'checked' : ''}>
                        <span class="ck-slider"></span>
                    </label>
                </div>
                
                <button class="cookie-btn cookie-btn-primary" style="width:100%; margin-top:1rem;" id="btn-save-settings">Tallenna valinnat</button>
            `;
            
            document.body.appendChild(backdrop);
            document.body.appendChild(modal);

            document.getElementById('btn-save-settings').onclick = () => {
                const newData = {
                    necessary: true,
                    analytics: document.getElementById('toggle-analytics').checked,
                    marketing: document.getElementById('toggle-marketing').checked
                };
                localStorage.setItem(CONSENT_KEY, JSON.stringify(newData));
                backdrop.classList.remove('show');
                modal.classList.remove('show');
                // Ladataan sivu uudestaan jotta analytiikka herää/kuolee
                window.location.reload();
            };
            
            backdrop.onclick = () => {
                backdrop.classList.remove('show');
                modal.classList.remove('show');
            };

            const tsLink = document.querySelector('a[href="tietosuojaseloste.html"]');
            if (tsLink && !document.getElementById('footer-cookie-settings')) {
                const span = document.createElement('span');
                span.innerHTML = ' | <a href="#" id="footer-cookie-settings" style="text-decoration: underline; color: inherit;">Evästeasetukset</a>';
                tsLink.parentNode.insertBefore(span, tsLink.nextSibling);
                
                document.getElementById('footer-cookie-settings').onclick = (e) => {
                    e.preventDefault();
                    backdrop.classList.add('show');
                    modal.classList.add('show');
                };
            }
        }
    }
    

    // Hamburger Menu Logic
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuBtn.classList.toggle('active');
            navLinks.classList.toggle('active');
            document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuBtn.classList.remove('active');
                navLinks.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }

    // Contact Form Sanitization Intercept
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
            e.preventDefault();
            
            const btn = contactForm.querySelector('button[type="submit"]');
            btn.textContent = 'Lähetetään...';
            btn.disabled = true;

            const sanitizeHtml = (str) => {
                const temp = document.createElement('div');
                temp.textContent = str;
                return temp.innerHTML;
            };

            const formData = new FormData(contactForm);
            
            // XSS Prevention Check
            let safe = true;
            for (let [key, value] of formData.entries()) {
                if (typeof value === 'string') {
                    const sanitized = sanitizeHtml(value);
                    formData.set(key, sanitized);
                    if (value.includes('<') || value.includes('>') || value.includes('script')) safe = false;
                }
            }

            if (!safe) {
                alert('Virheellinen syöte evätty turvallisuussyistä.');
                btn.textContent = 'Lähetä viesti';
                btn.disabled = false;
                return;
            }

            // Tallenna liidi Supabaseen analytiikkaa ja Dashboardia varten
            if (typeof supabase !== 'undefined') {
                try {
                    let sourceInfo = formData.get('source') ? `LÄHDE: ${formData.get('source')}\n\n` : '';
                    supabase.from('leads').insert([{
                        name: formData.get('name'),
                        email: formData.get('email'),
                        phone: formData.get('phone') || '',
                        message: `${sourceInfo}${formData.get('message') || ''}`
                    }]).then(() => {});
                } catch(err) {
                    console.error('Supabase DB error:', err);
                }
            }

            fetch(contactForm.action, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if(data.success) {
                    window.location.href = "kiitos.html";
                } else {
                    alert('Lomakkeen lähetys epäonnistui. Kokeile myöhemmin uudelleen.');
                    btn.textContent = 'Lähetä viesti';
                    btn.disabled = false;
                }
            })
            .catch(error => {
                console.error(error);
                alert('Tapahtui odottamaton verkkovirhe.');
                btn.textContent = 'Lähetä viesti';
                btn.disabled = false;
            });
        });
    }

    // Materiaalipaketti lomakkeen lähetys ja tallennus
    const materialForm = document.getElementById('material-form');
    if (materialForm) {
        materialForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const btn = materialForm.querySelector('button[type="submit"]');
            btn.textContent = 'Lähetetään...';
            btn.disabled = true;

            const formData = new FormData(materialForm);
            
            // Tallenna liidi Supabaseen analytiikkaa ja Dashboardia varten
            if (typeof supabase !== 'undefined') {
                try {
                    const kohdeStr = formData.get('kohdeOtsikko') ? ` (${formData.get('kohdeOtsikko')})` : '';
                    const messageStr = `LÄHDE: Materiaalipaketin lataus${kohdeStr}.\nMarkkinointilupa annettu.`;
                    
                    supabase.from('leads').insert([{
                        name: formData.get('name'),
                        email: formData.get('email'),
                        phone: formData.get('phone') || '',
                        message: messageStr
                    }]).then((res) => {
                        if (res.error) throw res.error;
                        // Onnistunut lähetys
                        materialForm.style.display = 'none';
                        const successDiv = document.getElementById('material-success');
                        if(successDiv) successDiv.style.display = 'block';
                    });
                } catch(err) {
                    console.error('Supabase DB error:', err);
                    alert("Virhe tietojen tallennuksessa. Kokeile uudelleen.");
                    btn.textContent = 'Lähetä';
                    btn.disabled = false;
                }
            } else {
                 alert("Yhteyttä tietokantaan ei voitu muodostaa.");
                 btn.textContent = 'Lähetä';
                 btn.disabled = false;
            }
        });
    }

    // CMS DATA INJECTION (FOR APPLICABLE PUBLIC PAGES)
    if (supabase) {
        // Detect current page slug from URL
        let slug;
        const urlParams = new URLSearchParams(window.location.search);
        
        if (window.location.pathname.includes('kohde.html')) {
            // Uusi dynaaminen projekti reititin
            slug = urlParams.get('kohde');
        } else {
            slug = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
            if (slug === '' || slug === '/') slug = 'index';
            if (slug === 'tarinamme') slug = 'valtti-tapa';
        }

        const isProjectPage = window.location.pathname.includes('kohde.html');

        try {
            if (isProjectPage && slug) {
                if (urlParams.get('rewrite') === 'true') {
                    window.history.replaceState({}, '', `/kohteet/${slug}`);
                }
                // Ladataan kohteen tiedot tietokannasta url-parametrin perusteella (case-insensitive for legacy slugs)
                const { data: project, error } = await supabase.from('projects').select('*').ilike('slug', slug).maybeSingle();
                if (project && !error) {
                    
                    document.querySelectorAll('[data-project]').forEach(el => {
                        const key = el.getAttribute('data-project');
                        let val = project[key];
                        
                        if (key.startsWith('details_') && project.details) {
                            const detailKey = key.replace('details_', '');
                            val = project.details[detailKey];
                        }

                        if (val !== undefined && val !== null) {
                            if (key === 'status') {
                                if (val === 'MARKETING') val = 'ENNAKKOMARKKINOINTI';
                                else if (val === 'AVAILABLE') val = 'MYYNNISSÄ';
                                else if (val === 'CONSTRUCTION') val = 'RAKENTEILLA';
                                else if (val === 'SOLD') {
                                    val = 'MYYTY';
                                    el.style.backgroundColor = '#10b981';
                                    el.style.color = 'white';
                                }
                            }
                            if (key === 'price') {
                                val = Number(val).toLocaleString('fi-FI') + ' €';
                            }
                            
                            if (el.tagName.toLowerCase() === 'img') {
                                el.src = val;
                            } else if (el.tagName.toLowerCase() === 'iframe') {
                                if (typeof val === 'string' && val.includes('<iframe') && val.includes('src="')) {
                                    const match = val.match(/src="([^"]+)"/);
                                    if (match && match[1]) el.src = match[1];
                                } else {
                                    el.src = val;
                                }
                            } else if (key === 'hero_image') {
                                el.style.backgroundImage = `url('${val}')`;
                            } else if (el.tagName.toLowerCase() === 'a') {
                                const trimVal = String(val).trim();
                                if (trimVal.includes('@') && !trimVal.startsWith('http')) {
                                    el.href = 'mailto:' + trimVal;
                                } else if (trimVal.match(/^[0-9\-\+\s]+$/)) {
                                    el.href = 'tel:' + trimVal.replace(/\s/g, '');
                                } else {
                                    el.href = val;
                                }
                                el.textContent = val;
                            } else {
                                el.innerHTML = val;
                            }
                        }
                    });

                    // Dynaaminen materiaalipaketin sisältö asunnolle
                    const pdfLink = project.details ? project.details['Materiaalipaketti PDF'] : null;
                    const esitekuva = project.details ? project.details['Esitekuva'] : null;
                    
                    const downBtn = document.getElementById('material-download-btn');
                    if (downBtn && pdfLink) {
                        downBtn.href = pdfLink;
                    } else if (downBtn) {
                        downBtn.textContent = 'Esitettä ei saatavilla';
                        downBtn.onclick = (e) => e.preventDefault();
                        downBtn.style.opacity = '0.5';
                        downBtn.style.cursor = 'not-allowed';
                    }

                    const esiteImg = document.getElementById('materiaalipaketti-esitekuva');
                    if (esiteImg) {
                        if (esitekuva) {
                            esiteImg.src = esitekuva;
                        }
                        esiteImg.style.display = 'block'; // Näytä joko oikea tai placeholder
                    }

                    const matKohde = document.getElementById('material-kohde');
                    if (matKohde) {
                        matKohde.value = project.title || '';
                    }

                    // Trigger target specific logic outside universal loop (Progressbar)
                    const valmiusRaw = project.details ? project.details['Valmiusaste (%)'] : null;
                    if (valmiusRaw !== null && valmiusRaw !== undefined && valmiusRaw !== '') {
                        const valmObj = parseInt(valmiusRaw);
                        if (!isNaN(valmObj)) {
                            const valCon = document.getElementById('kohde-valmiusaste-container');
                            if (valCon) {
                                valCon.style.display = 'block';
                                document.getElementById('kohde-valmiusaste-text').textContent = valmObj + '%';
                                // Anime-viive tehosteelle
                                setTimeout(() => {
                                    document.getElementById('kohde-valmiusaste-bar').style.width = valmObj + '%';
                                }, 300);
                            }
                        }
                    }

                    // Dynamically render Social Media links for the project
                    const someTitle = project.details ? project.details['Some Otsikko'] : null;
                    const fbLink = project.details ? project.details['Facebook Linkki'] : null;
                    const igLink = project.details ? project.details['Instagram Linkki'] : null;
                    
                    if (fbLink || igLink) {
                        const someContainer = document.getElementById('kohde-some-container');
                        if (someContainer) {
                            someContainer.style.display = 'block';
                            if (someTitle) document.getElementById('kohde-some-otsikko').textContent = someTitle;
                            
                            if (fbLink) {
                                const fbEl = document.getElementById('kohde-some-fb');
                                fbEl.style.display = 'flex';
                                fbEl.href = fbLink;
                            }
                            if (igLink) {
                                const igEl = document.getElementById('kohde-some-ig');
                                igEl.style.display = 'flex';
                                igEl.href = igLink;
                            }
                        }
                    }

                    // Dynamically set Meta tags for SEO & AI & Social Shares
                    document.title = project.title + " | Valttikodit Kohteet";
                    const metaDesc = document.createElement('meta');
                    metaDesc.name = "description";
                    metaDesc.content = (project.ingress || project.description || "").substring(0, 155) + "...";
                    
                    const ogTitle = document.createElement('meta');
                    ogTitle.property = "og:title";
                    ogTitle.content = project.title;
                    
                    const ogImage = document.createElement('meta');
                    if (project.hero_image) {
                        ogImage.property = "og:image";
                        ogImage.content = project.hero_image.startsWith('http') ? project.hero_image : window.location.origin + '/' + project.hero_image;
                    }

                    document.head.append(metaDesc, ogTitle, ogImage);

                    // Generate AI-Ready JSON-LD Schema.org Data
                    const schema = {
                        "@context": "https://schema.org",
                        "@type": "SingleFamilyResidence",
                        "name": project.title || "Valttikodit Asunto",
                        "description": project.description || project.ingress || "",
                        "url": window.location.href,
                        "image": project.hero_image ? (project.hero_image.startsWith('http') ? project.hero_image : window.location.origin + '/' + project.hero_image) : "",
                        "address": {
                            "@type": "PostalAddress",
                            "streetAddress": project.address || "",
                            "addressLocality": project.location || "",
                            "addressRegion": "Pohjois-Pohjanmaa",
                            "addressCountry": "FI"
                        },
                        "floorSize": {
                            "@type": "QuantitativeValue",
                            "value": project.area ? parseFloat(project.area.replace(',', '.')) : 0,
                            "unitCode": "MTK"
                        }
                    };
                    const jsonLdScript = document.createElement('script');
                    jsonLdScript.type = "application/ld+json";
                    jsonLdScript.text = JSON.stringify(schema);
                    document.head.appendChild(jsonLdScript);

                    // Kuvagalleria luonti asunnoille
                    const galleryContainer = document.getElementById('project-gallery');
                    if (galleryContainer && project.gallery_images && Array.isArray(project.gallery_images)) {
                        galleryContainer.innerHTML = '';
                        project.gallery_images.forEach(imgUrl => {
                            const img = document.createElement('img');
                            img.src = imgUrl;
                            img.style.cssText = "width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); cursor: pointer; transition: transform 0.2s;";
                            img.onmouseover = () => img.style.transform = 'scale(1.02)';
                            img.onmouseout = () => img.style.transform = 'scale(1)';
                            img.onclick = () => {
                                const modal = document.createElement('div');
                                modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999; cursor: pointer; padding: 2rem; box-sizing: border-box;';
                                const modalImg = document.createElement('img');
                                modalImg.src = imgUrl;
                                modalImg.style.cssText = 'max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); object-fit: contain;';
                                modal.appendChild(modalImg);
                                modal.onclick = () => document.body.removeChild(modal);
                                document.body.appendChild(modal);
                            };
                            galleryContainer.appendChild(img);
                        });
                    }

                    // Karusellin rakentaminen (Sivun ylälaita: Hero-kuva + Galleriakuvat)
                    const carouselTrack = document.getElementById('project-carousel-track');
                    if (carouselTrack) {
                        carouselTrack.innerHTML = ''; 
                        let allImages = [];
                        if (project.hero_image) allImages.push(project.hero_image);
                        if (project.gallery_images && Array.isArray(project.gallery_images)) {
                            allImages = allImages.concat(project.gallery_images);
                        }

                        allImages.forEach(imgUrl => {
                            const slideDiv = document.createElement('div');
                            slideDiv.className = 'project-carousel-slide';
                            
                            const img = document.createElement('img');
                            img.src = imgUrl;
                            slideDiv.appendChild(img);
                            
                            // Lightbox ominaisuus (sama kuin alasivun galleriassa)
                            slideDiv.onclick = () => {
                                const modal = document.createElement('div');
                                modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999; cursor: pointer; padding: 2rem; box-sizing: border-box;';
                                const modalImg = document.createElement('img');
                                modalImg.src = imgUrl;
                                modalImg.style.cssText = 'max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); object-fit: contain;';
                                modal.appendChild(modalImg);
                                modal.onclick = () => document.body.removeChild(modal);
                                document.body.appendChild(modal);
                            };
                            carouselTrack.appendChild(slideDiv);
                        });

                        // Nuolinäppäimet
                        const prevBtn = document.getElementById('carousel-prev');
                        const nextBtn = document.getElementById('carousel-next');
                        if (prevBtn && nextBtn) {
                            prevBtn.onclick = () => {
                                const slideWidth = carouselTrack.querySelector('.project-carousel-slide')?.offsetWidth + 20 || 300;
                                carouselTrack.scrollBy({ left: -slideWidth, behavior: 'smooth' });
                            };
                            nextBtn.onclick = () => {
                                const slideWidth = carouselTrack.querySelector('.project-carousel-slide')?.offsetWidth + 20 || 300;
                                carouselTrack.scrollBy({ left: slideWidth, behavior: 'smooth' });
                            };
                        }
                    }
                }
            } else {
                // Ladataan tavalliset CMS sivut (etusivu, jne)
                const { data: pageData, error } = await supabase.from('pages').select('content').eq('slug', slug).maybeSingle();
                if (pageData && pageData.content) {
                    const content = pageData.content;
                    document.querySelectorAll('[data-cms]').forEach(el => {
                        const key = el.getAttribute('data-cms');
                        if (content[key]) {
                            if (el.tagName.toLowerCase() === 'img') {
                                el.src = content[key];
                                el.style.display = 'block';
                            } else if (el.style.backgroundImage) {
                                el.style.backgroundImage = `url('${content[key]}')`;
                            } else {
                                const val = content[key];
                                if (typeof val === 'string' && val.startsWith('http') && (val.match(/\.(jpeg|jpg|gif|png|webp)/i) || val.includes('supabase.co/storage'))) {
                                    el.innerHTML = `<img src="${val}" style="max-width: 100%; height: auto; border-radius: 8px; margin-top: 1rem; margin-bottom: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">`;
                                } else {
                                    let formattedVal = val;
                                    if (el.hasAttribute('data-list') && typeof val === 'string') {
                                        const items = val.split('\n').filter(line => line.trim() !== '').map(line => line.replace(/^[-•*]\s/, ''));
                                        formattedVal = `<ul style="list-style-type: none; padding-left: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">` + items.map(line => `<li style="position: relative; padding-left: 1.25rem;"><span style="position: absolute; left: 0; color: var(--primary);">•</span>${line}</li>`).join('') + `</ul>`;
                                    }
                                    el.innerHTML = formattedVal;
                                }
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.error("CMS load error:", e);
        }
    }

    // KOHTEET.HTML AND INDEX.HTML PROJECTS LIST
    const projectList = document.getElementById('project-list');
    const latestProjectsList = document.getElementById('latest-projects');
    const targetList = projectList || latestProjectsList;

    if (supabase && targetList) {
        try {
            const { data: projects, error } = await supabase
                .from('projects')
                .select('*')
                .eq('published', true)
                .order('id', { ascending: false });

            if (error) throw error;
            targetList.innerHTML = '';

            if (projects && projects.length > 0) {
                projects.sort((a, b) => {
                    const orderA = a.details && a.details['Järjestys'] !== undefined ? parseInt(a.details['Järjestys']) : 999;
                    const orderB = b.details && b.details['Järjestys'] !== undefined ? parseInt(b.details['Järjestys']) : 999;
                    if (orderA !== orderB) return orderA - orderB;
                    // Secondary fallback sort
                    return b.id - a.id;
                });

                const availableProjects = projects.filter(p => p.status !== 'SOLD');
                const soldProjects = projects.filter(p => p.status === 'SOLD');

                const renderCards = (list, container) => {
                    list.forEach(project => {
                        let statusFi = '';
                        let statusClass = '';
                        switch (project.status) {
                            case 'MARKETING': statusFi = 'ENNAKKOMARKKINOINTI'; break;
                            case 'AVAILABLE': statusFi = 'MYYNNISSÄ'; break;
                            case 'CONSTRUCTION': statusFi = 'RAKENTEILLA'; break;
                            case 'SOLD': 
                                statusFi = 'MYYTY'; 
                                statusClass = 'sold';
                                break;
                            default: statusFi = project.status; break;
                        }

                        const priceStr = project.price ? `Hinta alk. ${Number(project.price).toLocaleString('fi-FI')} €` : 'Hinta pyydettäessä';
                        
                        const bgStyle = project.hero_image 
                            ? `background-color: #f3f4f6; background-image: url('${project.hero_image}'); background-size: cover; background-position: center;` 
                            : `background-color: #f3f4f6;`;

                        const safeSlug = (project.slug || 'default').toString().trim().toLowerCase().replace(/\s+/g, '-');

                        let progressBarHtml = '';
                        const valmiusRaw = project.details ? project.details['Valmiusaste (%)'] : null;
                        if (valmiusRaw !== null && valmiusRaw !== undefined && valmiusRaw !== '') {
                            const valm = parseInt(valmiusRaw);
                            if (!isNaN(valm)) {
                                progressBarHtml = `
                                    <div style="margin-bottom: 1rem; margin-top: auto;">
                                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.35rem; font-weight: 600;">
                                            <span style="color: var(--text-color);">Valmiusaste</span>
                                            <span style="color: #10b981;">${valm}%</span>
                                        </div>
                                        <div style="width: 100%; background-color: #e5e7eb; border-radius: 9999px; height: 6px; overflow: hidden;">
                                            <div style="background-color: #10b981; height: 100%; border-radius: 9999px; width: ${valm}%;"></div>
                                        </div>
                                    </div>
                                `;
                            }
                        }

                        const cardHtml = `
                            <a href="/kohteet/${safeSlug}" class="card" style="text-decoration: none; color: inherit; display: flex; flex-direction: column;">
                                <div class="card-img" style="${bgStyle}">
                                    ${statusFi ? `<span class="card-badge ${statusClass}" ${project.status === 'SOLD' ? 'style="background-color: #10b981; color: white;"' : ''}>${statusFi}</span>` : ''}
                                </div>
                                <div class="card-content" style="display: flex; flex-direction: column; flex: 1;">
                                    <div style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.5rem;">${project.location || ''}</div>
                                    <h3 style="transition: color 0.2s;">${project.title || 'Nimetön kohde'}</h3>
                                    <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem;">
                                        ${project.ingress || project.description || ''}
                                    </p>
                                    ${progressBarHtml}
                                    <div style="font-weight: 600;">${priceStr}</div>
                                </div>
                            </a>
                        `;

                        const wrapper = document.createElement('div');
                        wrapper.innerHTML = cardHtml.trim();
                        container.appendChild(wrapper.firstChild);
                    });
                };

                if (availableProjects.length > 0) {
                    renderCards(availableProjects, targetList);
                } else {
                    targetList.innerHTML = '<p>Ei myynnissä olevia kohteita tällä hetkellä.</p>';
                }

                if (soldProjects.length > 0) {
                    const titleTag = targetList.id === 'latest-projects' ? 'h2' : 'h1';
                    const soldTitle = document.createElement(titleTag);
                    soldTitle.textContent = 'Myydyt kohteet';
                    soldTitle.style.marginBottom = '1rem';
                    soldTitle.style.marginTop = '4rem'; 
                    
                    if (titleTag === 'h2') {
                        soldTitle.style.fontSize = '2.5rem';
                        soldTitle.style.fontWeight = '700';
                        soldTitle.style.letterSpacing = '-0.02em';
                    }

                    const soldGrid = document.createElement('div');
                    soldGrid.className = 'card-grid';

                    targetList.parentNode.insertBefore(soldTitle, targetList.nextSibling);
                    targetList.parentNode.insertBefore(soldGrid, soldTitle.nextSibling);

                    renderCards(soldProjects, soldGrid);
                }

            } else {
                 targetList.innerHTML = '<p>Ei julkaistuja kohteita tällä hetkellä.</p>';
            }
        } catch (e) {
            console.error("Error loading projects: ", e);
            targetList.innerHTML = '<p style="color: red;">Virhe ladattaessa kohteita.</p>';
        }
    }

    // --- GLOBAALI ALATUNNISTE LATAUS (FOOTER) ---
    if (supabase) {
        try {
            const { data: globalData } = await supabase.from('pages').select('content').eq('slug', 'index').maybeSingle();
            if (globalData && globalData.content) {
                const content = globalData.content;
                document.querySelectorAll('[data-global-cms]').forEach(el => {
                    const key = el.getAttribute('data-global-cms');
                    const val = content[key];
                    if (val) {
                        if (el.tagName.toLowerCase() === 'a') {
                            if (key.toLowerCase().includes('sähköposti') || (val.includes('@') && !val.includes('http'))) {
                                el.href = `mailto:${val.trim()}`;
                                el.textContent = val;
                            } else if (key.toLowerCase().includes('puhelin')) {
                                el.href = `tel:${val.replace(/[\s-]/g, '')}`;
                                el.textContent = val;
                            } else {
                                el.href = val; 
                                // Do not overwrite textContent for social links so standard labels like "Instagram" stay intact
                            }
                        } else {
                            el.innerHTML = val.replace(/\n/g, '<br>');
                        }
                    }
                });
            }
        } catch(e) {
            console.error("Global Footer load error:", e);
        }
    }

    // Näytetään sivuston kaikki tekstit kun CMS-datan haku on (ainakin yritetty) suorittaa.
    document.body.classList.add('cms-loaded');
});

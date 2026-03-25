// assets/js/main.js
const SUPABASE_URL = 'https://xbeonksexpjvekqjxoph.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn';

document.addEventListener('DOMContentLoaded', async () => {
    let supabase = null;
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // Yksinkertainen analytiikkaseuranta sivulatauksille
    if (typeof supabase !== 'undefined') {
        let cleanPath = window.location.pathname.split('/').pop() || 'index.html';
        if (cleanPath === '' || cleanPath === '/') cleanPath = 'index.html';
        
        try {
            await supabase.from('page_views').insert([{ path: cleanPath }]);
        } catch(e) {
            console.error("Pageview log failed:", e);
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
                    supabase.from('leads').insert([{
                        name: formData.get('name'),
                        email: formData.get('email'),
                        phone: formData.get('phone') || '',
                        message: formData.get('message') || ''
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

                projects.forEach(project => {
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
                    targetList.appendChild(wrapper.firstChild);
                });
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
});

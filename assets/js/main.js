// assets/js/main.js
const SUPABASE_URL = 'https://xbeonksexpjvekqjxoph.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn';

document.addEventListener('DOMContentLoaded', async () => {
    let supabase = null;
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
        }

        const isProjectPage = window.location.pathname.includes('kohde.html');

        try {
            if (isProjectPage && slug) {
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
                                else if (val === 'SOLD') val = 'MYYTY';
                            }
                            if (key === 'price') {
                                val = Number(val).toLocaleString('fi-FI') + ' €';
                            }
                            
                            if (el.tagName.toLowerCase() === 'img') {
                                el.src = val;
                            } else if (el.tagName.toLowerCase() === 'iframe') {
                                el.src = val;
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
                                    el.innerHTML = val;
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

                    const priceStr = project.price ? `Hinta ${Number(project.price).toLocaleString('fi-FI')} €` : 'Hinta pyydettäessä';
                    
                    const bgStyle = project.hero_image 
                        ? `background-color: #f3f4f6; background-image: url('${project.hero_image}'); background-size: cover; background-position: center;` 
                        : `background-color: #f3f4f6;`;

                    const safeSlug = (project.slug || 'default').toString().trim().toLowerCase().replace(/\s+/g, '-');

                    const cardHtml = `
                        <a href="kohde.html?kohde=${safeSlug}" class="card" style="text-decoration: none; color: inherit;">
                            <div class="card-img" style="${bgStyle}">
                                ${statusFi ? `<span class="card-badge ${statusClass}">${statusFi}</span>` : ''}
                            </div>
                            <div class="card-content">
                                <div style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0.5rem;">${project.location || ''}</div>
                                <h3 style="transition: color 0.2s;">${project.title || 'Nimetön kohde'}</h3>
                                <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1rem; flex: 1;">
                                    ${project.ingress || project.description || ''}
                                </p>
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

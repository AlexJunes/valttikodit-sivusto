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
        let slug = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
        if (slug === '' || slug === '/') slug = 'index';

        const isProjectPage = window.location.pathname.includes('/kohdesivut/');

        try {
            if (isProjectPage) {
                // Ladataan kohteen tiedot tietokannasta
                const { data: project, error } = await supabase.from('projects').select('*').eq('slug', slug).maybeSingle();
                if (project && !error) {
                    
                    document.querySelectorAll('[data-project]').forEach(el => {
                        const key = el.getAttribute('data-project');
                        let val = project[key];
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
                            } else if (key === 'hero_image') {
                                el.style.backgroundImage = `url('${val}')`;
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
                            } else if (el.style.backgroundImage) {
                                el.style.backgroundImage = `url('${content[key]}')`;
                            } else {
                                el.innerHTML = content[key];
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.error("CMS load error:", e);
        }
    }

    // KOHTEET.HTML PROJECTS LIST
    const projectList = document.getElementById('project-list');
    if (supabase && projectList) {
        try {
            const { data: projects, error } = await supabase
                .from('projects')
                .select('*')
                .eq('published', true)
                .order('id', { ascending: false });

            if (error) throw error;
            projectList.innerHTML = '';

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

                    const cardHtml = `
                        <a href="kohdesivut/${project.slug || 'default'}.html" class="card" style="text-decoration: none; color: inherit;">
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
                    projectList.appendChild(wrapper.firstChild);
                });
            } else {
                 projectList.innerHTML = '<p>Ei julkaistuja kohteita tällä hetkellä.</p>';
            }
        } catch (e) {
            console.error("Error loading projects: ", e);
            projectList.innerHTML = '<p style="color: red;">Virhe ladattaessa kohteita.</p>';
        }
    }
});

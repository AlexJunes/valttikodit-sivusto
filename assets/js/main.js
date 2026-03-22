// assets/js/main.js

import { config } from './config.js';

// Julkisen puolen logiikka (haetaan kohteet dynaamisesti tms.)
document.addEventListener('DOMContentLoaded', async () => {

    const supabase = config.initSupabase();
    const projectList = document.getElementById('project-list');

    if (supabase && projectList) {
        try {
            const { data: projects, error } = await supabase
                .from('projects')
                .select('*')
                .eq('published', true)
                .order('id', { ascending: false });

            if (error) throw error;

            projectList.innerHTML = ''; // Tyhjennetään loading teksti

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
                    
                    // Jos kuva on olemassa, lisätään se taustaksi inline-tyylinä:
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

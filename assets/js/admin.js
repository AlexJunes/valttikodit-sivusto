import { config } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
    const supabase = config.initSupabase();
    if (!supabase) return;

    const path = window.location.pathname;

    async function uploadToSupabaseStorage(file) {
        if (!file) return null;
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        const { error } = await supabase.storage.from('images').upload(filePath, file);
        if (error) {
            console.error("Storage upload error:", error);
            throw new Error("Kuvien lataus epäonnistui. Varmista että Supabasessa on Storage Bucket nimeltään 'images' ja että siihen on kirjoitusoikeus.");
        }

        const { data: publicData } = supabase.storage.from('images').getPublicUrl(filePath);
        return publicData.publicUrl;
    }

    // --- DASHBOARD.HTML ---
    if (path.includes('dashboard.html')) {
        const statsCards = document.querySelectorAll('.admin-card p');
        if (statsCards.length > 0) {
            try {
                const { count, error } = await supabase.from('projects').select('*', { count: 'exact', head: true });
                if (!error && count !== null) {
                    statsCards[0].textContent = count;
                }
            } catch (err) {
                console.error("Dashboard stats fetch failed", err);
            }
        }
    }

    // --- PROJECTS.HTML ---
    const projectsTable = document.getElementById('projects-tbody');
    if (projectsTable) {
        try {
            const { data, error } = await supabase.from('projects').select('id, title, location, status, published');
            if (error) throw error;
            
            projectsTable.innerHTML = '';
            if (!data || data.length === 0) {
                projectsTable.innerHTML = '<tr><td colspan="5">Ei kohteita.</td></tr>';
            } else {
                data.forEach(project => {
                    const row = document.createElement('tr');
                    const statusText = project.status || 'TUNTEMATON';
                    const pubText = project.published ? '<span style="color: green; font-weight: 600;">Kyllä</span>' : '<span style="color: red;">Ei</span>';
                    
                    row.innerHTML = `
                        <td style="font-weight: 500;">${project.title || '-'}</td>
                        <td>${project.location || '-'}</td>
                        <td><span style="background: var(--accent); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${statusText}</span></td>
                        <td>${pubText}</td>
                        <td style="text-align: right;">
                            <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="window.location.href='edit-project.html?id=${project.id}'">Muokkaa</button>
                            <button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; color: #ef4444; border-color: #ef4444;" onclick="deleteProject('${project.id}')">Poista</button>
                        </td>
                    `;
                    projectsTable.appendChild(row);
                });
            }
        } catch (err) {
            console.error('Projects fetch error:', err);
            projectsTable.innerHTML = '<tr><td colspan="5" style="color: red;">Virhe haettaessa tietoja (onko "projects"-taulu luotu?).</td></tr>';
        }

        window.deleteProject = async (id) => {
            if (confirm("Haluatko varmasti poistaa kohteen?")) {
                const { error } = await supabase.from('projects').delete().eq('id', id);
                if (error) {
                    alert('Poistaminen epäonnistui: ' + error.message);
                } else {
                    window.location.reload();
                }
            }
        };
    }

    // --- EDIT-PROJECT.HTML ---
    const editProjectForm = document.getElementById('edit-project-form');
    if (path.includes('edit-project.html') && editProjectForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id');
        
        const inputs = editProjectForm.querySelectorAll('.form-input:not([type="file"])');
        const getVal = (index) => inputs[index] ? inputs[index].value : '';
        const setVal = (index, val) => { if(inputs[index]) inputs[index].value = val; };

        // File inputs handling
        const fileInputs = editProjectForm.querySelectorAll('input[type="file"]');
        const heroInput = fileInputs[0];
        const galleryInput = editProjectForm.querySelector('input[type="file"][multiple]');
        
        let pendingHeroFile = null;
        let existingHeroUrl = '';
        let currentGallery = []; // Array of objects: { url: string, file: File|null }

        // UI Setup for Hero Image
        const heroImgElement = heroInput.parentElement.parentElement.querySelector('img');
        heroInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                pendingHeroFile = e.target.files[0];
                heroImgElement.src = URL.createObjectURL(pendingHeroFile);
                heroImgElement.style.display = 'block';
            }
        });

        // UI Setup for Gallery
        const galleryParent = galleryInput.parentElement.parentElement;
        galleryParent.querySelectorAll('div:not(:last-child)').forEach(mock => mock.remove());
        
        const dynamicGalleryContainer = document.createElement('div');
        galleryParent.insertBefore(dynamicGalleryContainer, galleryParent.lastElementChild);

        const renderGallery = () => {
            dynamicGalleryContainer.innerHTML = '';
            currentGallery.forEach((item, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: white; border: 1px solid var(--border); margin-bottom: 0.5rem; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);";
                itemDiv.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <img src="${item.url}" style="width: 60px; height: 40px; object-fit: cover; border-radius: 2px;">
                        <span style="font-size: 0.875rem; font-weight: 500;">Kuva ${index + 1}</span>
                        <button type="button" class="btn btn-outline mx-2" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="moveItem(${index}, -1)">&#x25B2;</button>
                        <button type="button" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="moveItem(${index}, 1)">&#x25BC;</button>
                    </div>
                    <button type="button" style="color: #ef4444; border: none; background: none; cursor: pointer; font-size: 0.875rem; font-weight: 600;" onclick="removeItem(${index})">Poista</button>
                `;
                dynamicGalleryContainer.appendChild(itemDiv);
            });
        };

        window.moveItem = (index, dir) => {
            if (index + dir >= 0 && index + dir < currentGallery.length) {
                const temp = currentGallery[index];
                currentGallery[index] = currentGallery[index + dir];
                currentGallery[index + dir] = temp;
                renderGallery();
            }
        };

        window.removeItem = (index) => {
            currentGallery.splice(index, 1);
            renderGallery();
        };

        galleryInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => {
                currentGallery.push({
                    url: URL.createObjectURL(file), // Local preview
                    file: file // Store explicitly to upload later
                });
            });
            renderGallery();
        });


        // Clear text fields if new
        if (!projectId) {
            for(let i=0; i<15; i++) setVal(i, '');
        } else {
            try {
                const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single();
                if (data && !error) {
                    setVal(0, data.title || '');
                    setVal(1, data.slug || '');
                    setVal(2, data.location || '');
                    setVal(3, data.address || '');
                    setVal(4, data.area || '');
                    setVal(5, data.area_other || '');
                    setVal(6, data.type || '');
                    setVal(7, data.price || '');
                    setVal(8, data.status || 'AVAILABLE');
                    setVal(9, data.room_setup || '');
                    setVal(10, data.ingress || '');
                    setVal(11, data.description || '');

                    if (data.hero_image) {
                        existingHeroUrl = data.hero_image;
                        heroImgElement.src = existingHeroUrl;
                        heroImgElement.style.display = 'block';
                    }

                    if (data.gallery_images && Array.isArray(data.gallery_images)) {
                        // DB returns URLs directly. Transform to our object representation
                        currentGallery = data.gallery_images.map(url => ({
                            url: url,
                            file: null
                        }));
                        renderGallery();
                    }

                    const pubCheck = document.getElementById('published');
                    if (pubCheck && data.published !== undefined) pubCheck.checked = data.published;
                }
            } catch (err) {
                console.error("Load project error", err);
            }
        }

        const saveBtn = editProjectForm.querySelector('.btn-primary');
        if (saveBtn) {
            saveBtn.onclick = async (e) => {
                e.preventDefault();
                saveBtn.textContent = 'Tallennetaan (Kuvat ladataan)...';
                saveBtn.disabled = true;

                try {
                    // Upload hero if altered
                    let finalHeroUrl = existingHeroUrl;
                    if (pendingHeroFile) {
                        finalHeroUrl = await uploadToSupabaseStorage(pendingHeroFile);
                    }

                    // Upload gallery
                    const finalGallery = [];
                    for (const item of currentGallery) {
                        if (item.file) {
                            const uploadedUrl = await uploadToSupabaseStorage(item.file);
                            finalGallery.push(uploadedUrl);
                        } else {
                            finalGallery.push(item.url); // already uploaded
                        }
                    }

                    const pubCheck = document.getElementById('published');
                    
                    const projectData = {
                        title: getVal(0),
                        slug: getVal(1),
                        location: getVal(2),
                        address: getVal(3),
                        area: getVal(4),
                        area_other: getVal(5),
                        type: getVal(6),
                        price: getVal(7),
                        status: getVal(8),
                        room_setup: getVal(9),
                        ingress: getVal(10),
                        description: getVal(11),
                        published: pubCheck ? pubCheck.checked : false,
                        hero_image: finalHeroUrl,
                        gallery_images: finalGallery
                    };

                    let res;
                    if (projectId) {
                        res = await supabase.from('projects').update(projectData).eq('id', projectId);
                    } else {
                        res = await supabase.from('projects').insert([projectData]);
                    }

                    if (res.error) throw res.error;
                    
                    alert(projectId ? 'Muutokset tallennettu onnistuneesti!' : 'Uusi kohde luotu onnistuneesti!');
                    window.location.href = 'projects.html';
                } catch (err) {
                    alert('Tallennus epäonnistui: ' + err.message);
                } finally {
                    saveBtn.textContent = 'Tallenna muutokset';
                    saveBtn.disabled = false;
                }
            };
        }
    }

    // --- EDIT-INDEX.HTML ---
    if (path.includes('edit-index.html')) {
        const editIndexForm = document.getElementById('edit-project-form');
        if (editIndexForm) {
            const fileInputs = editIndexForm.querySelectorAll('input[type="file"]');
            
            // Add preview listeners
            fileInputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    const imgPreview = input.parentElement.parentElement.querySelector('img');
                    if (e.target.files.length > 0 && imgPreview) {
                        imgPreview.src = URL.createObjectURL(e.target.files[0]);
                    }
                });
            });

            const saveBtn = editIndexForm.querySelector('.btn-primary');
            if (saveBtn) {
                saveBtn.onclick = async (e) => {
                    e.preventDefault();
                    saveBtn.textContent = 'Tallennetaan (Kuvat ladataan)...';
                    saveBtn.disabled = true;

                    try {
                        for (let input of fileInputs) {
                            if (input.files.length > 0) {
                                await uploadToSupabaseStorage(input.files[0]);
                            }
                        }
                        
                        setTimeout(() => {
                            alert('Etusivun sisällöt tallennettu onnistuneesti! (Kuvat ladattu)');
                            saveBtn.textContent = 'Tallenna muutokset';
                            saveBtn.disabled = false;
                        }, 500);
                    } catch(err) {
                        alert('Tallennus epäonnistui: ' + err.message);
                        saveBtn.textContent = 'Tallenna muutokset';
                        saveBtn.disabled = false;
                    }
                }
            }
        }
    }
});

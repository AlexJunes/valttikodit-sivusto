// assets/js/admin.js
const SUPABASE_URL = 'https://xbeonksexpjvekqjxoph.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn';

document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;

    if (!window.supabase) {
        console.error("Supabase library not loaded.");
        return;
    }
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.valttiSupabase = supabase;

    // --- SUPABASE AUTH CHECK & MFA ---
    if (path.includes('/admin/')) {
        const isLoginPage = path.endsWith('login.html') || path.endsWith('/admin/') || path.endsWith('/admin');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!isLoginPage) {
            if (sessionError || !session) {
                window.location.href = 'login.html';
                return;
            }
            
            // Strict MFA Check (Enforces all users to have MFA enrolled and verified)
            const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (mfaError || mfaData.currentLevel !== 'aal2') {
                window.location.href = 'login.html';
                return;
            }

            // Add a logout button to navbar if present
            const nav = document.querySelector('nav') || document.querySelector('.admin-sidebar');
            if (nav && !document.getElementById('logout-btn')) {
                const logoutBtn = document.createElement('a');
                logoutBtn.href = '#';
                logoutBtn.id = 'logout-btn';
                logoutBtn.style.color = '#ef4444';
                logoutBtn.style.marginTop = 'auto';
                logoutBtn.style.display = 'block';
                logoutBtn.style.padding = '0.75rem 1rem';
                logoutBtn.innerHTML = 'Kirjaudu Ulos';
                logoutBtn.onclick = async (e) => {
                    e.preventDefault();
                    await window.valttiSupabase.auth.signOut();
                    window.location.href = 'login.html';
                };
                nav.appendChild(logoutBtn);
            }

        } else {
            // Login Page Flow
            const loginForm = document.getElementById('admin-login-form');
            const loginBtn = document.getElementById('login-btn');
            const loginErr = document.getElementById('login-error');

            const mfaForm = document.getElementById('mfa-form');
            const mfaErr = document.getElementById('mfa-error');
            const verifyMfaBtn = document.getElementById('verify-mfa-btn');

            const mfaSetupForm = document.getElementById('mfa-setup-form');
            const mfaSetupErr = document.getElementById('mfa-setup-error');
            const enrollMfaBtn = document.getElementById('enroll-mfa-btn');

            let currentFactorId = null;
            let setupFactorId = null;

            // Auto-resume MFA setup/challenge if user is already partially logged in (AAL1) but needs AAL2
            if (session) {
                const { data: factorsData } = await supabase.auth.mfa.listFactors();
                if (factorsData) {
                    const verifiedFactor = (factorsData.totp || []).find(f => f.status === 'verified');
                    if (verifiedFactor) {
                        currentFactorId = verifiedFactor.id;
                        if (loginForm) loginForm.style.display = 'none';
                        if (mfaForm) mfaForm.style.display = 'block';
                    } else if (mfaSetupForm && loginForm) {
                        const unverifiedFactors = (factorsData.totp || []).filter(f => f.status === 'unverified');
                        for (const uf of unverifiedFactors) {
                            await supabase.auth.mfa.unenroll({ factorId: uf.id });
                        }
                        const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
                        if (!enrollErr) {
                            setupFactorId = enrollData.id;
                            loginForm.style.display = 'none';
                            mfaSetupForm.style.display = 'block';
                            const qrContainer = document.getElementById('qrcode-container');
                            if (qrContainer) {
                                qrContainer.innerHTML = enrollData.totp.qr_code;
                            }
                        }
                    }
                }
            }

            if (loginForm) {
                // Remove leftover static token if any
                sessionStorage.removeItem('valtti_admin_auth');

                loginForm.onsubmit = async (e) => {
                    e.preventDefault();
                    loginBtn.disabled = true;
                    loginBtn.textContent = 'Kirjaudutaan...';
                    loginErr.style.display = 'none';

                    const u = document.getElementById('username').value.trim();
                    const p = document.getElementById('password').value;
                    
                    const { data, error } = await supabase.auth.signInWithPassword({ email: u, password: p });
                    
                    if (error) {
                        const errMsg = error.message.toLowerCase();
                        if (errMsg.includes('email not confirmed')) {
                            loginErr.textContent = 'Sähköpostiosoitetta ei ole vahvistettu. Tarkista sähköpostistasi vahvistuslinkki.';
                        } else if (errMsg.includes('invalid login credentials')) {
                            loginErr.textContent = 'Virheellinen sähköposti tai salasana.';
                        } else {
                            loginErr.textContent = 'Kirjautuminen epäonnistui: ' + error.message;
                        }

                        loginErr.style.display = 'block';
                        loginBtn.disabled = false;
                        loginBtn.textContent = 'Kirjaudu Sisään';
                        return;
                    }

                    // Check MFA status
                    const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
                    if (factorsErr) {
                        loginErr.textContent = 'MFA-tarkistus epäonnistui.';
                        loginErr.style.display = 'block';
                        return;
                    }

                    const totpFactors = factorsData.totp || [];
                    const verifiedFactor = totpFactors.find(f => f.status === 'verified');

                    if (verifiedFactor) {
                        currentFactorId = verifiedFactor.id;
                        loginForm.style.display = 'none';
                        mfaForm.style.display = 'block';
                    } else {
                        // Unenroll any existing unverified factors to prevent "already exists" errors
                        const unverifiedFactors = totpFactors.filter(f => f.status === 'unverified');
                        for (const uf of unverifiedFactors) {
                            await supabase.auth.mfa.unenroll({ factorId: uf.id });
                        }

                        // Enroll MFA
                        const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
                        if (enrollErr) {
                            loginErr.textContent = 'MFA-asetuksen aloitus epäonnistui: ' + enrollErr.message;
                            loginErr.style.display = 'block';
                            loginBtn.disabled = false;
                            loginBtn.textContent = 'Kirjaudu Sisään';
                            return;
                        }
                        
                        setupFactorId = enrollData.id;
                        loginForm.style.display = 'none';
                        mfaSetupForm.style.display = 'block';

                        const qrContainer = document.getElementById('qrcode-container');
                        if (qrContainer) {
                            qrContainer.innerHTML = enrollData.totp.qr_code;
                        }
                    }
                };
            }

            if (mfaForm) {
                mfaForm.onsubmit = async (e) => {
                    e.preventDefault();
                    verifyMfaBtn.disabled = true;
                    verifyMfaBtn.textContent = 'Vahvistetaan...';
                    mfaErr.style.display = 'none';

                    const code = document.getElementById('mfa-code').value.trim();
                    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: currentFactorId });
                    
                    if (challengeErr) {
                        mfaErr.textContent = 'Väärä koodi tai haasteen luonti epäonnistui.';
                        mfaErr.style.display = 'block';
                        verifyMfaBtn.disabled = false;
                        verifyMfaBtn.textContent = 'Vahvista Koodi';
                        return;
                    }

                    const { data, error } = await supabase.auth.mfa.verify({
                        factorId: currentFactorId,
                        challengeId: challengeData.id,
                        code: code
                    });

                    if (error) {
                        mfaErr.textContent = 'Väärä koodi. Yritä uudelleen.';
                        mfaErr.style.display = 'block';
                        verifyMfaBtn.disabled = false;
                        verifyMfaBtn.textContent = 'Vahvista Koodi';
                    } else {
                        window.location.href = 'projects.html';
                    }
                };
            }

            if (enrollMfaBtn) {
                enrollMfaBtn.onclick = async () => {
                    enrollMfaBtn.disabled = true;
                    enrollMfaBtn.textContent = 'Vahvistetaan...';
                    mfaSetupErr.style.display = 'none';

                    const code = document.getElementById('setup-mfa-code').value.trim();
                    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: setupFactorId });
                    
                    if (challengeErr) {
                        mfaSetupErr.textContent = 'Haasteen luonti epäonnistui.';
                        mfaSetupErr.style.display = 'block';
                        enrollMfaBtn.disabled = false;
                        enrollMfaBtn.textContent = 'Tallenna ja Kirjaudu';
                        return;
                    }

                    const { data, error } = await supabase.auth.mfa.verify({
                        factorId: setupFactorId,
                        challengeId: challengeData.id,
                        code: code
                    });

                    if (error) {
                        mfaSetupErr.textContent = 'Väärä koodi. Yritä uudelleen.';
                        mfaSetupErr.style.display = 'block';
                        enrollMfaBtn.disabled = false;
                        enrollMfaBtn.textContent = 'Tallenna ja Kirjaudu';
                    } else {
                        window.location.href = 'projects.html';
                    }
                };
            }

            return; // Prevent other scripts from running on login page
        }
    }

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
        try {
            // Myytävät kohteet count
            const dashProjectsCount = document.getElementById('dash-projects-count');
            if (dashProjectsCount) {
                const { count, error } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('published', true);
                if (!error) dashProjectsCount.textContent = count || '0';
            }

            // Uudet liidit count & table
            const dashLeadsCount = document.getElementById('dash-leads-count');
            const leadsTbody = document.getElementById('leads-tbody');
            
            if (dashLeadsCount || leadsTbody) {
                const { data: leadsData, error: leadsErr } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
                if (!leadsErr && leadsData) {
                    const newLeads = leadsData.filter(l => l.status === 'UUSI');
                    if (dashLeadsCount) dashLeadsCount.textContent = newLeads.length;

                    if (leadsTbody) {
                        leadsTbody.innerHTML = '';
                        if (leadsData.length === 0) {
                            leadsTbody.innerHTML = '<tr><td colspan="7">Ei yhteydenottopyyntöjä.</td></tr>';
                        } else {
                            leadsData.forEach(lead => {
                                const tr = document.createElement('tr');
                                const d = new Date(lead.created_at);
                                const dateStr = d.toLocaleDateString('fi-FI') + ' ' + d.toLocaleTimeString('fi-FI', {hour: '2-digit', minute:'2-digit'});
                                const statusHtml = lead.status === 'UUSI' 
                                    ? '<span style="background: #ef4444; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">UUSI</span>' 
                                    : '<span style="background: #e5e7eb; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">KÄSITELTY</span>';
                                
                                tr.innerHTML = `
                                    <td>${dateStr}</td>
                                    <td style="font-weight: 500;">${lead.name || '-'}</td>
                                    <td><a href="mailto:${lead.email}">${lead.email}</a></td>
                                    <td><a href="tel:${lead.phone}">${lead.phone || '-'}</a></td>
                                    <td><div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${lead.message}">${lead.message || '-'}</div></td>
                                    <td>${statusHtml}</td>
                                    <td style="text-align: right;">
                                        ${lead.status === 'UUSI' ? `<button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="markLeadHandled('${lead.id}')">Merkitse käsitellyksi</button>` : `<button class="btn btn-outline" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; border-color: #ef4444; color: #ef4444;" onclick="deleteLead('${lead.id}')">Poista</button>`}
                                    </td>
                                `;
                                leadsTbody.appendChild(tr);
                            });
                        }
                    }
                }
            }

            // Page views 7d, 30d, 12m
            const pv7 = document.getElementById('pv-7d');
            const pv30 = document.getElementById('pv-30d');
            const pv12 = document.getElementById('pv-12m');

            if (pv7 && pv30 && pv12) {
                const now = new Date();
                const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
                const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
                const d365 = new Date(now); d365.setDate(d365.getDate() - 365);

                const { data: pvData, error: pvErr } = await supabase.from('page_views').select('created_at').gte('created_at', d365.toISOString());
                
                if (!pvErr && pvData) {
                    let c7=0, c30=0, c365=pvData.length;
                    pvData.forEach(row => {
                        const rowDate = new Date(row.created_at);
                        if (rowDate >= d7) c7++;
                        if (rowDate >= d30) c30++;
                    });
                    
                    pv7.textContent = c7;
                    pv30.textContent = c30;
                    pv12.textContent = c365;
                } else {
                    pv7.textContent = '0'; pv30.textContent = '0'; pv12.textContent = '0';
                }
            }
        } catch (err) {
            console.error("Dashboard fetch err:", err);
        }

        window.markLeadHandled = async (id) => {
            await supabase.from('leads').update({ status: 'KÄSITELTY' }).eq('id', id);
            window.location.reload();
        };

        window.deleteLead = async (id) => {
            if(confirm("Tuhoa kyseinen liidi täysin järjestelmästä?")) {
                await supabase.from('leads').delete().eq('id', id);
                window.location.reload();
            }
        };
    }

    // --- PROJECTS.HTML ---
    const projectsTable = document.getElementById('projects-tbody');
    if (projectsTable) {
        try {
            const { data, error } = await supabase.from('projects').select('id, title, location, status, published, details');
            if (error) throw error;
            
            projectsTable.innerHTML = '';
            if (!data || data.length === 0) {
                projectsTable.innerHTML = '<tr><td colspan="5">Ei kohteita.</td></tr>';
            } else {
                data.sort((a, b) => {
                    const orderA = a.details && a.details['Järjestys'] !== undefined ? parseInt(a.details['Järjestys']) : 999;
                    const orderB = b.details && b.details['Järjestys'] !== undefined ? parseInt(b.details['Järjestys']) : 999;
                    if (orderA !== orderB) return orderA - orderB;
                    return b.id - a.id;
                });

                data.forEach(project => {
                    const row = document.createElement('tr');
                    const statusText = project.status || 'TUNTEMATON';
                    const pubText = project.published ? '<span style="color: green; font-weight: 600;">Kyllä</span>' : '<span style="color: red;">Ei</span>';
                    
                    row.dataset.id = project.id;
                    row.dataset.details = JSON.stringify(project.details || {});
                    
                    row.innerHTML = `
                        <td style="font-weight: 500;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div style="display: flex; flex-direction: column; background: #f9fafb; border: 1px solid var(--border); border-radius: 4px;">
                                    <button class="btn" style="padding: 0.15rem 0.35rem; border: none; font-size: 0.65rem; background: transparent; cursor: pointer; color: var(--text-muted);" onclick="moveProjectRow(this, -1)">&#x25B2;</button>
                                    <div style="height: 1px; background: var(--border); width: 100%;"></div>
                                    <button class="btn" style="padding: 0.15rem 0.35rem; border: none; font-size: 0.65rem; background: transparent; cursor: pointer; color: var(--text-muted);" onclick="moveProjectRow(this, 1)">&#x25BC;</button>
                                </div>
                                ${project.title || '-'}
                            </div>
                        </td>
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

        window.moveProjectRow = (btn, dir) => {
            const row = btn.closest('tr');
            const tbody = row.parentElement;
            if (dir === -1 && row.previousElementSibling) {
                tbody.insertBefore(row, row.previousElementSibling);
                document.getElementById('save-order-btn').style.display = 'block';
            } else if (dir === 1 && row.nextElementSibling) {
                tbody.insertBefore(row.nextElementSibling, row);
                document.getElementById('save-order-btn').style.display = 'block';
            }
        };

        window.saveProjectOrder = async () => {
            const btn = document.getElementById('save-order-btn');
            btn.textContent = 'Tallennetaan...';
            btn.disabled = true;

            const rows = Array.from(document.querySelectorAll('#projects-tbody tr[data-id]'));
            const updates = rows.map((row, index) => {
                const id = row.dataset.id;
                let detailsStr = row.dataset.details || '{}';
                // Handle parsing gracefully in case of malformed injections
                let details;
                try { details = JSON.parse(detailsStr); } catch(e) { details = {}; }
                
                details['Järjestys'] = index + 1;
                return supabase.from('projects').update({ details: details }).eq('id', id);
            });

            try {
                await Promise.all(updates);
                alert("Järjestys tallennettu onnistuneesti!");
                window.location.reload();
            } catch (err) {
                console.error("Order save err:", err);
                alert("Virhe tallennuksessa!");
                btn.textContent = 'Tallenna järjestys';
                btn.disabled = false;
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

        const fileInputs = editProjectForm.querySelectorAll('input[type="file"]');
        const heroInput = fileInputs[0];
        const galleryInput = editProjectForm.querySelector('input[type="file"][multiple]');
        
        let pendingHeroFile = null;
        let existingHeroUrl = '';
        let currentGallery = [];
        let existingProjectDetails = {};

        const heroImgElement = heroInput ? heroInput.parentElement.parentElement.querySelector('img') : null;
        if (heroInput && heroImgElement) {
            heroInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    pendingHeroFile = e.target.files[0];
                    heroImgElement.src = URL.createObjectURL(pendingHeroFile);
                    heroImgElement.style.display = 'block';
                }
            });
        }

        let renderGallery = () => {};
        const galleryParent = galleryInput ? galleryInput.parentElement.parentElement : null;
        const dynamicGalleryContainer = document.createElement('div');

        if (galleryInput && galleryParent) {
            galleryParent.querySelectorAll('div:not(:last-child)').forEach(mock => mock.remove());
            galleryParent.insertBefore(dynamicGalleryContainer, galleryParent.lastElementChild);

            renderGallery = () => {
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
                        url: URL.createObjectURL(file),
                        file: file
                    });
                });
                renderGallery();
            });
        }

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

                    if (data.details && Object.keys(data.details).length > 0) {
                        existingProjectDetails = data.details;
                        setVal(12, data.details["Sijainnin otsikko"] !== undefined ? data.details["Sijainnin otsikko"] : '');
                        setVal(13, data.details["Sijainnin kuvaus"] !== undefined ? data.details["Sijainnin kuvaus"] : '');
                        setVal(14, data.details["Google Maps Embed"] !== undefined ? data.details["Google Maps Embed"] : '');
                        setVal(15, data.details["Tyyppi"] !== undefined ? data.details["Tyyppi"] : '');
                        setVal(16, data.details["Omistusmuoto"] !== undefined ? data.details["Omistusmuoto"] : '');
                        setVal(17, data.details["Huoneistoselitelmä"] !== undefined ? data.details["Huoneistoselitelmä"] : '');
                        setVal(18, data.details["Huoneita"] !== undefined ? data.details["Huoneita"] : '');
                        setVal(19, data.details["Asuintilojen pinta-ala"] !== undefined ? data.details["Asuintilojen pinta-ala"] : '');
                        setVal(20, data.details["Muiden tilojen pinta-ala"] !== undefined ? data.details["Muiden tilojen pinta-ala"] : '');
                        setVal(21, data.details["Kokonaispinta-ala"] !== undefined ? data.details["Kokonaispinta-ala"] : '');
                        setVal(22, data.details["Asuinkerrosten määrä"] !== undefined ? data.details["Asuinkerrosten määrä"] : '');
                        setVal(23, data.details["Rakennusvuosi"] !== undefined ? data.details["Rakennusvuosi"] : '');
                        setVal(24, data.details["Vapautuminen"] !== undefined ? data.details["Vapautuminen"] : '');
                        setVal(25, data.details["Sauna"] !== undefined ? data.details["Sauna"] : '');
                        setVal(26, data.details["Asuntoon kuuluu"] !== undefined ? data.details["Asuntoon kuuluu"] : '');
                        setVal(27, data.details["Kohteen lisätiedot"] !== undefined ? data.details["Kohteen lisätiedot"] : '');
                        setVal(28, data.details["Asunnon kunto"] !== undefined ? data.details["Asunnon kunto"] : '');
                        setVal(29, data.details["Lisätietoa kunnosta"] !== undefined ? data.details["Lisätietoa kunnosta"] : '');
                        setVal(30, data.details["Energialuokka"] !== undefined ? data.details["Energialuokka"] : '');
                        setVal(31, data.details["Vesijohto"] !== undefined ? data.details["Vesijohto"] : '');
                        setVal(32, data.details["Rakennus- ja pintamateriaalit"] !== undefined ? data.details["Rakennus- ja pintamateriaalit"] : '');
                        setVal(33, data.details["Keittiön kuvaus"] !== undefined ? data.details["Keittiön kuvaus"] : '');
                        setVal(34, data.details["Kylpyhuoneen kuvaus"] !== undefined ? data.details["Kylpyhuoneen kuvaus"] : '');
                        setVal(35, data.details["WC-tilojen kuvaus"] !== undefined ? data.details["WC-tilojen kuvaus"] : '');
                        setVal(36, data.details["Saunan kuvaus"] !== undefined ? data.details["Saunan kuvaus"] : '');
                        setVal(37, data.details["Kodinhoitohuoneen kuvaus"] !== undefined ? data.details["Kodinhoitohuoneen kuvaus"] : '');
                        setVal(38, data.details["Olohuoneen kuvaus"] !== undefined ? data.details["Olohuoneen kuvaus"] : '');
                        setVal(39, data.details["Muiden huoneiden kuvaus"] !== undefined ? data.details["Muiden huoneiden kuvaus"] : '');
                        setVal(40, data.details["Tontin omistus"] !== undefined ? data.details["Tontin omistus"] : '');
                        setVal(41, data.details["Kiinteistötunnus"] !== undefined ? data.details["Kiinteistötunnus"] : '');
                        setVal(42, data.details["Tontin pinta-ala"] !== undefined ? data.details["Tontin pinta-ala"] : '');
                        setVal(43, data.details["Rakennusoikeuden pinta-ala"] !== undefined ? data.details["Rakennusoikeuden pinta-ala"] : '');
                        setVal(44, data.details["Tontin vuokraaja"] !== undefined ? data.details["Tontin vuokraaja"] : '');
                        setVal(45, data.details["Tontin vuokra"] !== undefined ? data.details["Tontin vuokra"] : '');
                        setVal(46, data.details["Lisätietoja tontista"] !== undefined ? data.details["Lisätietoja tontista"] : '');
                        setVal(47, data.details["Valmiusaste (%)"] !== undefined ? data.details["Valmiusaste (%)"] : '');
                    }

                    if (data.hero_image && heroImgElement) {
                        existingHeroUrl = data.hero_image;
                        heroImgElement.src = existingHeroUrl;
                        heroImgElement.style.display = 'block';
                    }

                    if (data.gallery_images && Array.isArray(data.gallery_images)) {
                        currentGallery = data.gallery_images.map(url => ({ url: url, file: null }));
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
                    let finalHeroUrl = existingHeroUrl;
                    if (pendingHeroFile) {
                        finalHeroUrl = await uploadToSupabaseStorage(pendingHeroFile);
                    }

                    const finalGallery = [];
                    for (const item of currentGallery) {
                        if (item.file) {
                            finalGallery.push(await uploadToSupabaseStorage(item.file));
                        } else {
                            finalGallery.push(item.url);
                        }
                    }

                    const pubCheck = document.getElementById('published');
                    
                    const projectData = {
                        title: getVal(0),
                        slug: getVal(1) ? getVal(1).toString().trim().toLowerCase().replace(/\s+/g, '-') : '',
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
                        gallery_images: finalGallery,
                        details: {
                            ...existingProjectDetails,
                            "Sijainnin otsikko": getVal(12),
                            "Sijainnin kuvaus": getVal(13),
                            "Google Maps Embed": getVal(14),
                            "Tyyppi": getVal(15),
                            "Omistusmuoto": getVal(16),
                            "Huoneistoselitelmä": getVal(17),
                            "Huoneita": getVal(18),
                            "Asuintilojen pinta-ala": getVal(19),
                            "Muiden tilojen pinta-ala": getVal(20),
                            "Kokonaispinta-ala": getVal(21),
                            "Asuinkerrosten määrä": getVal(22),
                            "Rakennusvuosi": getVal(23),
                            "Vapautuminen": getVal(24),
                            "Sauna": getVal(25),
                            "Asuntoon kuuluu": getVal(26),
                            "Kohteen lisätiedot": getVal(27),
                            "Asunun kunto": getVal(28),
                            "Lisätietoa kunnosta": getVal(29),
                            "Energialuokka": getVal(30),
                            "Vesijohto": getVal(31),
                            "Rakennus- ja pintamateriaalit": getVal(32),
                            "Keittiön kuvaus": getVal(33),
                            "Kylpyhuoneen kuvaus": getVal(34),
                            "WC-tilojen kuvaus": getVal(35),
                            "Saunan kuvaus": getVal(36),
                            "Kodinhoitohuoneen kuvaus": getVal(37),
                            "Olohuoneen kuvaus": getVal(38),
                            "Muiden huoneiden kuvaus": getVal(39),
                            "Tontin omistus": getVal(40),
                            "Kiinteistötunnus": getVal(41),
                            "Tontin pinta-ala": getVal(42),
                            "Rakennusoikeuden pinta-ala": getVal(43),
                            "Tontin vuokraaja": getVal(44),
                            "Tontin vuokra": getVal(45),
                            "Lisätietoja tontista": getVal(46),
                            "Valmiusaste (%)": getVal(47)
                        }
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

    // --- EDIT-PAGE.HTML (Dynamic CMS) ---
    const editPageForm = document.getElementById('edit-page-form');
    if (path.includes('edit-page.html') && editPageForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const pageSlug = urlParams.get('slug');
        if (!pageSlug) {
            alert('Virheellinen sivu (slug puuttuu)');
            window.location.href = 'pages.html';
            return;
        }

        document.getElementById('page-title').textContent = 'Sivun muokkaus: ' + pageSlug;

        const container = document.getElementById('dynamic-fields-container');
        let currentContent = {};
        let pendingFiles = {}; // Store Map of key -> File object for uploads

        try {
            // First, try loading existing from Supabase
            const { data, error } = await supabase.from('pages').select('content').eq('slug', pageSlug).maybeSingle();
            
            const defaultSchemas = {
                'index': {
                    "Hero Taustakuva": "",
                    "Hero Otsikko": "Enemmän kuin talo.",
                    "Hero Teksti": "Rakennamme laadukkaita, kustannustehokkaita ja tyylikkäitä skandinaavisia koteja elämän kaikkiin vaiheisiin.",
                    "Tunnelaatikko Otsikko": "Koti on tunne.",
                    "Tunnelaatikko Teksti": "Se on paikka, jossa hengähdät syvään. Valttikodit suunnitellaan todellista elämää varten.",
                    "Tunnelaatikko Lainaus": "Emme rakenna vain neliöitä, vaan puitteet hyvälle elämälle.",
                    "Tunnelaatikko Kuva": "",
                    "Palvelut Otsikko": "Lähtökohtana kestävä asuminen",
                    "Palvelut Teksti": "Haluamme suunnitella ja toteuttaa kauniita ja fiksuja pientaloja...",
                    "Palvelu 1 Otsikko": "Yksilöllinen Suunnittelu",
                    "Palvelu 1 Teksti": "Ammattilaiset muokkaavat mallistomme kodit tonttisi ja toiveidesi mukaan.",
                    "Palvelu 2 Otsikko": "Laadukas Rakentaminen",
                    "Palvelu 2 Teksti": "Omat, luotettavat asentajamme ja tarkoin valitut kumppanit takaavat teknisen laadun ja pysyvyyden.",
                    "Palvelu 3 Otsikko": "Projektinjohto",
                    "Palvelu 3 Teksti": "Hoidamme luvat, kilpailutukset ja aikataulutuksen. Sinulle jää vain päätöksenteko.",
                    "Kohteet Otsikko": "Myytävät kohteet",
                    "Kohteet Teksti": "Löydä uusi kotisi huolella valituista kohteistamme.",
                    "Keskustelu Otsikko": "Aloitetaan keskustelu",
                    "Keskustelu Teksti": "Haluatko kuulla lisää? Lupaamme rennon jutteluhetken ilman myyntipuheita.",
                    "Alatunniste: Osoite": "Kotkansiipi 18",
                    "Alatunniste: Postitoimipaikka": "91900 Liminka",
                    "Alatunniste: Sähköposti": "info@valttikodit.fi",
                    "Alatunniste: Puhelinnumero": "040 123 4567",
                    "Alatunniste: Instagram-linkki": "",
                    "Alatunniste: Facebook-linkki": "",
                    "Alatunniste: LinkedIn-linkki": ""
                },
                'valtti-tapa': {
                    "Tarinamme Otsikko": "Valtti-tapa",
                    "Tarinamme Ingressi": "Kotimme rakennetaan kestämään elämää, aikaa ja katseita...",
                    "Tarinan Kuva": "",
                    "Ensimmäinen Otsikko": "Asiakaskeskeisyys",
                    "Ensimmäinen Teksti": "Tavoitteenamme ei ole vain rakentaa taloa, vaan rakentaa koti juuri sinun tarpeisiisi...",
                    "Toinen Otsikko": "Laatu ja Ekologisuus",
                    "Toinen Teksti": "Hyödynnämme moderneja teknologioita ja ekologisia rakennustapoja...",
                    "Kolmas Otsikko": "Turvallisuus",
                    "Kolmas Teksti": "Olemme sitoutuneet laadukkaaseen rakentamiseen kaikissa vaiheissa..."
                },
                'yhteys': {
                    "Otsikko": "Ota yhteyttä",
                    "Kuvaus": "Oletko kiinnostunut Valttikodeista? Jätä viesti tai soita meille...",
                    "Yhteystiedot Otsikko": "Myynti ja tiedustelut",
                    "Osoite": "Valttikodit Oy\nKotkansiipi 18\n91900 Liminka",
                    "Sähköposti": "info@valttikodit.fi",
                    "Puhelinnumero": "040 123 4567",
                    "Lomake Otsikko": "Jätä yhteydenottopyyntö"
                }
            };

            const baseSchema = defaultSchemas[pageSlug] || {};

            if (data && data.content && Object.keys(data.content).length > 0) {
                // Yhdistetään tietokannan vanha data ja uudet HTML-puolella näkyvät kenttäavaimet.
                currentContent = { ...baseSchema, ...data.content };
            } else {
                currentContent = baseSchema;
                await supabase.from('pages').insert([{ slug: pageSlug, content: currentContent }]);
            }
            
            container.innerHTML = '';
            
            // Build dynamic fields based on keys
            Object.keys(currentContent).forEach(key => {
                const val = currentContent[key] || '';
                const isImage = key.toLowerCase().includes('kuva') || key.toLowerCase().includes('image') || val.startsWith('http');
                const isLargeText = val.length > 50 || key.toLowerCase().includes('teksti');
                
                const group = document.createElement('div');
                group.className = 'form-group mb-4';
                group.innerHTML = `<label class="form-label">${key}</label>`;
                
                if (isImage) {
                    group.innerHTML += `
                        <div style="display: flex; align-items: flex-start; gap: 1rem;">
                            <img src="${val}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border); ${!val && 'display:none;'}">
                            <div>
                                <input type="file" class="form-input mb-2 dynamic-file-input" data-key="${key}" accept="image/*">
                            </div>
                        </div>
                    `;
                } else if (isLargeText) {
                    group.innerHTML += `<textarea class="form-input dynamic-text-input" data-key="${key}" rows="4">${val}</textarea>`;
                } else {
                    group.innerHTML += `<input type="text" class="form-input dynamic-text-input" data-key="${key}" value="${val}">`;
                }
                
                container.appendChild(group);
            });

            // Attach listeners to file inputs for preview
            container.querySelectorAll('.dynamic-file-input').forEach(fileInput => {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        const file = e.target.files[0];
                        pendingFiles[fileInput.dataset.key] = file;
                        const imgEl = fileInput.parentElement.parentElement.querySelector('img');
                        imgEl.src = URL.createObjectURL(file);
                        imgEl.style.display = 'block';
                    }
                });
            });

        } catch(err) {
            console.error(err);
            container.innerHTML = '<p style="color:red;">Virhe ladattaessa sivun CMS tietoja.</p>';
        }

        const saveBtn = editPageForm.querySelector('#save-page-btn');
        if (saveBtn) {
            editPageForm.onsubmit = async (e) => {
                e.preventDefault();
                saveBtn.textContent = 'Tallennetaan...';
                saveBtn.disabled = true;

                try {
                    // Update text values
                    container.querySelectorAll('.dynamic-text-input').forEach(input => {
                        currentContent[input.dataset.key] = input.value;
                    });

                    // Upload pending files
                    for (const key of Object.keys(pendingFiles)) {
                        const newUrl = await uploadToSupabaseStorage(pendingFiles[key]);
                        if (newUrl) {
                            currentContent[key] = newUrl;
                        }
                    }

                    const { error } = await supabase.from('pages').update({ content: currentContent }).eq('slug', pageSlug);
                    if (error) throw error;

                    alert('Sivun tiedot päivitetty onnistuneesti!');
                    // window.location.href = 'pages.html'; // Optionally redirect
                } catch(err) {
                    alert('Tallennus epäonnistui: ' + err.message);
                } finally {
                    saveBtn.textContent = 'Tallenna muutokset';
                    saveBtn.disabled = false;
                }
            };
        }
    }
});

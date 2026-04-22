// assets/js/analytics-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
    // Varmistetaan että Supabase on alustettu (admin.js latautuu myös, mutta ollaan varmoja)
    const SUPABASE_URL = 'https://xbeonksexpjvekqjxoph.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn';
    let supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    if (!supabase) {
        console.error("Supabase not found.");
        return;
    }

    // Chart-instanssit (jotta voidaan tupsauttaa uusi data päälle kun aikaväli vaihtuu)
    let trendChartObj = null;
    let sourceChartObj = null;
    let deviceChartObj = null;

    const dateSelect = document.getElementById('date-range');
    
    // Alustus
    loadAnalyticsData(parseInt(dateSelect.value));

    dateSelect.addEventListener('change', (e) => {
        loadAnalyticsData(parseInt(e.target.value));
    });

    async function loadAnalyticsData(days) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        const isoStart = startDate.toISOString();
        const isoEnd = endDate.toISOString();

        try {
            // Hae sivukatselut täydellisenä (Sivutusta käyttäen ohittaen 1000 rivin rajan)
            let views = [];
            let from = 0;
            const pageSize = 1000;
            while(true) {
                const { data, error } = await supabase
                    .from('page_views')
                    .select('*')
                    .gte('created_at', isoStart)
                    .lte('created_at', isoEnd)
                    .range(from, from + pageSize - 1);
                
                if (error) {
                    console.warn('Page views fetch err:', error);
                    break;
                }
                if (!data || data.length === 0) break;
                
                views = views.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }

            // Hae konversiot (Liidit)
            let newLeads = [];
            from = 0;
            while(true) {
                const { data, error } = await supabase
                    .from('leads')
                    .select('created_at')
                    .gte('created_at', isoStart)
                    .lte('created_at', isoEnd)
                    .range(from, from + pageSize - 1);
                
                if (error) break;
                if (!data || data.length === 0) break;
                
                newLeads = newLeads.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }

            // 1. KPI LASKENTA
            const uniqueSessions = new Set(views.map(v => v.session_id)).size;
            const totalViews = views.length;
            const totalConversions = newLeads.length;

            // Engagement: Montako sivua per sessio katsottu (jos vain 1 sivu = bounce, jos > 1 = engagement)
            let highEngagementSessions = 0;
            const sessionsMap = {};
            views.forEach(v => {
                if(!sessionsMap[v.session_id]) sessionsMap[v.session_id] = 0;
                sessionsMap[v.session_id]++;
            });
            Object.values(sessionsMap).forEach(count => {
                if (count > 1) highEngagementSessions++;
            });
            const engRate = uniqueSessions > 0 ? Math.round((highEngagementSessions / uniqueSessions) * 100) : 0;

            document.getElementById('kpi-visitors').textContent = uniqueSessions;
            document.getElementById('kpi-pageviews').textContent = totalViews;
            document.getElementById('kpi-conversions').textContent = totalConversions;
            document.getElementById('kpi-engagement').textContent = engRate + '%';

            // 2. KÄVIJÄTRENDI (Group by date)
            const dateMap = {};
            for(let i=0; i <= days; i++) {
                let d = new Date(startDate);
                d.setDate(d.getDate() + i);
                const dStr = d.toISOString().split('T')[0];
                dateMap[dStr] = 0;
            }
            views.forEach(v => {
                const dStr = v.created_at.split('T')[0];
                if(dateMap[dStr] !== undefined) dateMap[dStr]++;
            });
            
            const labels = Object.keys(dateMap);
            const dataPoints = Object.values(dateMap);

            if(trendChartObj) trendChartObj.destroy();
            const ctxTrend = document.getElementById('trendChart').getContext('2d');
            trendChartObj = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Sivulataukset',
                        data: dataPoints,
                        borderColor: '#121212',
                        backgroundColor: 'rgba(18, 18, 18, 0.1)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });

            // 3. LIIKENTEEN LÄHTEET (Referrer)
            const srcMap = { 'Google': 0, 'Suora / Tuntematon': 0, 'Facebook/Instagram': 0, 'Muut': 0 };
            views.forEach(v => {
                let ref = (v.referrer || '').toLowerCase();
                if (ref.includes('google')) srcMap['Google']++;
                else if (ref.includes('facebook') || ref.includes('instagram')) srcMap['Facebook/Instagram']++;
                else if (ref === 'suora' || ref === '' || ref === 'sisäinen') srcMap['Suora / Tuntematon']++;
                else srcMap['Muut']++;
            });

            if(sourceChartObj) sourceChartObj.destroy();
            const ctxSrc = document.getElementById('sourceChart').getContext('2d');
            sourceChartObj = new Chart(ctxSrc, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(srcMap),
                    datasets: [{
                        data: Object.values(srcMap),
                        backgroundColor: ['#4ade80', '#94a3b8', '#3b82f6', '#fcd34d']
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false
                }
            });

            // 4. LAITTEET (Device Type)
            const devMap = { 'Mobiili': 0, 'Desktop': 0, 'Tabletti': 0 };
            views.forEach(v => {
                let d = v.device_type || 'Desktop';
                if(devMap[d] !== undefined) devMap[d]++;
                else devMap['Desktop']++; // Fallback
            });

            if(deviceChartObj) deviceChartObj.destroy();
            const ctxDev = document.getElementById('deviceChart').getContext('2d');
            deviceChartObj = new Chart(ctxDev, {
                type: 'pie',
                data: {
                    labels: Object.keys(devMap),
                    datasets: [{
                        data: Object.values(devMap),
                        backgroundColor: ['#ec4899', '#10b981', '#f59e0b']
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false
                }
            });

            // 5. SUOSITUIMMAT SIVUT
            const pathMap = {};
            views.forEach(v => {
                // Filtteröidään admin-sivut pois jos niitä vahingossa kertyy
                if (!v.path.includes('/admin/')) {
                    if(!pathMap[v.path]) pathMap[v.path] = 0;
                    pathMap[v.path]++;
                }
            });

            const topPages = Object.entries(pathMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
            const ul = document.getElementById('top-pages-list');
            ul.innerHTML = '';
            
            if (topPages.length === 0) {
                ul.innerHTML = '<li><span>Ei dataa vielä.</span></li>';
            } else {
                topPages.forEach(([path, count]) => {
                    const li = document.createElement('li');
                    
                    let pName = 'Sivu';
                    if (path.includes('index.html') || path === '/' || path === '') {
                        pName = 'Etusivu';
                    } else if (path.includes('kohde.html')) {
                        const urlParams = new URLSearchParams(path.split('?')[1] || '');
                        const kVal = urlParams.get('kohde');
                        pName = kVal ? 'Kohde: ' + kVal.replace(/-/g, ' ') : 'Kohteen sivu';
                        pName = pName.charAt(0).toUpperCase() + pName.slice(1);
                    } else if (path.includes('kohteet.html') || path.includes('/kohteet')) {
                        pName = 'Kaikki Kohteet';
                    } else if (path.includes('tarinamme.html') || path.includes('/tarinamme')) {
                        pName = 'Tarinamme';
                    } else if (path.includes('yhteystiedot.html')) {
                        pName = 'Yhteystiedot';
                    } else {
                        pName = path.split('?')[0].replace(/\//g, '').replace('.html', '');
                        if (pName.length > 0) pName = pName.charAt(0).toUpperCase() + pName.slice(1);
                    }
                    
                    const percentage = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
                    li.innerHTML = `<span><strong>${pName}</strong> <small style="display:block; color: #6b7280; margin-top:2px; font-family:monospace;">${path}</small></span><span style="white-space:nowrap; margin-left:1rem;">${count} katselua (${percentage}%)</span>`;
                    ul.appendChild(li);
                });
            }

            // 6. DATAPOHJAISET SUOSITUKSET
            const recContainer = document.getElementById('analytics-recommendations');
            if (recContainer) {
                recContainer.innerHTML = '';
                const recs = [];

                // Liikenteen määrä
                if (uniqueSessions < 50) {
                    recs.push({ title: 'Lisää kävijäliikennettä sivustolle', text: 'Tällä aikavälillä on ollut melko vähän (" + uniqueSessions + ") uniikkeja kävijöitä. Keskitä ponnistelut markkinointiin (esim. Facebook/Instagram-mainonta tai laadukkaat lehti-ilmoitukset) saadaksesi lisää potentiaalisia kohderyhmäläisiä sivuille.', color: '#3b82f6' });
                }

                // Konvertoitavuus
                if (uniqueSessions > 100 && totalConversions === 0) {
                    recs.push({ title: 'Paranna konversio-astetta', text: 'Sivustolla käy ihmisiä, mutta yhteydenottoja tai varauksia ei ole syntynyt. Harkitse sivuston rakenteen keventämistä, varmista että esitteen lataus tai yhteydenotto käy vaivattomasti ("Varaa kohde" -painikkeet erottuvat).', color: '#f59e0b' });
                } else if (totalConversions > 0) {
                    const convRate = (totalConversions / uniqueSessions) * 100;
                    if (convRate > 5) {
                        recs.push({ title: 'Erinomainen löytöaste!', text: `Sivuston konversio toimii tällä hetkellä erinomaisesti (${convRate.toFixed(1)}%). Jatka samalla strategialla ja pyri skaalaamaan nimenomaan nykyisten parhaiden liikenteen lähteiden volyymia.`, color: '#10b981' });
                    } else if (convRate < 1) {
                         recs.push({ title: 'Matala konversioaste', text: `Konversioasteesi on todella matala (${convRate.toFixed(1)}%). Varmista ydinviestin selkeys ja kokeile nostaa asunnon pohjapiirustus tai kuvagalleria heti näkyvämmälle paikalle.`, color: '#f59e0b' });
                    }
                }

                // Sitoutuminen
                if (engRate < 20 && uniqueSessions > 30) {
                    recs.push({ title: 'Sitouta kävijöitä selaamaan pidemmälle', text: 'Iso osa kävijöistä näyttää poistuvan katsottuaan vain yhtä sivua (korkea välitön poistuminen tai "bounce rate"). Varmista, että etusivulta ja artikkeleista on selkeät "Lue lisää" johdatukset uusiin kohteisiin.', color: '#ec4899' });
                }

                // Laitteet
                const mobShare = devMap['Mobiili'] ? (devMap['Mobiili'] / totalViews) : 0;
                if (mobShare > 0.6) {
                    recs.push({ title: 'Mobiilikokemuksen tärkeys', text: `Yli ${(mobShare*100).toFixed(0)}% liikenteestä tulee mobiililaitteilla. Varmista puhelimellasi, että kohteiden kuvat ovat selkeitä pienelläkin ruudulla ja nappien klikkaaminen peukalolla on helppoa.`, color: '#6366f1' });
                }

                // SEO Google
                const seoShare = srcMap['Google'] ? (srcMap['Google'] / totalViews) : 0;
                if (seoShare < 0.15 && totalViews > 50) {
                    recs.push({ title: 'Orgaanisen haun parantaminen (Hakukoneoptimointi)', text: 'Pieni osa liikenteestä tulee Googlen kautta. Kannattaa varmistaa "Sivut"-paneelista, että tekstisisällöissä mainitaan vahvasti paikkakunnat ja asuntotyypit (esim. "uudiskohde Raahe", "rivitalo kaupunginosa"), joita ihmiset etsivät.', color: '#8b5cf6' });
                }

                if (recs.length === 0) {
                    recs.push({ title: 'Perusmetriikat tasapainossa', text: 'Tämän datan perusteella analytiikan laatu vaikuttaa erinomaiselta. Jatka laadukkaan sisällön tuottamista ja seuraa tilannetta viikottain.', color: '#10b981' });
                }

                recs.forEach(r => {
                    const el = document.createElement('div');
                    el.style.cssText = `padding: 1.25rem; background: ${r.color}15; border-left: 4px solid ${r.color}; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);`;
                    el.innerHTML = `<strong style="display:block; color: ${r.color}; margin-bottom: 0.35rem; font-size: 0.95rem;">${r.title}</strong><span style="font-size: 0.875rem; color: #4b5563; line-height: 1.6; display:block;">${r.text}</span>`;
                    recContainer.appendChild(el);
                });
            }

        } catch (globalErr) {
            console.error("Dashboard render err:", globalErr);
        }
    }
});

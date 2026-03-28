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
            // Hae sivukatselut
            const { data: pageViews, error: pvError } = await supabase
                .from('page_views')
                .select('*')
                .gte('created_at', isoStart)
                .lte('created_at', isoEnd);

            if (pvError) {
                console.warn('Page views fetch err (Table might not exist yet):', pvError);
            }

            // Hae konversiot (Liidit)
            const { data: leads, error: leadError } = await supabase
                .from('leads')
                .select('created_at')
                .gte('created_at', isoStart)
                .lte('created_at', isoEnd);

            const views = pageViews || [];
            const newLeads = leads || [];

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
                    let pName = path.replace('.html', '').replace('/', '');
                    if(!pName || pName === '') pName = 'Etusivu';
                    const percentage = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
                    
                    li.innerHTML = `<span><strong>${pName}</strong> <small style="color: #6b7280; margin-left:8px;">${path}</small></span><span>${count} katselua (${percentage}%)</span>`;
                    ul.appendChild(li);
                });
            }

        } catch (globalErr) {
            console.error("Dashboard render err:", globalErr);
        }
    }
});

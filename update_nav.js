const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'admin');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'login.html');

const ACTIVE = {
    'dashboard.html': 'dashboard.html',
    'projects.html': 'projects.html', 'edit-project.html': 'projects.html',
    'references.html': 'references.html', 'edit-reference.html': 'references.html',
    'social.html': 'social.html',
    'pages.html': 'pages.html', 'edit-page.html': 'pages.html', 'edit-index.html': 'pages.html',
    'users.html': 'users.html',
    'analytics.html': 'analytics.html'
};
const ITEMS = [
    ['dashboard.html', 'Liidit<span id="unread-leads-badge" style="display:none; color:#ef4444; font-weight:600; margin-left:4px;"></span>'],
    ['projects.html', 'Kohteet'],
    ['references.html', 'Referenssit'],
    ['social.html', 'Some'],
    ['pages.html', 'Sivut'],
    ['users.html', 'Käyttäjät'],
    ['analytics.html', 'Analytiikka']
];

for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const active = ACTIVE[file] || '';

    // Koko sivupalkki kerralla: admin.js lisää sähköpostin alle uloskirjautumislinkin
    const aside = `<aside class="admin-sidebar" id="sidebar">
        <div class="admin-brand">Valttikodit Admin</div>
        <nav class="admin-nav">
${ITEMS.map(([href, label]) => `            <a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`).join('\n')}
        </nav>
        <div style="padding: 1rem; border-top: 1px solid var(--border);">
            <div id="sidebar-user-email"
                style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                Ladataan...</div>
        </div>
    </aside>`;

    const newContent = content.replace(/<aside class="admin-sidebar"[^>]*>[\s\S]*?<\/aside>/, aside);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated ${file}`);
}

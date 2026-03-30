const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'admin');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'login.html');

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Määritetään kunkin sivun "active" luokka
    let activeItem = '';
    if (file === 'dashboard.html') activeItem = 'dashboard.html';
    else if (file === 'projects.html' || file === 'edit-project.html') activeItem = 'projects.html';
    else if (file === 'pages.html' || file === 'edit-page.html' || file === 'edit-index.html') activeItem = 'pages.html';
    else if (file === 'users.html') activeItem = 'users.html';
    else if (file === 'analytics.html') activeItem = 'analytics.html';

    const cleanNav = `<nav class="admin-nav">
            <a href="dashboard.html"${activeItem === 'dashboard.html' ? ' class="active"' : ''}>Liidit</a>
            <a href="projects.html"${activeItem === 'projects.html' ? ' class="active"' : ''}>Kohteet</a>
            <a href="pages.html"${activeItem === 'pages.html' ? ' class="active"' : ''}>Sivut</a>
            <a href="users.html"${activeItem === 'users.html' ? ' class="active"' : ''}>Käyttäjät</a>
            <a href="analytics.html"${activeItem === 'analytics.html' ? ' class="active"' : ''}>Analytiikka</a>
        </nav>`;

    // Replace the existing nav completely using Regex
    const newContent = content.replace(/<nav class="admin-nav">[\s\S]*?<\/nav>/, cleanNav);
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated ${file}`);
}

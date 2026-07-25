const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Audio QR', short_name: 'Audio QR', start_url: './index.html',
  display: 'standalone', background_color: '#f6f7f9', theme_color: '#2783de'
}, null, 2));
console.log('Web assets prepared in www/');

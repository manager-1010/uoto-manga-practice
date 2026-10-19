const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'assets.js', 'reader.js', 'motion.js', 'spread.css','pages.css']) fs.copyFileSync(path.join(root, file), path.join(dist, file));
fs.cpSync(path.join(root, 'public'), path.join(dist, 'public'), { recursive: true });
console.log('Built dist/ with local assets. No dependency installation required.');

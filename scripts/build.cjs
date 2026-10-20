const fs = require('node:fs');
const path = require('node:path');
const {renderTranslations} = require('./translations.cjs');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;
const staging=path.join(root,'.dist-staging-'+stamp);
const archive=path.join(root,'.build-history',stamp);
for(const target of [dist,staging,archive])if(!path.resolve(target).startsWith(root+path.sep))throw new Error('Build path must stay inside project.');
fs.writeFileSync(path.join(root,'content/translations.js'),renderTranslations(root));
fs.mkdirSync(staging, { recursive: true });
for (const file of ['index.html','style.css','app.js','assets.js','reader.js','motion.js','spread.css','pages.css','book-text.js','i18n.js','i18n.css']) fs.copyFileSync(path.join(root,file),path.join(staging,file));
fs.cpSync(path.join(root,'public'),path.join(staging,'public'),{recursive:true});
fs.mkdirSync(path.join(staging,'content'),{recursive:true});
fs.copyFileSync(path.join(root,'content/translations.js'),path.join(staging,'content/translations.js'));
if(fs.existsSync(dist)){fs.mkdirSync(path.dirname(archive),{recursive:true});fs.renameSync(dist,archive);}
try{fs.renameSync(staging,dist);}catch(error){if(!fs.existsSync(dist)&&fs.existsSync(archive))fs.renameSync(archive,dist);throw error;}
console.log('Built dist with the manga reader and three-language lettering.');

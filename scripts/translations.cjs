'use strict';
const fs=require('node:fs');
const path=require('node:path');
const languages=['zh-Hant','en','ja'];
function loadTranslations(root=path.resolve(__dirname,'..')){
 const data=JSON.parse(fs.readFileSync(path.join(root,'content/translations.json'),'utf8'));
 if(data.schemaVersion!==1||data.defaultLocale!=='zh-Hant')throw new Error('Unsupported translation schema');
 for(const book of ['100m','orb']){
  const links=data.purchaseLinks?.[book];
  if(!links?.ja||typeof links.ja!=='string')throw new Error('Missing Japanese purchase fallback: '+book);
  for(const lang of languages){
   const value=links[lang];if(value===undefined||value==='')continue;
   let address;try{address=new URL(value);}catch{throw new Error('Invalid purchase link: '+book+'/'+lang);}
   if(typeof value!=='string'||address.protocol!=='https:'||!address.hostname)throw new Error('Purchase links must use HTTPS: '+book+'/'+lang);
  }
 }
 const ids=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/data-book-text="(p\d+-t\d+)"/g)].map(m=>m[1]);
 ids.push(...['perseverance','giving-up','confidence','goal','reality'].map(w=>'word-'+w));
 for(const lang of languages){
  const locale=data.locales[lang];if(!locale?.texts||!locale.ui)throw new Error('Missing locale '+lang);
  if(Object.keys(locale.texts).length!==ids.length||ids.some(id=>typeof locale.texts[id]!=='string'||locale.texts[id].length>5000))throw new Error('Incomplete text catalogue: '+lang);
  for(const [key,value]of Object.entries(locale.ui))if(typeof value!=='string'||value.length>5000)throw new Error('Invalid interface copy '+lang+':'+key);
 }
 return data;
}
function renderTranslations(root){return '/* Generated from content/translations.json. Public copy only. */\nwindow.MANGA_TRANSLATIONS = '+JSON.stringify(loadTranslations(root)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+';\n';}
if(require.main===module){const root=path.resolve(__dirname,'..');fs.writeFileSync(path.join(root,'content/translations.js'),renderTranslations(root));console.log('Validated three languages and generated public translations.');}
module.exports={loadTranslations,renderTranslations};

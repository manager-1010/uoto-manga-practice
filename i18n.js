/* A small data-only language layer. The original reader, art and animations stay alive. */
(() => {
 'use strict';
 const data=window.MANGA_TRANSLATIONS,api=window.mangaText;
 if(!data||!api)return;
 // The private editor intentionally keeps its original English baseline and
 // stable IDs. It must not save a rendered translation over the source copy.
 if(window.frameElement?.id==='book-source')return;
 const langs=['zh-Hant','en','ja'],chapters=['opening','works','orb','characters','words','quotation','ending'];
 const rawApply=api.apply,rawSelectWord=api.selectWord;
 const originals=new Map(api.catalog().map(entry=>[entry.id,entry]));
 const sourceLeaves=[...document.querySelectorAll('#comic-book>.leaf')];
 const originalTitles=sourceLeaves.map(leaf=>leaf.dataset.title);
 const normalize=text=>String(text).replace(/\s+/g,' ').trim();
 let locale='zh-Hant',saved=window.MANGA_PAGE6_EDITS?.texts||{},currentWord='perseverance';
 try{const requested=new URLSearchParams(location.search).get('lang'),remembered=localStorage.getItem('manga-reader-language');locale=langs.includes(requested)?requested:langs.includes(remembered)?remembered:data.defaultLocale;}catch{}
 function merged(){
  const result={};
  for(const [id,text]of Object.entries(data.locales[locale].texts)){
   const edit=saved[id],entry=originals.get(id);
   // Existing manual copy survives. Differences that are only line wrapping
   // keep the locale's authored line breaks, while all saved styles survive.
   let value=edit&&normalize(edit.text)!==normalize(entry?.text)?edit.text:text;
   if(id==='p6-t03'&&!edit){const legacy=window.MANGA_PAGE6_EDITS?.text?.text;if(legacy&&normalize(legacy)!==normalize(entry?.text))value=legacy;}
   result[id]={text:value,style:{...(edit?.style||{})}};
  }
  return result;
 }
 api.apply=texts=>{saved=texts&&typeof texts==='object'?texts:{};return rawApply(merged());};
 api.selectWord=word=>{const result=rawSelectWord(word);if(result)currentWord=word;return result;};
 const q=selector=>document.querySelector(selector);
 function text(selector,value){const node=q(selector);if(node)node.textContent=value;}
 function label(selector,key){const node=q(selector);if(node)node.setAttribute('aria-label',data.locales[locale].ui[key]);}
 function nodeText(node,value){if(node)node.textContent=value;}
 function control(selector,value,icon,after=false){const node=q(selector);if(!node)return;const span=node.querySelector('span');node.replaceChildren(...(after?[document.createTextNode(value+' '),span]:[span,document.createTextNode(' '+value)]).filter(Boolean));}
 function syncInterface(){
  const ui=data.locales[locale].ui;
  document.querySelectorAll('[data-purchase-book]').forEach(link=>{
   const destinations=data.purchaseLinks?.[link.dataset.purchaseBook];
   const href=destinations?.[locale]||destinations?.ja;
   if(href)link.href=href;
  });
  document.documentElement.lang=locale;document.title=ui.title;
  q('meta[name="description"]')?.setAttribute('content',ui.description);
  text('.reader-brand>span',ui.brand);text('.skip-link',ui.skip);
  const toggle=q('.contents-toggle');if(toggle){const icon=toggle.querySelector('span');toggle.replaceChildren(document.createTextNode(ui.contents+' '),icon);}
  for(const [i,id]of chapters.entries()){
   const link=q('#contents>a[href="#'+id+'"]');if(link){const number=link.querySelector('span');link.replaceChildren(number,document.createTextNode(' '+ui['chapter-'+id]));}
  }
  sourceLeaves.forEach((leaf,index)=>{const chapter=chapters.find(id=>data.locales.en.ui['chapter-'+id]===originalTitles[index]);if(chapter)leaf.dataset.title=ui['chapter-'+chapter];leaf.setAttribute('aria-label',ui.page+' '+(index+1)+': '+(leaf.dataset.title||''));});
  control('.page-prev',ui.previous,'←');control('.page-next',ui.next,'→',true);
  text('.reading-hint',ui.hint);text('.motion-replay',ui.replay);text('.colophon summary',ui.credits);
  label('#contents','contents');label('.reader','reader');label('.book-stage','stage');label('.reader-controls','controls');label('.word-panels','choose');label('.page-prev','previous');label('.page-next','next');
  const footer=[...document.querySelectorAll('.colophon>p')];for(let n=0;n<footer.length;n++)nodeText(footer[n],ui['footer-'+n]);
  document.querySelectorAll('.colophon [data-credit-note]').forEach(node=>nodeText(node,ui[node.dataset.creditNote]));
  document.querySelectorAll('.colophon [data-music-copy]').forEach(node=>nodeText(node,ui[node.dataset.musicCopy]));
  q('.music-credit')?.setAttribute('aria-label',ui['music-heading']);
  const licence=q('.colophon [data-credit-license]');
  if(licence){const anchor=licence.querySelector('a');licence.replaceChildren(document.createTextNode(ui['note-4-prefix']),anchor,document.createTextNode(ui['note-4-suffix']));}
  text('.noscript-message',ui.noscript);
  document.querySelectorAll('.sr-only').forEach(node=>{if(node.closest('.publisher-link'))node.textContent=ui.newtab;});
  document.querySelectorAll('.art-fallback').forEach(node=>{node.textContent=ui.art;});
  document.querySelectorAll('.language-switch button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.locale===locale)));
  q('.language-switch')?.setAttribute('aria-label',ui.language);
  // Accessibility descriptions do not change the image, crop or source file.
  document.querySelectorAll('.selection-art-description').forEach(node=>node.textContent=ui['art-'+currentWord]);
  document.querySelectorAll('.art-image').forEach(img=>{if(!img.dataset.originalAlt)img.dataset.originalAlt=img.alt;img.alt=locale==='en'?img.dataset.originalAlt:ui.art;});
  window.dispatchEvent(new CustomEvent('manga:languagechange',{detail:{locale}}));
 }
 function setLocale(value,{persist=true}={}){
  if(!langs.includes(value))return false;locale=value;
  rawApply(merged());rawSelectWord(currentWord);syncInterface();
  if(persist)try{localStorage.setItem('manga-reader-language',locale);}catch{}
  return true;
 }
 const switcher=document.createElement('div');switcher.className='language-switch';switcher.setAttribute('role','group');
 for(const [id,name]of [['zh-Hant','繁中'],['en','EN'],['ja','日本語']]){const button=document.createElement('button');button.type='button';button.dataset.locale=id;button.lang=id;button.textContent=name;button.addEventListener('click',()=>setLocale(id));switcher.append(button);}
 q('.reader-header').insertBefore(switcher,q('.contents-toggle'));
 document.addEventListener('click',event=>{if(event.target.closest('[data-word]'))queueMicrotask(syncInterface);});
 window.mangaI18n={setLocale,getLocale:()=>locale,getLocales:()=>[...langs]};
 setLocale(locale,{persist:false});
})();

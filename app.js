(() => {
  'use strict';
  const assets = window.MANGA_ASSETS || {};
  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const shapes = {
    'opening-left': [[0,0],[42,0],[36,100],[0,100]],
    'opening-right': [[44,0],[100,0],[100,100],[38,100]],
    feet: [[0,0],[100,7],[94,100],[0,94]],
    race: [[0,0],[100,0],[100,75],[0,100]],
    comparison: [[0,0],[95,0],[100,100],[0,91]],
    orb: [[8,0],[100,7],[92,100],[0,92]],
    komiya: [[0,0],[100,0],[94,100],[0,93]],
    kaido: [[0,0],[100,5],[100,100],[0,93]],
    nigami: [[0,0],[100,0],[94,100],[0,91]],
    'choice-persistence': [[0,0],[65,0],[60,50],[0,60]],
    'choice-giving': [[67,0],[100,0],[100,50],[62,50]],
    'choice-confidence': [[0,64],[42,57],[38,100],[0,100]],
    'choice-goal': [[44,57],[70,55],[67,100],[40,100]],
    'choice-reality': [[72,55],[100,55],[100,100],[69,100]],
    reflection: [[0,0],[100,7],[94,100],[0,91]],
    'quote-reactions': [[0,0],[100,0],[100,87],[0,100]],
    'quote-figure': [[16,0],[100,4],[100,100],[0,95]],
    'book-left': [[0,0],[100,5],[92,100],[0,94]],
    'book-right': [[9,0],[100,0],[100,94],[0,100]]
  };
  function svgElement(tag, attributes) {
    const element = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([name,value]) => element.setAttribute(name,value));
    return element;
  }
  document.querySelectorAll('[data-shape]').forEach(panel => {
    const points = shapes[panel.dataset.shape];
    if (!points) return;
    panel.style.setProperty('--panel-clip', `polygon(${points.map(p => `${p[0]}% ${p[1]}%`).join(',')})`);
    const svg = svgElement('svg',{viewBox:'0 0 100 100',preserveAspectRatio:'none',class:'panel-ink','aria-hidden':'true'});
    svg.append(svgElement('polygon',{points:points.map(p => p.join(',')).join(' ')}));
    panel.prepend(svg);
  });
  const balloons = {
    oval: 'M150 5 C230 5 292 34 292 96 C292 151 249 184 184 189 L142 215 L153 190 C75 191 8 166 8 98 C8 35 70 5 150 5 Z',
    thought: 'M59 27 C70 5 111 2 137 16 C165 0 209 6 222 27 C263 22 292 49 281 77 C306 105 291 137 267 145 C265 174 231 188 205 178 C179 197 143 191 131 182 C98 197 64 186 56 170 C20 170 3 144 17 120 C-1 93 10 62 34 56 C30 40 42 27 59 27 Z',
    impact: 'M150 5 L176 25 L215 7 L224 37 L274 29 L265 67 L297 85 L277 113 L298 145 L265 161 L275 196 L229 190 L216 217 L177 201 L150 219 L119 201 L78 218 L68 191 L23 198 L33 162 L3 146 L23 114 L3 82 L35 66 L25 30 L73 37 L83 8 L122 25 Z'
  };
  document.querySelectorAll('[data-balloon]').forEach(balloon => {
    const svg = svgElement('svg',{viewBox:'0 0 300 220',preserveAspectRatio:'none',class:'balloon-ink','aria-hidden':'true'});
    svg.append(svgElement('path',{d:balloons[balloon.dataset.balloon] || balloons.oval}));
    if (balloon.dataset.balloon === 'thought') {
      svg.append(svgElement('circle',{cx:48,cy:193,r:10}),svgElement('circle',{cx:30,cy:211,r:5}));
    }
    balloon.prepend(svg);
  });

  const currentAssets = new WeakMap();
  function fitArt(frame) {
    const asset = currentAssets.get(frame);
    const img = frame.querySelector('.art-image');
    if (!asset?.crop || !img?.naturalWidth) return;
    const {x,y,w,h} = asset.crop;
    const cropW = img.naturalWidth*w/100, cropH = img.naturalHeight*h/100;
    const desiredScale = frame.classList.contains('fit-cover') ? Math.max(frame.clientWidth/cropW,frame.clientHeight/cropH) : Math.min(frame.clientWidth/cropW,frame.clientHeight/cropH);
    const scale = Math.min(desiredScale, asset.maxScale ?? Infinity);
    const viewport = img.parentElement;
    viewport.style.width = `${cropW*scale}px`;
    viewport.style.height = `${cropH*scale}px`;
    viewport.style.left = `${(frame.clientWidth-cropW*scale)/2}px`;
    viewport.style.top = `${(frame.clientHeight-cropH*scale)/2}px`;
    img.style.width = `${img.naturalWidth*scale}px`;
    img.style.height = `${img.naturalHeight*scale}px`;
    img.style.left = `${-img.naturalWidth*x/100*scale}px`;
    img.style.top = `${-img.naturalHeight*y/100*scale}px`;
  }
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => entries.forEach(entry => fitArt(entry.target))) : null;
  if (!resizeObserver) window.addEventListener('resize', () => document.querySelectorAll('[data-art]').forEach(fitArt));
  const sources = new Map();
  function showArt(frame, key, eager = false) {
    frame.querySelectorAll('.art-image,.missing-art,.art-crop-viewport').forEach(node => node.remove());
    frame.classList.remove('loaded');
    frame.dataset.art = key;
    const asset = assets[key]; currentAssets.set(frame,asset);
    if (!asset?.src) {
      const message = document.createElement('span'); message.className='missing-art'; message.textContent='Artwork to be added'; frame.append(message); return;
    }
    const img = new Image(); img.className='art-image'; img.alt=asset.alt; img.loading=eager?'eager':'lazy'; img.decoding='async';
    if (eager) img.fetchPriority='high';
    img.addEventListener('load', () => {fitArt(frame); frame.classList.add('loaded');});
    img.addEventListener('error', () => {img.remove(); const message=document.createElement('span');message.className='missing-art';message.textContent='Artwork temporarily unavailable';frame.append(message);},{once:true});
    if (asset.crop) {
      const viewport=document.createElement('div'); viewport.className='art-crop-viewport'; viewport.append(img); frame.prepend(viewport);
    } else frame.prepend(img);
    img.src=asset.src; resizeObserver?.observe(frame);
    if (asset.source) sources.set(asset.source,asset.credit);
  }
  document.querySelectorAll('[data-art]').forEach(frame => showArt(frame,frame.dataset.art,true));
  const sourceList = document.querySelector('#source-list');
  sources.forEach((credit,url) => {const p=document.createElement('p'); const a=document.createElement('a'); a.href=url;a.textContent=credit;a.target='_blank';a.rel='noopener noreferrer';p.append(a);sourceList.append(p);});

  const reflections = {
    perseverance:{text:'Perseverance does not always lead to victory. Some people still choose to go on.',art:'wordSpeed'},
    'giving-up':{text:'Giving up does not always mean failure. Sometimes it means admitting that you need a different path.',art:'wordNigami'},
    confidence:{text:'The hardest part may not be losing. It may be believing in yourself after you have lost.',art:'wordConfidence'},
    goal:{text:'Do you want this because you love it, or because you want the applause?',art:'wordGoal'},
    reality:{text:'Some people work hard to accept reality. Others still want to change it.',art:'wordReality'}
  };
  window.mangaDrawing = {showArt,fitArt,reflections,reducedMotion};
})();

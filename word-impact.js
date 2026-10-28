/* Five reading choices: ink feedback around the existing picture, never a
   second picture. The article and its selected text remain the live source. */
(() => {
  'use strict';
  const stage = document.querySelector('.book-stage');
  const surface = document.querySelector('#comic-book');
  if (!stage || !surface) return;
  const reduced = window.mangaDrawing?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)');
  const ns = 'http://www.w3.org/2000/svg';
  const words = new Set(['perseverance', 'giving-up', 'confidence', 'goal', 'reality']);
  const layer = document.createElement('div');
  layer.className = 'word-ink-impact';
  layer.hidden = true;
  layer.inert = true;
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.state = 'idle';
  const drawing = document.createElementNS(ns, 'svg');
  drawing.setAttribute('aria-hidden', 'true');
  drawing.setAttribute('focusable', 'false');
  layer.append(drawing);
  document.body.append(layer);
  let frame = 0, pending = 0, generation = 0, activeButton = null, settling = null;

  const clamp = (number, low = 0, high = 1) => Math.max(low, Math.min(high, number));
  const ease = progress => 1 - Math.pow(1 - clamp(progress), 3);
  const box = rect => ({x: rect.x, y: rect.y, width: rect.width, height: rect.height});
  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return {x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y)};
  };
  const element = (tag, attributes = {}) => {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  // Every mark is a complete short stroke in free paper, with no white
  // keyline or rectangular masks that could conceal artwork or cut the ink.
  const group = index => {
    const node = element('g', {'data-ink-step': index});
    drawing.append(node);
    return node;
  };
  function clear(reason = 'complete') {
    generation++;
    if (pending) cancelAnimationFrame(pending);
    if (frame) cancelAnimationFrame(frame);
    pending = 0; frame = 0; settling = null;
    activeButton?.classList.remove('word-ink-hit');
    activeButton = null;
    drawing.replaceChildren();
    layer.hidden = true;
    layer.dataset.state = 'idle';
    layer.dataset.phase = 'idle';
    layer.dataset.word = '';
    layer.dataset.inkCount = '0';
    layer.dataset.stopReason = reason;
  }
  function pictureBox(button) {
    const leaf = button.closest('.leaf');
    if (!leaf || leaf.inert || leaf.getAttribute('aria-hidden') === 'true') return null;
    const viewport = {x: 4, y: 4, width: innerWidth - 8, height: innerHeight - 8};
    const regions = [];
    for (const art of surface.querySelectorAll('.word-art')) {
      const owner = art.closest('.leaf');
      if (!owner || owner.inert || owner.getAttribute('aria-hidden') === 'true') continue;
      const bounds = art.getBoundingClientRect();
      if (bounds.width < 8 || bounds.height < 8 || getComputedStyle(art).visibility === 'hidden') continue;
      let visible = intersect(box(bounds), intersect(box(owner.getBoundingClientRect()), viewport));
      const window = art.closest('.spread-window,.mobile-word-picture');
      if (window) visible = intersect(visible, box(window.getBoundingClientRect()));
      if (visible.width > 8 && visible.height > 8) regions.push(visible);
    }
    if (!regions.length) return null;
    const x = Math.min(...regions.map(r => r.x));
    const y = Math.min(...regions.map(r => r.y));
    return {x, y, width: Math.max(...regions.map(r => r.x + r.width)) - x, height: Math.max(...regions.map(r => r.y + r.height)) - y};
  }
  function protection(picture) {
    const rects = [{...picture, x:picture.x-3, y:picture.y-3, width:picture.width+6, height:picture.height+6}];
    for (const node of document.querySelectorAll('#comic-book [data-book-text],#comic-book .balloon,#comic-book .word-choice,.reader-header,.reader-controls,.reader-help')) {
      const owner = node.closest('.leaf');
      if (owner && (owner.inert || owner.getAttribute('aria-hidden') === 'true')) continue;
      const r = node.getBoundingClientRect(), style = getComputedStyle(node);
      if (r.width < 2 || r.height < 2 || style.visibility === 'hidden' || style.display === 'none') continue;
      rects.push({x:r.x-5, y:r.y-5, width:r.width+10, height:r.height+10});
    }
    return rects;
  }
  // Each segment's full sweep includes half its stroke and all of its small
  // entry displacement. Unsafe marks are omitted whole, never masked into bits.
  function safeMark(mark, protectedRects, viewport) {
    const pad = mark.width / 2 + 1;
    for (const points of mark.lines) for (let index=1; index<points.length; index++) {
      const a=points[index-1], b=points[index];
      const left=Math.min(a[0],b[0])+Math.min(0,mark.dx)-pad;
      const top=Math.min(a[1],b[1])+Math.min(0,mark.dy)-pad;
      const right=Math.max(a[0],b[0])+Math.max(0,mark.dx)+pad;
      const bottom=Math.max(a[1],b[1])+Math.max(0,mark.dy)+pad;
      if (left<viewport.x || top<viewport.y || right>viewport.x+viewport.width || bottom>viewport.y+viewport.height) return false;
      if (protectedRects.some(r => left<r.x+r.width && right>r.x && top<r.y+r.height && bottom>r.y)) return false;
    }
    return true;
  }
  function perimeterMarks(word, r, compact) {
    const x=r.x, y=r.y, right=x+r.width, bottom=y+r.height;
    const gap=compact ? 10 : 13, length=compact ? 22 : 34;
    const width=word==='perseverance' ? 3.5 : 2.8;
    const mark=(lines,dx=0,dy=0,weight=width)=>({lines,dx,dy,width:weight});
    const corners=[
      mark([[[x-gap,y+length],[x-gap,y-gap],[x+length,y-gap]]],-3,-3),
      mark([[[right-length,y-gap],[right+gap,y-gap],[right+gap,y+length]]],3,-3),
      mark([[[right+gap,bottom-length],[right+gap,bottom+gap],[right-length,bottom+gap]]],3,3),
      mark([[[x+length,bottom+gap],[x-gap,bottom+gap],[x-gap,bottom-length]]],-3,3)
    ];
    const upper=mark([[[x+r.width*.64,y-gap],[x+r.width*.64+length,y-gap]],[[x+r.width*.64+8,y-gap-6],[x+r.width*.64+length,y-gap-6]]],3,0,2.2);
    const lower=mark([[[x+r.width*.22,bottom+gap],[x+r.width*.22+length,bottom+gap]],[[x+r.width*.22,bottom+gap+6],[x+r.width*.22+length-8,bottom+gap+6]]],-3,0,2.2);
    const left=mark([[[x-gap,y+r.height*.40],[x-gap,y+r.height*.40+length]]],-3,0,2.8);
    const rightMark=mark([[[right+gap,y+r.height*.55],[right+gap,y+r.height*.55+length]]],3,0,2.8);
    // Different pairings give each choice a little identity; at most four
    // marks remain, occupying only the image's immediate outer margin.
    const order={
      perseverance:[corners[1],corners[3],upper,lower,...corners,left,rightMark],
      'giving-up':[corners[0],corners[2],left,rightMark,...corners,upper,lower],
      confidence:[upper,lower,corners[1],corners[3],...corners,left,rightMark],
      goal:[corners[0],corners[2],corners[1],corners[3],upper,lower,left,rightMark],
      reality:[left,rightMark,corners[1],corners[3],...corners,upper,lower]
    };
    return [...new Set(order[word])];
  }
  function compose(word, picture, protectedRects) {
    const viewport={x:5,y:5,width:innerWidth-10,height:innerHeight-10};
    const marks=perimeterMarks(word,picture,innerWidth<600).filter(mark=>safeMark(mark,protectedRects,viewport)).slice(0,4);
    const steps=marks.map((mark,index)=>{
      const node=group(index);
      for (const points of mark.lines) {
        const d=points.map((point,i)=>`${i?'L':'M'}${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join('');
        node.append(element('path',{d,fill:'none',stroke:'#111','stroke-width':mark.width,'stroke-linecap':'butt','stroke-linejoin':'round'}));
      }
      node.dataset.inkSafe='true';
      return {node,delay:index*36,x:mark.dx,y:mark.dy};
    });
    layer.dataset.inkCount=String(marks.length);
    layer.dataset.composition='outside-art';
    return steps;
  }
  function play(button) {
    if (reduced.matches || document.hidden || stage.dataset.turnState && stage.dataset.turnState !== 'read') return;
    if (button.getAttribute('aria-pressed') !== 'true') return;
    const word = button.dataset.word, r = pictureBox(button), labelNode = button.querySelector('span');
    if (!words.has(word) || !r || !labelNode) return;
    drawing.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    const steps = compose(word, r, protection(r)), token = generation, duration = word === 'giving-up' ? 600 : 680;
    if (!steps.length) {clear('no-clear-margin'); return;}
    let start;
    activeButton = button; button.classList.add('word-ink-hit');
    layer.dataset.state = 'playing'; layer.dataset.word = word; layer.dataset.stopReason = '';
    layer.hidden = false;
    function tick(time) {
      frame = 0;
      if (token !== generation) return;
      if (start === undefined) start = time;
      const elapsed = time - start, progress = clamp(elapsed / duration);
      layer.dataset.phase = elapsed < 230 ? 'strike' : elapsed < duration - 180 ? 'hold' : 'settle';
      for (const step of steps) {
        const local = clamp((elapsed - step.delay) / 155), opacity = clamp((elapsed - step.delay) / 32) * (1-clamp((elapsed-duration+180)/180));
        step.node.setAttribute('opacity', opacity.toFixed(3));
        step.node.setAttribute('transform', `translate(${(step.x*(1-ease(local))).toFixed(2)} ${(step.y*(1-ease(local))).toFixed(2)})`);
      }
      if (progress < 1) frame = requestAnimationFrame(tick); else clear('complete');
    }
    frame = requestAnimationFrame(tick);
  }
  function waitForQuietLayout(time) {
    pending = 0;
    const request = settling;
    if (!request || request.token !== generation) return;
    if (reduced.matches || document.hidden || stage.dataset.turnState && stage.dataset.turnState !== 'read') {clear('start-suppressed'); return;}
    if (request.began === null) request.began = time;
    const r = request.button.getBoundingClientRect();
    const snapshot = [window.scrollX || 0, window.scrollY || 0, innerWidth, innerHeight, r.x, r.y, r.width, r.height].map(value => Math.round(value * 10) / 10).join(',');
    if (request.dirty || snapshot !== request.snapshot) {
      request.dirty = false;
      request.snapshot = snapshot;
      request.quietSince = time;
    }
    if (time-request.began > 600) {clear('layout-unstable'); return;}
    // Native keyboard/focus scrolling can finish after click delivery. Absorb
    // only this short initial layout phase; deliberate wheel/touch still stop.
    if (time-request.quietSince >= 80 && time-request.began >= 80) {
      settling = null;
      layer.dataset.state = 'idle';
      play(request.button);
      if (layer.dataset.state !== 'playing') clear('start-suppressed');
      return;
    }
    pending = requestAnimationFrame(waitForQuietLayout);
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-word]');
    if (!button || !words.has(button.dataset.word)) return;
    clear('selection');
    if (reduced.matches || document.hidden) return;
    // Runs after reader.js has selected its real text and picture, then waits
    // for native focus/layout scrolling to settle without scrolling the page.
    settling = {button, token:generation, began:null, quietSince:null, snapshot:'', dirty:true};
    layer.dataset.state = 'queued';
    layer.dataset.phase = 'settling';
    layer.dataset.word = button.dataset.word;
    pending = requestAnimationFrame(waitForQuietLayout);
  });
  const observer = new MutationObserver(() => {
    if (stage.dataset.turnState && stage.dataset.turnState !== 'read') clear('page-turn');
  });
  observer.observe(stage, {attributes: true, attributeFilter: ['data-turn-state', 'data-mode']});
  for (const name of ['resize', 'pagehide', 'beforeprint', 'manga:languagechange']) window.addEventListener(name, () => clear(name), {passive: true});
  window.addEventListener('scroll', () => {if (settling) settling.dirty = true; else clear('scroll');}, {passive:true});
  for (const name of ['wheel','touchmove']) window.addEventListener(name, () => clear(name), {passive:true,capture:true});
  document.addEventListener('visibilitychange', () => {if (document.hidden) clear('hidden');});
  document.addEventListener('keydown', event => {if (event.key === 'Escape') clear('escape');});
  reduced.addEventListener('change', () => clear('preference'));
})();

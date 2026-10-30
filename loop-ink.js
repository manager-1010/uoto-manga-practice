/* Manga adaptations of Scenario Motion Loops.
 * Copyright (c) 2026 Scenario Inc. MIT License.
 * The original files, source URLs and full permission notice are retained in
 * public/assets/vendor/scenario-motion-loops/.
 *
 * Halftone Wave, Line Burst, Orbit Dots, Split Panels and Arc Rotation retain
 * their source algorithms; this version removes the background fill and their
 * standalone animation runners, reduces density and confines ink to a rim.
 * The reader owns time, canvas sizing, clearing and cancellation. This module
 * has no timers, DOM reads, image copies, network requests or input handlers.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const fract = value => value - Math.floor(value);
  const mix = (a, b, progress) => a + (b - a) * progress;
  const windowProgress = (progress, a, b) => clamp((progress - a) / (b - a));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const sineEase = value => -(Math.cos(Math.PI * clamp(value)) - 1) / 2;
  const cubicEase = value => value < .5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  const quartEase = value => value < .5 ? 8 * value * value * value * value : 1 - Math.pow(-2 * value + 2, 4) / 2;
  const cycle = (time, period, offset = 0) => fract((time + offset) / period);
  function dot(context, x, y, radius) {
    context.moveTo(x + radius, y);
    context.arc(x, y, radius, 0, TAU);
  }
  function inRim(x, y, radius, width, height, rim) {
    return x - radius < rim || x + radius > width - rim || y - radius < rim || y + radius > height - rim;
  }
  function segmentHitsRect(a,b,r,pad=0) {
    const left=r.x-pad,right=r.x+r.width+pad,top=r.y-pad,bottom=r.y+r.height+pad;
    let lo=0,hi=1;
    for(const [origin,delta,min,max] of [[a[0],b[0]-a[0],left,right],[a[1],b[1]-a[1],top,bottom]]) {
      if(Math.abs(delta)<1e-8){if(origin<min||origin>max)return false;continue;}
      let near=(min-origin)/delta,far=(max-origin)/delta;
      if(near>far)[near,far]=[far,near];lo=Math.max(lo,near);hi=Math.min(hi,far);
      if(lo>hi)return false;
    }
    return true;
  }
  // Decide whether a complete mark belongs in the composition before drawing
  // it. Subtracting rectangular holes from finished ink makes black/white
  // blocks appear through a long speed line, even though no block was painted.
  function safePath(points,options,pad=1) {
    for(const zone of options.safeRects)for(let i=1;i<points.length;i++)
      if(segmentHitsRect(points[i-1],points[i],zone,pad))return false;
    return true;
  }
  function safeDot(x,y,radius,options) {
    return !options.safeRects.some(r=>x+radius>=r.x&&x-radius<=r.x+r.width&&y+radius>=r.y&&y-radius<=r.y+r.height);
  }
  function curvePoints(a,b,c,d) {
    const points=[];
    for(let i=0;i<=32;i++){
      const t=i/32,u=1-t;
      points.push([u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]]);
    }
    return points;
  }

  // Source: reference-halftone-wave.html. Keep the staggered 45-degree screen
  // and its two travelling sine tones. The merged solid field becomes a sparse
  // paper-edge print, leaving the live characters and lettering untouched.
  function halftone(context, width, height, time, palette, options) {
    const unit = Math.max(2.4, Math.min(width, height) / 100);
    const pitch = Math.max(11, 6.4 * unit) / (.72 + options.density * .28);
    const rowHeight = pitch / 2, radiusMax = pitch * .31;
    const t1 = TAU * time / 4, t2 = TAU * time / 6;
    const c1 = Math.cos(-.62), s1 = Math.sin(-.62), c2 = Math.cos(.9), s2 = Math.sin(.9);
    let marks = 0;
    context.beginPath();
    for (let j = 0; j <= Math.ceil(height / rowHeight) + 1; j++) {
      const y = j * rowHeight;
      for (let i = -1; i <= Math.ceil(width / pitch) + 1; i++) {
        const x = i * pitch + (j % 2 ? pitch / 2 : 0);
        if (!inRim(x, y, radiusMax, width, height, options.rim)) continue;
        const xx = x / unit, yy = y / unit;
        const v1 = Math.sin(TAU * (xx * c1 + yy * s1) / 120 - t1);
        const v2 = Math.sin(TAU * (xx * c2 + yy * s2) / 210 + t2);
        const tone = smooth(windowProgress(.5 + .5 * (.72 * v1 + .28 * v2), .12, .98));
        const radius = radiusMax * Math.pow(tone, .75);
        if (radius > .18 * unit && safeDot(x,y,radius,options)) { dot(context, x, y, radius); marks++; }
      }
    }
    context.fillStyle = palette.ink;
    context.fill();
    return marks;
  }

  // Source: reference-line-burst.html. The two easing gaps still travel along
  // each ray. Fewer rays, thinner ink and a clear centre replace the source's
  // dense full-frame burst and its central disc.
  function burst(context, width, height, time, palette, options) {
    const unit = Math.max(2.4, Math.min(width, height) / 100);
    const cx = width * (.5 + options.side * .025), cy = height * .47;
    const count = Math.round(22 + options.density * 24);
    const r0 = Math.min(width, height) * .23;
    const r1 = Math.hypot(width, height) * .65;
    const shortRadius = r0 + .48 * (r1 - r0);
    const gaps = [0, 1].map(index => {
      const progress = sineEase(cycle(time, 3, index * 1.5));
      return [mix(r0 - 6 * unit, r1 + 6 * unit, progress), mix(1.2, 9, progress) * unit];
    });
    let marks = 0;
    context.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU - Math.PI / 2;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      let segments = [[r0, i % 2 ? Math.min(shortRadius, r1) : r1]];
      for (const [centre, gapWidth] of gaps) {
        const start = centre - gapWidth / 2, end = centre + gapWidth / 2, next = [];
        for (const [s0, s1] of segments) {
          if (end <= s0 || start >= s1) { next.push([s0, s1]); continue; }
          if (start > s0) next.push([s0, start]);
          if (end < s1) next.push([end, s1]);
        }
        segments = next;
      }
      for (const [start, end] of segments) {
        if (end - start < .3 * unit) continue;
        const a=[cx+ca*start,cy+sa*start],b=[cx+ca*end,cy+sa*end];
        if(!safePath([a,b],options,Math.max(1,unit*.38)/2+1))continue;
        context.moveTo(...a);
        context.lineTo(...b);
        marks++;
      }
    }
    context.lineCap = 'butt';
    context.lineWidth = Math.max(1, unit * .38);
    context.strokeStyle = palette.ink;
    context.stroke();
    return marks;
  }

  // Source: reference-orbit-dots.html. Keep its quantised concentric rings and
  // delayed one-third-turn rotation, with a sparse ellipse instead of a dense
  // centred poster. No star noise or replacement illustration is introduced.
  function orbit(context, width, height, time, palette, options) {
    const unit = Math.max(2.4, Math.min(width, height) / 100);
    const cx = width * .5, cy = height * .49;
    const gap = 9.1 * unit, spacing = 7 * unit, radius = Math.max(.9, unit * .5);
    const ringCount = Math.ceil(Math.hypot(width, height) / 2 / gap) + 1;
    const p = cycle(time, 4), turn = Math.floor(time / 4), sections = 8;
    let marks = 0;
    for (let ring = 1; ring <= ringCount; ring++) {
      const r = ring * gap;
      const n = sections * Math.max(1, Math.round(TAU * r / (sections * spacing)));
      const delay = .38 * (ring - 1) / Math.max(1, ringCount - 1);
      const rotation = (turn + cubicEase(windowProgress(p, delay, delay + .5))) * TAU / 3;
      context.beginPath();
      for (let j = 0; j < n; j++) {
        const angle = j / n * TAU + rotation;
        const x = cx + r * Math.cos(angle), y = cy + r * .68 * Math.sin(angle);
        if (x < -2 * unit || x > width + 2 * unit || y < -2 * unit || y > height + 2 * unit) continue;
        if (!inRim(x, y, radius * 1.45, width, height, options.rim)) continue;
        const dotRadius=radius*(j%(n/sections)===0?1.35:1);
        if(!safeDot(x,y,dotRadius,options))continue;
        dot(context, x, y, dotRadius);
        marks++;
      }
      context.fillStyle = ring % 4 === 0 ? palette.accent : palette.ink;
      context.fill();
    }
    return marks;
  }

  // Source: reference-split-panels.html. Its three staggered opening/closing
  // blocks become narrow outlined paper cuts. We retain the offset, easing and
  // stagger instead of filling the source's three opaque full-page rectangles.
  function split(context, width, height, time, palette, options) {
    const half = Math.floor(time / 6) % 2, localTime = ((time % 6) + 6) % 6;
    const blocks = [
      {x: 0, y: 0, w: .44, h: 1},
      {x: .44, y: 0, w: .3, h: .56},
      {x: .44, y: .56, w: .56, h: .44}
    ];
    const openings = [
      [[-.12, 0], [0, -.2], [0, .18]],
      [[0, .22], [.14, 0], [.1, 0]]
    ][half];
    const unit = Math.max(1, Math.min(width, height) / 240);
    let marks=0;
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const opening = quartEase(windowProgress(localTime, .1 + index * .6, 1.6 + index * .6));
      const closing = quartEase(windowProgress(localTime, 3 + index * .6, 4.5 + index * .6));
      const amount = opening - closing;
      const x = (block.x + openings[index][0] * amount) * width;
      const y = (block.y + openings[index][1] * amount) * height;
      context.strokeStyle = palette.ink;
      context.lineWidth = unit * (index === 0 ? 2.3 : 1.4);
      const left=x+unit,top=y+unit,right=x+block.w*width-unit,bottom=y+block.h*height-unit;
      if(!safePath([[left,top],[right,top],[right,bottom],[left,bottom],[left,top]],options,context.lineWidth/2+1))continue;
      context.strokeRect(x + unit, y + unit, block.w * width - 2 * unit, block.h * height - 2 * unit);
      marks++;
    }
    context.fillStyle = palette.accent;
    const x=width*.06,y=height*.035,w=Math.min(width*.1,64),h=Math.max(2,unit);
    if(!options.safeRects.some(r=>x<r.x+r.width&&x+w>r.x&&y<r.y+r.height&&y+h>r.y)){context.fillRect(x,y,w,h);marks++;}
    return marks;
  }

  // Source: reference-arc-rotation.html. Preserve the alternating whole-turn
  // arc speeds/spans, translated into thin astronomy drafting marks.
  function circle(context, width, height, time, palette, options) {
    const base = Math.min(width, height), cx = width * .5, cy = height * .5;
    const rings = [
      {radius: .64, span: .72, turns: 1},
      {radius: .57, span: .5, turns: -1},
      {radius: .49, span: .8, turns: 2, accent: true},
      {radius: .41, span: .6, turns: -1}
    ];
    const p = cycle(time, 6);
    context.lineCap = 'butt';
    context.lineWidth = Math.max(1.2, base * .0035);
    let marks=0;
    for (const [index, ring] of rings.entries()) {
      const k = cubicEase(windowProgress(p, .02 + index * .03, .82 + index * .03));
      const angle = ring.turns * TAU * k;
      const gap = (1 - ring.span) * TAU;
      const start=angle+gap/2,end=angle+TAU-gap/2,radius=ring.radius*base;
      const points=[],steps=Math.max(8,Math.ceil((end-start)*radius/12));
      for(let i=0;i<=steps;i++){const a=start+(end-start)*i/steps;points.push([cx+radius*Math.cos(a),cy+radius*Math.sin(a)]);}
      if(!safePath(points,options,context.lineWidth/2+1))continue;
      context.strokeStyle = ring.accent ? palette.accent : palette.ink;
      context.beginPath();
      context.arc(cx, cy, radius, start, end);
      context.stroke();
      marks++;
    }
    return marks;
  }

  // Complete corner ribbons, rather than full-width curves with holes cut out
  // for the cover and caption. Their deliberate ends frame the central drawing.
  // The shared time bends the ink only, never an image or character mesh.
  function flow(context, width, height, time, palette, options) {
    const count = Math.round(4 + options.density * 4), edge = options.rim;
    const unit = Math.max(1, Math.min(width, height) / 260);
    context.lineCap = 'butt';
    let marks=0;
    for (let i = 0; i < count; i++) {
      const progress=(i+1)/(count+1),inset=10+progress*edge*.76;
      const bend = Math.sin(time * TAU / 6 + i * .36) * edge * .045;
      context.strokeStyle = i === count - 1 ? palette.accent : palette.ink;
      context.lineWidth = i % 3 === 0 ? 1.6 * unit : .7 * unit;
      const paths=[];
      if (options.side < 0) {
        paths.push([[-edge*.25,inset],[width*.08,inset+bend],[width*.19,inset-edge*.3],[width*(.25+progress*.065),inset-edge*.13]],
          [[width+edge*.25,inset+edge*.5],[width*.92,inset+edge*.5-bend],[width*.81,inset+edge*.35],[width*(.75-progress*.065),inset+edge*.22]],
          [[-edge*.25,height-edge*(.78-progress*.25)],[width*.04,height-edge*.75-bend],[width*.085,height-edge*.52],[width*(.1+progress*.035),height-edge*(.56-progress*.18)]],
          [[width+edge*.25,height-edge*(.78-progress*.25)],[width*.96,height-edge*.75+bend],[width*.915,height-edge*.52],[width*(.9-progress*.035),height-edge*(.56-progress*.18)]]);
      } else {
        paths.push([[inset,-edge],[inset+bend,height*.28],[-edge*.36,height*.68],[inset,height+edge]],
          [[width-inset,-edge],[width-inset-bend,height*.3],[width+edge*.4,height*.72],[width-inset,height+edge]]);
      }
      for(const points of paths){
        if(!safePath(curvePoints(...points),options,context.lineWidth/2+1.5))continue;
        context.beginPath();context.moveTo(...points[0]);context.bezierCurveTo(...points.slice(1).flat());context.stroke();marks++;
      }
    }
    return marks;
  }

  const renderers = {halftone, burst, orbit, split, circle, flow};
  function draw(context, width, height, seconds, palette = {}, options = {}) {
    if (!context || !Number.isFinite(width) || !Number.isFinite(height) || width < 4 || height < 4) return 0;
    const density = clamp(finite(options.density, .68));
    const alpha = clamp(finite(options.envelope, 1));
    if (!density || !alpha) return 0;
    const rim = clamp(finite(options.rim, Math.min(width, height) * .15), 1, Math.min(width, height) * .47);
    const safeRects=(options.safeRects||[]).filter(zone=>zone&&[zone.x,zone.y,zone.width,zone.height].every(Number.isFinite)&&zone.width>0&&zone.height>0);
    const config = {density, rim, safeRects, side: options.side < 0 ? -1 : 1, phase: clamp(finite(options.phase, cycle(finite(seconds, 0), 12)))};
    const colours = {ink: palette.ink || '#111', paper: palette.paper || '#fcfbf7', accent: palette.accent || '#b71f30'};
    const kind = Object.hasOwn(renderers, options.kind) ? options.kind : 'halftone';
    context.save();
    try {
      context.globalAlpha *= alpha;
      // The canvas naturally clips at the viewport edge. Content protection is
      // done per complete mark, never by rectangular subtraction or repainting.
      return renderers[kind](context, width, height, finite(seconds, 0), colours, config);
    } finally { context.restore(); }
  }
  window.mangaLoopInk = Object.freeze({draw, kinds: Object.freeze(Object.keys(renderers)), source: 'Scenario Motion Loops', version: '17.0.0'});
})();

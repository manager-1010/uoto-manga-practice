/* Limited animation of the ORIGINAL drawing. A single authored follow-through,
   not a reconstructed run cycle: visible forearms and shins rotate about their
   joints; hair tips follow later. Face, neck, torso and occluded joints stay put.
   Shared mesh vertices keep the original clipped pixels attached at the joints. */
(() => {
  'use strict';
  const ns='http://www.w3.org/2000/svg';
  let serial=0;
  const rigs={
    runners:{columns:36,rows:32,protect:[
      [[330,447],[725,447],[745,665],[350,675]],
      [[708,116],[1035,116],[1055,324],[718,324]],
      [[450,600],[1055,600],[1100,985],[445,985]],
      [[1010,450],[1280,450],[1300,765],[1110,785]]
    ],bones:[
      {id:'front-arm',joint:[282,708],tip:[88,904],angle:2.6,delay:0,zone:[[350,600],[400,780],[250,1030],[-120,1060],[-120,740],[200,620]]},
      {id:'rear-forearm',joint:[1278,365],tip:[1515,372],angle:-2.1,delay:.035,zone:[[1202,257],[1430,245],[1610,262],[1630,480],[1370,485],[1190,422]]},
      // The folded central leg crosses the other runner: it is intentionally
      // pinned. Only the two unobstructed trailing shins and shoes articulate.
      {id:'front-shin',joint:[1372,1222],tip:[1636,1384],angle:2.5,delay:.025,zone:[[1280,1120],[1480,1145],[1745,1190],[1770,1515],[1540,1530],[1490,1365],[1305,1280]]},
      {id:'rear-shin',joint:[1348,865],tip:[1602,821],angle:-2.3,delay:.065,zone:[[1300,782],[1495,725],[1720,685],[1750,955],[1500,990],[1290,955]]},
      {id:'front-hair-tips',joint:[517,424],tip:[750,306],angle:-1.15,delay:.12,zone:[[270,325],[375,235],[560,205],[805,277],[795,430],[675,475],[510,447],[300,465]],feather:30},
      {id:'rear-hair-tips',joint:[854,115],tip:[737,25],angle:.85,delay:.16,zone:[[660,-20],[960,-20],[965,108],[890,117],[780,113],[686,125]],feather:24}
    ]},
    sprinter:{columns:30,rows:32,protect:[
      [[61,191],[155,191],[169,277],[61,277]],
      [[145,234],[361,234],[386,433],[155,433]],
      [[200,365],[415,365],[454,558],[203,558]]
    ],bones:[
      {id:'raised-forearm',joint:[59,350],tip:[32,202],angle:1.8,delay:.035,zone:[[-15,145],[90,145],[103,320],[84,399],[-20,394]],feather:15},
      {id:'rear-forearm',joint:[430,252],tip:[493,272],angle:-3.0,delay:0,zone:[[368,182],[539,194],[550,323],[425,323],[365,279]],feather:16},
      {id:'bent-shin',joint:[112,561],tip:[196,716],angle:2.5,delay:.045,zone:[[8,492],[155,508],[289,649],[291,785],[119,807],[114,675],[29,618]],feather:20},
      {id:'trailing-shin',joint:[493,621],tip:[648,748],angle:-2.7,delay:.015,zone:[[438,559],[580,581],[720,668],[725,829],[594,836],[530,718],[436,665]],feather:20},
      {id:'hair-tips',joint:[112,183],tip:[219,148],angle:-1.1,delay:.13,zone:[[41,94],[170,80],[254,120],[256,183],[192,214],[109,193],[45,181]],feather:17}
    ]}
  };
  const node=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
  const clamp=n=>Math.max(0,Math.min(1,n));
  const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
  const inside=(p,polygon)=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }return hit;};
  function edgeDistance(p,polygon){let nearest=Infinity;for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],x=b[0]-a[0],y=b[1]-a[1],u=clamp(((p.x-a[0])*x+(p.y-a[1])*y)/(x*x+y*y));
    nearest=Math.min(nearest,Math.hypot(p.x-a[0]-u*x,p.y-a[1]-u*y));
  }return nearest;}
  function weight(p,bone){
    if(!inside(p,bone.zone))return 0;
    const x=bone.tip[0]-bone.joint[0],y=bone.tip[1]-bone.joint[1],along=((p.x-bone.joint[0])*x+(p.y-bone.joint[1])*y)/(x*x+y*y);
    // Distal regions rotate rigidly. Only the proximal joint zone blends into
    // the pinned upper segment. No radial bulge or size scaling.
    return smooth((along-.015)/.42)*smooth(edgeDistance(p,bone.zone)/(bone.feather||26));
  }
  // One push, short follow-through and settle. No loop or sine displacement.
  const keys=[[0,0],[.10,-.12],[.32,1],[.62,.26],[.86,-.09],[1.12,0]];
  function pose(seconds){if(seconds<=0||seconds>=keys[keys.length-1][0])return 0;for(let i=1;i<keys.length;i++){
    if(seconds<=keys[i][0]){const a=keys[i-1],b=keys[i],t=smooth((seconds-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*t;}
  }return 0;}
  function create({defs,actor,image,box,name}){
    const rig=rigs[name];if(!rig)return null;
    const id=`ink-rig-${++serial}`,source=node('g',{id});source.append(image);defs.append(source);
    const mesh=node('g',{'data-local-motion':'true','data-rig':name,'data-rig-method':'joint-rotation','data-rig-cycle':'single-follow-through'});actor.append(mesh);
    const intact=node('use',{href:`#${id}`,'data-rig-rest':'true'}),skin=node('g',{'data-rig-skin':'true',style:'display:none'}),pieces=node('g');mesh.append(intact,skin);skin.append(pieces);
    const {columns,rows}=rig,[bx,by,bw,bh]=box,points=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      const p={x:bx-1+(bw+2)*x/columns,y:by-1+(bh+2)*y/rows};p.dx=p.x;p.dy=p.y;
      p.protected=rig.protect.some(poly=>inside(p,poly));p.weights=rig.bones.map(b=>p.protected?0:weight(p,b));points.push(p);
    }
    const moving=[],fixed=[],all=[];
    function triangle(indexes){
      const p=indexes.map(i=>points[i]),x1=p[1].x-p[0].x,y1=p[1].y-p[0].y,x2=p[2].x-p[0].x,y2=p[2].y-p[0].y;
      const tri={p,x1,y1,x2,y2,det:x1*y2-x2*y1};all.push(tri);
      if(!p.some(v=>v.weights.some(w=>w>0))){fixed.push(`M${p.map(v=>`${v.x},${v.y}`).join('L')}Z`);return;}
      const clipId=`${id}-${moving.length}`,cx=(p[0].x+p[1].x+p[2].x)/3,cy=(p[0].y+p[1].y+p[2].y)/3;
      // Two source pixels are less than one screen pixel at the normal pose.
      // Crisp internal clip edges plus shared vertices avoid light stitch lines
      // in solid black hair. This overlap never outlines or expands the body.
      const grow=1+1.85/Math.min(...p.map(v=>Math.hypot(v.x-cx,v.y-cy)));
      const coords=p.map(v=>`${cx+(v.x-cx)*grow},${cy+(v.y-cy)*grow}`).join(' ');
      const clip=node('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});clip.append(node('polygon',{points:coords,'shape-rendering':'crispEdges'}));defs.append(clip);
      const piece=node('g',{'clip-path':`url(#${clipId})`});piece.append(node('use',{href:`#${id}`}));pieces.append(piece);tri.piece=piece;moving.push(tri);
    }
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;triangle([a,b,c]);triangle([b,d,c]);}
    const fixedId=`${id}-fixed`,fixedClip=node('clipPath',{id:fixedId,clipPathUnits:'userSpaceOnUse'});fixedClip.append(node('path',{d:fixed.join('')}));defs.append(fixedClip);
    const staticInk=node('g',{'clip-path':`url(#${fixedId})`});staticInk.append(node('use',{href:`#${id}`}));pieces.prepend(staticInk);
    // Exact original face/neck/torso pixels cover their pinned mesh region too.
    // No face is warped merely because a neighbouring arm cell moves.
    const protectedId=`${id}-protected`,protectedClip=node('clipPath',{id:protectedId,clipPathUnits:'userSpaceOnUse'}),maskId=`${id}-skin-mask`,skinMask=node('mask',{id:maskId,maskUnits:'userSpaceOnUse',x:bx-30,y:by-30,width:bw+60,height:bh+60,style:'mask-type:luminance'});
    skinMask.append(node('rect',{x:bx-30,y:by-30,width:bw+60,height:bh+60,fill:'white'}));
    for(const poly of rig.protect){const coords=poly.map(p=>p.join(',')).join(' '),cx=poly.reduce((s,p)=>s+p[0],0)/poly.length,cy=poly.reduce((s,p)=>s+p[1],0)/poly.length;
      // The fixed patch slightly overlaps its complementary mask inside the
      // already pinned joint margin. That avoids a dotted matte seam on blacks.
      const overdraw=poly.map(([x,y])=>{const k=1+3/Math.hypot(x-cx,y-cy);return `${cx+(x-cx)*k},${cy+(y-cy)*k}`;}).join(' ');
      protectedClip.append(node('polygon',{points:overdraw,'shape-rendering':'crispEdges'}));skinMask.append(node('polygon',{points:coords,fill:'black','shape-rendering':'crispEdges'}));
    }
    defs.append(protectedClip,skinMask);pieces.setAttribute('mask',`url(#${maskId})`);
    const fixedBody=node('g',{'clip-path':`url(#${protectedId})`});fixedBody.append(node('use',{href:`#${id}`}));skin.append(fixedBody);
    mesh.dataset.triangles=String(all.length);mesh.dataset.movingTriangles=String(moving.length);mesh.dataset.protectedVertices=String(points.filter(p=>p.protected).length);
    let firstActive=null;
    function update(seconds,strength){
      strength=clamp(Number.isFinite(strength)?strength:0);seconds=Number.isFinite(seconds)?seconds:0;
      if(firstActive===null&&strength>.015)firstActive=seconds;
      const elapsed=firstActive===null?0:Math.max(0,seconds-firstActive);
      const angles=rig.bones.map(b=>b.angle*pose(elapsed-b.delay)*strength),radians=angles.map(a=>a*Math.PI/180),sines=radians.map(Math.sin),cosines=radians.map(Math.cos);
      const atRest=angles.every(angle=>Math.abs(angle)<.00001);intact.setAttribute('style',atRest?'display:inline':'display:none');skin.setAttribute('style',atRest?'display:none':'display:inline');
      for(const p of points){p.dx=p.x;p.dy=p.y;for(let i=0;i<rig.bones.length;i++){
        const w=p.weights[i];if(!w||!angles[i])continue;
        const b=rig.bones[i],x=p.x-b.joint[0],y=p.y-b.joint[1];
        p.dx+=w*(x*cosines[i]-y*sines[i]-x);p.dy+=w*(x*sines[i]+y*cosines[i]-y);
      }}
      let minArea=Infinity,maxArea=0,protectedShift=0,maxShift=0;
      for(const p of points){const shift=Math.hypot(p.dx-p.x,p.dy-p.y);maxShift=Math.max(maxShift,shift);if(p.protected)protectedShift=Math.max(protectedShift,shift);}
      for(const tri of moving){const[p,q,r]=tri.p,ux=q.dx-p.dx,uy=q.dy-p.dy,vx=r.dx-p.dx,vy=r.dy-p.dy;
        const a=(ux*tri.y2-vx*tri.y1)/tri.det,b=(uy*tri.y2-vy*tri.y1)/tri.det,c=(vx*tri.x1-ux*tri.x2)/tri.det,d=(vy*tri.x1-uy*tri.x2)/tri.det,e=p.dx-a*p.x-c*p.y,f=p.dy-b*p.x-d*p.y;
        const area=a*d-b*c;minArea=Math.min(minArea,area);maxArea=Math.max(maxArea,area);
        if(atRest)tri.piece.removeAttribute('transform');
        else tri.piece.setAttribute('transform',`matrix(${a.toFixed(7)} ${b.toFixed(7)} ${c.toFixed(7)} ${d.toFixed(7)} ${e.toFixed(4)} ${f.toFixed(4)})`);
      }
      mesh.dataset.strength=strength.toFixed(3);mesh.dataset.rigElapsed=elapsed.toFixed(3);mesh.dataset.rigAngles=rig.bones.map((b,i)=>`${b.id}:${angles[i].toFixed(3)}`).join(',');
      mesh.dataset.rigProtectedShift=protectedShift.toFixed(4);mesh.dataset.rigMaxShift=maxShift.toFixed(3);mesh.dataset.rigMinArea=minArea.toFixed(4);mesh.dataset.rigMaxArea=maxArea.toFixed(4);
    }
    return{update,triangles:all.length};
  }
  window.comicPuppet=Object.freeze({create});
})();

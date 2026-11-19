/* 咪姬亮相 cameo runtime — v3 柔軟繪本風 character (design C) (needs mimi-art.js loaded first, or use mimi-cameo.bundle.js).
   All coordinates are native 3840×2160 design px. Pure SVG vector + JS timeline, no filters, no raster.
   API:
     const c = MIMI_CAMEO.mount(svgGroup, {line, side})   // line: index 0-9 | string | [l1,l2] | undefined=random
     c.place(x, y)        // screen point where the cat's feet (bottom-centre) stand
     c.render(u, D)       // u = seconds since trigger, D = total length (default 1.9). u<0 or u>D → hidden
     c.remove()
*/
(function(root){
const NS='http://www.w3.org/2000/svg';
const LINES=[
 ['哼，算你有眼光','咪姬 8 台！'],
 ['8 台而已啦','人家才沒有很開心'],
 ['看在你這麼努力','賞你 8 台喔'],
 ['別誤會喔','人家只是剛好路過'],
 ['咪姬親自出場','還不快謝謝人家'],
 ['哼，這手氣','勉強及格啦'],
 ['8 台給你','下次要更爭氣喔'],
 ['不准驕傲喔','是咪姬保佑你的'],
 ['才、才不是','特地來幫你的啦'],
 ['摸到人家算你好運','記得餵罐罐喔'],
];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const prog=(t,a,b)=>clamp((t-a)/(b-a));
const eOutBack=(x,s=1.7)=>1+(s+1)*Math.pow(x-1,3)+s*Math.pow(x-1,2);
const eInBack=x=>2.7*x*x*x-1.7*x*x;
const eOutCubic=x=>1-Math.pow(1-x,3);
function pickLine(line){
  if(Array.isArray(line)) return line;
  if(typeof line==='string'){ const m=line.split(/\n|｜|\|/); return m.length>1?m.slice(0,2):[line]; }
  if(typeof line==='number') return LINES[((line%LINES.length)+LINES.length)%LINES.length];
  let recent=[]; try{recent=JSON.parse(localStorage.getItem('mimi_cameo_recent')||'[]');}catch(_){}
  const pool=LINES.map((_,i)=>i).filter(i=>!recent.includes(i)); const i=pool[Math.floor(Math.random()*pool.length)];
  recent.push(i); recent=recent.slice(-4); try{localStorage.setItem('mimi_cameo_recent',JSON.stringify(recent));}catch(_){}
  return LINES[i];
}
let uid=0;
function mount(parent,opt={}){
  const A=root.MIMI_ART, id='mc'+(uid++)+'_', art=A.build('cameo',id);
  const g=document.createElementNS(NS,'g'); g.setAttribute('class','mimi-cameo'); g.style.display='none';
  const lines=pickLine(opt.line);
  const font='font-family="Noto Sans CJK TC, Noto Sans TC, Noto Sans JP, Noto Sans CJK JP, Source Han Sans, Yu Gothic, sans-serif" font-weight="700"';
  g.innerHTML=`<defs>${art.defs}</defs>
  <g class="mc-pos"><g class="mc-cat">${art.shadow}${art.cut}${art.art}</g>
   <g class="mc-spk">${[[40,150,1.1],[640,560,.85],[-20,420,.75]].map(([x,y,s])=>`<g transform="translate(${x} ${y}) scale(${s})" opacity="0">${[0,72,144,216,288].map(r=>`<path transform="rotate(${r})" d="M0 0C-18 -8 -17 -27 0 -25C17 -27 18 -8 0 0Z" fill="#E8665D" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`).join('')}<circle r="7" fill="#F2C14E"/></g>`).join('')}</g>
   <g class="mc-bub"><g class="mc-bub-in">
    <path class="mc-sh" fill="#7A3A4A" opacity=".14"/>
    <path class="mc-body" fill="#FFFFFF" stroke="#FF8FAB" stroke-width="10" stroke-linejoin="round"/>
    <rect class="mc-ring" fill="none" stroke="#FFE3EA" stroke-width="5" stroke-dasharray="3 14" stroke-linecap="round"/>
    <text class="mc-t1" text-anchor="middle" font-size="68" fill="#4A3B33" ${font}></text>
    <text class="mc-t2" text-anchor="middle" font-size="76" fill="#FF6F8E" ${font}></text>
   </g></g></g>`;
  parent.appendChild(g);
  const q=s=>g.querySelector(s), qa=s=>[...g.querySelectorAll(s)];
  const P=A.PIVOT, parts={}, pivots={}, wraps={};
  function wrapNode(e){
    if(!e||!e.parentNode) return e;
    if(e.parentNode.getAttribute&&e.parentNode.getAttribute('data-mcw')) return e.parentNode;
    const w=document.createElementNS(NS,'g');
    w.setAttribute('data-mcw','1');
    w.style.transformOrigin='0 0';
    w.style.transformBox='view-box';
    e.parentNode.insertBefore(w,e);
    w.appendChild(e);
    return w;
  }
  for(const k of ['head','tail','paw','body','sign','earL','earR','eyes']){
    parts[k]=qa(`[data-p="${k}"]`);
    const raw=P&&P[k]; const xy=typeof raw==='string'?raw.split(' '):[0,0];
    pivots[k]=[ +xy[0]||0, +xy[1]||0 ];
    wraps[k]=parts[k].map(wrapNode);
  }
  /* CSS transforms on wrappers — avoid per-frame setAttribute (4K long tasks / GC). */
  const setT=(k,a=0,sx=1,sy=sx,dx=0,dy=0)=>{
    const p=pivots[k]; if(!p) return;
    const v=`translate(${p[0]+dx}px,${p[1]+dy}px) rotate(${a.toFixed(2)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)}) translate(${-p[0]}px,${-p[1]}px)`;
    const list=wraps[k];
    for(let i=0;i<list.length;i++) list[i].style.transform=v;
  };
  /* bubble layout (cat art space: feet centre = 300,690; ear tips y≈0) */
  const t1=q('.mc-t1'), t2=q('.mc-t2'); t1.textContent=lines[0]||''; t2.textContent=lines[1]||'';
  const one=!lines[1];
  let w=0; try{w=Math.max(t1.getComputedTextLength(), t2.getComputedTextLength()*(one?0:1));}catch(_){}
  if(!w) w=Math.max(...lines.map(s=>[...s].length))*72;
  const side=opt.side==='left'?-1:1;
  const bw=Math.round(w+120), bh=one?170:250, bx= side>0?560:40-bw, by=-200;
  const tipX=side>0?505:95, tipY=150;                      // tail points at the raised paw / ear
  const jx=side>0?bx+70:bx+bw-70;
  const r=70, x0=bx,y0=by,x1=bx+bw,y1=by+bh;
  const tail = side>0 ? `L${jx+70},${y1} L${tipX},${tipY} L${jx},${y1}` : `L${jx},${y1} L${tipX},${tipY} L${jx-70},${y1}`;
  const d=`M${x0+r},${y0} L${x1-r},${y0} Q${x1},${y0} ${x1},${y0+r} L${x1},${y1-r} Q${x1},${y1} ${x1-r},${y1} ${tail} L${x0+r},${y1} Q${x0},${y1} ${x0},${y1-r} L${x0},${y0+r} Q${x0},${y0} ${x0+r},${y0} Z`;
  q('.mc-body').setAttribute('d',d); q('.mc-sh').setAttribute('d',d); q('.mc-sh').setAttribute('transform','translate(8 14)');
  const ring=q('.mc-ring'); ring.setAttribute('x',bx+16);ring.setAttribute('y',by+16);ring.setAttribute('width',bw-32);ring.setAttribute('height',bh-32);ring.setAttribute('rx',56);
  const cx=bx+bw/2; t1.setAttribute('x',cx); t2.setAttribute('x',cx);
  if(one){ t1.setAttribute('y',by+bh/2+24); } else { t1.setAttribute('y',by+100); t2.setAttribute('y',by+192); }
  const bub=q('.mc-bub-in'), spk=qa('.mc-spk > g'), pos=q('.mc-pos'), cat=q('.mc-cat');
  [pos,cat,bub].forEach(function(el){ if(el){ el.style.transformOrigin='0 0'; el.style.transformBox='view-box'; } });
  const spkMeta=spk.map(function(s){
    const raw=s.getAttribute('transform')||'';
    const m=raw.match(/translate\(([-\d.]+)\s+([-\d.]+)\)\s*scale\(([-\d.]+)\)/);
    s.removeAttribute('transform');
    s.style.transformOrigin='0 0';
    s.style.transformBox='view-box';
    return m?{x:+m[1],y:+m[2],s:+m[3]}:{x:0,y:0,s:1};
  });
  let X=2700,Y=1630;
  const ctl={el:g, lines, D:1.9,
    place(x,y){X=x;Y=y;},
    remove(){g.remove();},
    render(u,D){ D=D||ctl.D;
      if(!(u>=0&&u<=D)){ g.style.display='none'; return; }
      g.style.display='';
      pos.style.transform=`translate(${(X-300).toFixed(1)}px,${(Y-690).toFixed(1)}px)`;
      /* pop-in with hop + squash/stretch, landing squash, idle breathe, exit shrink-hop */
      const p=prog(u,0,0.4), sc=p<=0?0:eOutBack(p,1.3), st=Math.sin(Math.PI*p);
      let sx=sc*(1-0.06*st), sy=sc*(1+0.10*st), hop=-50*st;
      const l=prog(u,0.4,0.62); if(l>0&&l<1){const k=0.09*Math.sin(Math.PI*l);sx*=1+k;sy*=1-k;}
      if(u>0.62){ sy*=1+0.012*Math.sin((u-0.62)*6); }
      const e=prog(u,D-0.28,D);
      if(e>0){ const a=e<0.35? 0.06*Math.sin(Math.PI*e/0.35):0; const s=Math.max(0,1-eInBack(prog(e,0.2,1)));
        sx*= (1+a)*s; sy*=(1-a)*s; hop+=-50*Math.sin(Math.PI*prog(e,0.2,1)); }
      cat.style.transform=`translate(300px,${(690+hop).toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)}) translate(-300px,-690px)`;
      const lag=Math.exp(-u*5);
      setT('head', -1.5+2*Math.sin(u*3.4) + 3*lag*Math.sin(u*14));   /* v4 描圖版：頭只小幅歪（±5° 內），切割縫不會露 */
      setT('tail', 0);   /* C 款看不到尾巴：tail 為空群組 */
      const wv=prog(u,0.3,0.45)*(1-prog(u,D-0.36,D-0.26));
      setT('paw', 0);   /* 雙掌捧牌（靜止），不揮手 */ void wv;
      setT('sign', 0);
      const fl=prog(u,0.85,1.0); setT('earL', -6*Math.sin(Math.PI*fl)); setT('earR', 6*Math.sin(Math.PI*prog(u,0.9,1.05)));
      const bl=prog(u,1.15,1.29), bk=bl>0&&bl<1?1-0.9*Math.sin(Math.PI*bl):1; setT('eyes',0,1,bk);
      /* bubble: in 0.22–0.48, out D-0.30 → D-0.14 */
      const bp=prog(u,0.22,0.48), bo=prog(u,D-0.30,D-0.14);
      const bs=(bp<=0?0:eOutBack(bp,2.4))*(1-eInBack(bo)); const wob=bp>0?3*Math.sin((u-0.22)*9)*Math.exp(-(u-0.22)*3):0;
      bub.style.transform=`translate(${tipX}px,${tipY}px) rotate(${wob.toFixed(2)}deg) scale(${Math.max(0,bs).toFixed(4)}) translate(${-tipX}px,${-tipY}px)`;
      bub.style.opacity=bs>0.01?1:0;
      /* three small scarf-flowers pop on landing only (no glints/sparkles, per 坤哥哥) */
      for(let i=0;i<spk.length;i++){
        const s=spk[i], m=spkMeta[i], k=prog(u,0.36+i*0.06,0.86+i*0.06), o=k>0&&k<1?Math.sin(Math.PI*k):0;
        s.style.opacity=o.toFixed(3);
        s.style.transform=`translate(${m.x}px,${m.y}px) scale(${m.s}) rotate(${(k*90).toFixed(1)}deg)`;
      }

    }};
  return ctl;
}
root.MIMI_CAMEO={mount,LINES,pickLine};
})(typeof window!=='undefined'?window:globalThis);

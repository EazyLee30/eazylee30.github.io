/* Omarchy's MIT-licensed ttfx engine, fed with this site's own font bitmap. */
import init,{Session} from '/assets/vendor/ttfx/ttfx.js';
let ready;const cache=new Map();
const effects=['beams','decrypt','expand','fireworks','laseretch','middleout','print','rain','randomsequence','scattered','slice','slide','sweep','waves','wipe'];
const speeds={beams:450,decrypt:600,expand:160,fireworks:550,laseretch:720,middleout:150,print:720,rain:600,randomsequence:250,scattered:260,slice:180,slide:180,sweep:250,waves:450,wipe:160};
export async function createEffect(glyph,palette){
  ready??=init({module_or_path:'/assets/vendor/ttfx/all.wasm'});await ready;
  let last='';try{last=sessionStorage.getItem('eazylee-last-effect')||'';}catch(_){}
  const requested=new URLSearchParams(location.search).get('effect'),pool=effects.filter(e=>e!==last);
  const name=effects.includes(requested)?requested:pool[Math.floor(Math.random()*pool.length)];try{sessionStorage.setItem('eazylee-last-effect',name);}catch(_){}
  const width=glyph.width+12,height=glyph.height+8,blank=' '.repeat(width),text=[...Array(4).fill(blank),...glyph.rows.map(row=>' '.repeat(6)+row.replaceAll('1','█').replaceAll('0',' ')+' '.repeat(6)),...Array(4).fill(blank)].join('\n');
  function buffers(session){const n=session.width()*session.height();return {symbols:new Uint32Array(n),fg:new Uint32Array(n),bg:new Uint32Array(n),flags:new Uint8Array(n)};}
  function read(session,b){session.fill(b.symbols,b.fg,b.bg,b.flags);}
  let offset=cache.get(name);
  if(!offset){
    const probe=new Session(text,name,width,height,0,240,null,null);let alive=true;for(let guard=0;guard<100000&&alive;guard++)alive=probe.step();const b=buffers(probe);read(probe,b);const at=b.symbols.findIndex(s=>s===0x2588),expected=glyph.rows.findIndex(r=>r.includes('1')),col=glyph.rows[expected].indexOf('1');offset=at<0?{x:6,y:4}:{x:at%probe.width()-col,y:Math.floor(at/probe.width())-expected};probe.free();cache.set(name,offset);
  }
  const inks=palette.map(color=>{const nums=color.match(/\d+/g);return nums.slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');});
  const speed=speeds[name],session=new Session(text,name,width,height,undefined,speed,inks.join(','),null);let b=buffers(session),previous=-1,owed=0,start=-1,alive=session.step();
  return {name,free:()=>session.free(),draw(ctx,geometry,time,colorAt){
    if(start<0)start=time;if(previous<0)previous=time;owed=Math.min(owed+time-previous,100);previous=time;
    while(owed>1000/speed&&alive){owed-=1000/speed;alive=session.step();}
    if(!alive||time-start>4800)return false;
    if(b.symbols.length!==session.width()*session.height())b=buffers(session);read(session,b);
    const {x,y,cw,ch}=geometry,w=session.width();
    for(let i=0;i<b.symbols.length;i++){
      const symbol=b.symbols[i];if(!symbol||symbol===32||(b.flags[i]&32))continue;
      const col=i%w-offset.x,row=Math.floor(i/w)-offset.y;
      const xx=x+col*cw,yy=y+row*ch;ctx.fillStyle=colorAt(col,row);
      const x0=Math.round(xx),y0=Math.round(yy),tileWidth=Math.round(xx+cw)-x0,tileHeight=Math.round(yy+ch)-y0;
      if(symbol>=0x2580&&symbol<=0x259f)ctx.fillRect(x0,y0,tileWidth,tileHeight);
      else {const size=Math.max(1,Math.min(cw,ch)*.35);ctx.fillRect(Math.round(xx+(cw-size)/2),Math.round(yy+(ch-size)/2),size,size);}
    }
    return true;
  }};
}

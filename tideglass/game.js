'use strict';
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d');
const W=100,H=60,T=20,key='tideglass.world.v1',spawn={x:5.5,y:8};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),range=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const surface=x=>12+Math.round(Math.sin(x*.16)*1.4);
const strata=[
 {name:'산호 종유굴',material:'산호석',tool:'조류 장화',boss:'종유 게',x:32,y:43,color:'#f79e92',tile:9,hp:12},
 {name:'잿빛 용광로',material:'잿불광',tool:'열선 절단기',boss:'용광로 고리',x:72,y:54,color:'#ffc15e',tile:10,hp:16}
];
function lowerTile(x,y){
 if(y===H-1)return 8;
 if(y===35)return 11;
 if(y===47)return 12;
 const region=strata[Number(y>47)];
 if(Math.abs(x-region.x)<11&&y>=region.y-4&&y<=region.y)return 0;
 if((x*11+y*5)%13<3)return region.tile;
 return y>47?14:13;
}
function restoreWorld(old){
 const fresh=newWorld();
 if(old?.tiles?.length===W*36){
  fresh.tiles.splice(0,35*W,...old.tiles.slice(0,35*W));
  return {...fresh,...old,tiles:fresh.tiles};
 }
 return old?.tiles?.length===W*H?{...fresh,...old}:fresh;
}
function encounter(){
 const n=state.clears;
 if(!state.lit||n>=strata.length||state.tools<=n)return null;
 return strata[n];
}
function guardian(r){
 const wave=Math.sin(aimPhase*Math.PI/2);
 return {x:r.x+(r.tile===9?wave*6:wave*2),y:r.y-(r.tile===9?.3:1.8+Math.cos(aimPhase*Math.PI/2)*1.5)};
}
function deepGoal(){
 if(state.clears===2)return '침수항 복원 완료 · 자유 탐험과 건축';
 const r=strata[state.clears];
 return state.tools<=state.clears?r.name+' · '+r.material+' '+state.stock+'/4 → 제작':r.boss+' 탐색 · 등대 동쪽 '+(r.x-5)+'칸 / 깊이 '+r.y;
}
function newWorld(){
 const tiles=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const d=y-surface(x),vein=(x*11+y*7)%17;
  let v=d<0?0:d===0?1:d<=2?2:3;
  if(d>=3&&d<=12&&Math.sin(x*.25)+Math.cos(y*.72)>1.05)v=0;
  if(v&&d>0&&vein<3)v=4;
  if(v&&d>=3&&vein===5)v=5;
  if(x>=20&&x<=23&&d===3)v=5;
  if(y===H-1)v=8;
  tiles.push(y>=35?lowerTile(x,y):v);
 }
 return {tiles,clears:0,tools:0,stock:0,guardianHP:12,stone:0,ore:0,glass:0,drill:false,core:false,lit:false,bossHP:8};
}
let state=newWorld(),p,active=false,role='solo',peer,room='',friends=new Map(),link=null;
let timer=0,clock=0,swing=0,cool=0,mode='mine',cx=0,cy=0,scale=1,selected=null,hurt=0,bossCd=0,dirty=false;
const keys=new Set(),dust=[],colors=['#000','#5c6867','#665043','#374753','#b6754d','#4caaa5','#9c7053','#936441','#1c2933','#dc877f','#efa04e','#426f77','#803f3e','#514956','#4e393b'];
let boss={x:80,y:9},lastFrame=0,netTime=0,saveTime=0,aimPhase=0,lockedX=80;
function msg(t){$('toast').textContent=t;timer=3}
function save(){if(role==='solo'&&dirty){try{localStorage.setItem(key,JSON.stringify(state));dirty=false}catch{msg('기기 저장 공간을 확인하세요')}}}
function enter(r){
 role=r;p={...spawn,vx:0,vy:0,face:1,hp:5,ground:false};keys.clear();selected=null;cool=0;hurt=0;mode='mine';clock=0;aimPhase=0;
 $('mode').textContent='곡괭이';$('home').hidden=true;$('game').hidden=false;active=true;lastFrame=0;msg('좌우로 이동 · 가까운 지형을 눌러 채굴');requestAnimationFrame(frame);
}
$('solo').onclick=()=>{state=newWorld();try{const s=JSON.parse(localStorage.getItem(key));state=restoreWorld(s)}catch{}enter('solo')};
function leave(){save();active=false;peer?.destroy();peer=null;link=null;friends.clear();room='';keys.clear();$('game').hidden=true;$('home').hidden=false;$('status').textContent='';role='solo'}
$('back').onclick=leave;addEventListener('pagehide',save);
const tile=(x,y)=>x<0||x>=W||y>=H?8:y<0?0:state.tiles[y*W+x];
function solid(x,y){return tile(Math.floor(x),Math.floor(y))!==0}
function blocked(x,y){return [-.28,.28].some(a=>[-.82,-.1,.3].some(b=>solid(x+a,y+b)))}
function move(dt){
 p.vx=(+keys.has('right')- +keys.has('left'))*5.4;
 if(p.vx)p.face=Math.sign(p.vx);
 if(keys.has('jump')&&p.ground){p.vy=state.tools>=1?-12.8:-9.8;p.ground=false}
 p.vy=Math.min(13,p.vy+dt*22);
 const nx=p.x+p.vx*dt,ny=p.y+p.vy*dt;
 if(!blocked(nx,p.y))p.x=nx;
 if(!blocked(p.x,ny)){p.y=ny;p.ground=false}else{p.ground=p.vy>=0;p.vy=0}
}
function pieces(x,y,color){for(let i=0;i<8;i++)dust.push({x,y,vx:(Math.random()-.5)*4,vy:-Math.random()*4,life:.4,color})}
function target(){
 if(selected&&range(p,selected)<4.6)return selected;
 const x=Math.floor(p.x+p.face),y=Math.floor(p.y);
 if(mode==='build')return {x,y};
 for(const [a,b] of [[x,y],[x,y+1],[Math.floor(p.x),y+1]])if(tile(a,b))return {x:a,y:b};
 return {x,y};
}
function action(who,kind,x,y){
 const ret=t=>t;
 const r=encounter();
 if(r&&kind==='mine'&&range(who,guardian(r))<3.7){
  dirty=true;state.guardianHP-=state.tools===2?2:1;
  if(state.guardianHP<=0){state.clears++;state.guardianHP=16;state.stock=0;return r.boss+' 격파 · '+deepGoal()}
  return r.boss+' '+state.guardianHP+'/'+r.hp;
 }
 if(kind==='craft'){
  if(state.lit){
   const next=strata[state.clears];
   if(!next||state.tools>state.clears||state.stock<4)return deepGoal();
   state.stock-=4;state.tools++;dirty=true;return next.tool+' 완성 · '+deepGoal();
  }
  if(state.core&&!state.lit&&range(who,{x:5,y:surface(5)-1})<4){state.lit=true;dirty=true;return '등대 복구 완료! 항구의 불빛이 돌아왔어요.'}
  if(state.drill)return state.core?'서쪽 등대로 돌아가 제작을 누르세요':'공명 드릴 장착 중 · 동쪽의 유리나방을 찾아보세요';
  if(state.ore<3)return '공명 드릴 제작에 구리 3개가 필요해요';
  state.ore-=3;state.drill=true;dirty=true;return '공명 드릴 완성 · 청록빛 유리맥 채굴 가능';
 }
 if(!state.core&&state.drill&&state.glass>=2&&range(who,boss)<3.6&&kind==='mine'){
  state.bossHP--;dirty=true;pieces(boss.x,boss.y,'#ffe7ab');
  if(state.bossHP<=0){state.core=true;return '등대 불씨 회수! 서쪽 등대로 돌아가세요'}return '유리나방 균열 '+state.bossHP+'/8';
 }
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=W||y<0||y>=H-1||range(who,{x:x+.5,y:y+.5})>4.7)return '';
 const i=y*W+x,v=state.tiles[i];
 if(kind==='build'){
  if(v)return '';
  if(!state.stone)return '발판 재료가 필요해요 · 흙이나 돌을 캐세요';
  if([p,...[...friends.values()].map(f=>f.pos)].some(a=>a&&Math.abs(a.x-x-.5)<.8&&a.y+.3>y&&a.y-.82<y+1))return '';
  state.tiles[i]=6;state.stone--;
 }else{
  if(!v||v===8)return '';
  if(y>=35&&!state.lit)return '등대를 먼저 밝혀 주세요';
  if(y>=47&&state.clears<1)return '종유 게를 먼저 쓰러뜨리세요';
  if((v===11&&!state.lit)||(v===12&&state.clears<1))return v===11?'등대의 빛으로 봉인을 푸세요':'종유 게를 쓰러뜨려 열기를 낮추세요';
  if(v===9||v===10){
   if(!state.lit||v===10&&state.clears<1)return '상층 목표를 먼저 완료하세요';
   if(strata[state.clears]?.tile===v)state.stock++;
   state.tiles[i]=0;dirty=true;pieces(x+.5,y+.5,colors[v]);return strata[v-9].material+' 채굴';
  }
  if(v===5&&!state.drill)return '유리맥은 공명 드릴로 깰 수 있어요';
  if(v===4)state.ore++;else if(v===5)state.glass++;else state.stone++;
  state.tiles[i]=0;pieces(x+.5,y+.5,colors[v]);
 }
 dirty=true;return ret(v===4?'구리 +1':v===5?'유리 +1':'');
}
function use(kind=mode){
 if(cool>0)return;cool=.27;swing=.23;
 const {x,y}=target();
 if(role==='guest'){if(link?.open)link.send({type:'act',kind,x,y,pos:{x:p.x,y:p.y}});return}
 const note=action(p,kind,x,y);if(note)msg(note);
}
$('craft').onclick=()=>use('craft');$('mode').onclick=()=>{mode=mode==='mine'?'build':'mine';$('mode').textContent=mode==='mine'?'곡괭이':'발판';selected=null;msg(mode==='mine'?'채굴할 블록을 누르세요':'빈칸을 눌러 발판을 설치하세요')};
canvas.onpointerdown=e=>{selected={x:Math.floor(cx+e.offsetX/scale),y:Math.floor(cy+e.offsetY/scale)};use()};
for(const b of document.querySelectorAll('[data-key]')){
 const k=b.dataset.key;b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keys.add(k);if(k==='act')use()};
 b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(k);
}
const binds={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',KeyF:'act'};
onkeydown=e=>{if(!active)return;if(binds[e.code]){e.preventDefault();keys.add(binds[e.code])}};onkeyup=e=>keys.delete(binds[e.code]);onblur=()=>keys.clear();
function enemy(dt){
 const awake=state.drill&&state.glass>=2&&!state.core;
 const r=encounter();
 if(r){
  if(role!=='guest')aimPhase=clock%4;
  const a=guardian(r),contact=range(p,a)<1.2;
  const beam=r.tile===10&&aimPhase>3.3&&Math.abs(p.y-a.y)<.48&&Math.abs(p.x-a.x)<9;
  if((contact||beam)&&hurt<=0){hurt=1.3;if(--p.hp<=0){Object.assign(p,spawn,{vy:0,hp:5});msg('등대에서 재출발')}}
 }
 if(!awake)return;
 if(role!=='guest'){
  const a=[p,...[...friends.values()].map(f=>f.pos).filter(Boolean)].sort((a,b)=>Math.abs(a.x-80)-Math.abs(b.x-80))[0];
  const phase=clock%4.5;if(phase<2.7){lockedX=clamp(a.x,71,90);boss.x=80+Math.sin(clock)*2;boss.y=surface(80)-3.3+Math.sin(clock*3)*.45}
  else if(phase<3.1){/* briefly hover before the dive */}else{const u=Math.min(1,(phase-3.1)/1.4);boss.x=80+(lockedX-80)*Math.sin(u*Math.PI);boss.y=surface(Math.floor(boss.x))-3+2*Math.sin(u*Math.PI)}aimPhase=phase;
 }
 if(hurt<=0&&range(p,boss)<1.15){p.hp--;hurt=1.3;if(p.hp<=0){Object.assign(p,spawn,{vy:0,hp:5});msg('등대에서 다시 출발 · 모은 재료 보관')}}
}
function render(){
 const w=canvas.clientWidth,h=canvas.clientHeight,d=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d)}
 const landscape=w>h;
 const underground=p.y>surface(Math.floor(p.x))+2;
 scale=landscape?Math.max(13,Math.min(28,h/(underground?16:13))):Math.max(16,Math.min(36,w/19,h/15));
 const horizontalAnchor=landscape?(p.face<0?.61:.39):.45;
 const verticalAnchor=landscape?(underground?.38:.54):.54;
 cx=clamp(p.x-w/scale*horizontalAnchor,0,Math.max(0,W-w/scale));
 cy=clamp(p.y-h/scale*verticalAnchor,-10,Math.max(-10,H-h/scale));
 ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(7,18,31,'+clamp(.13+(p.y-12)*.04,.13,.82)+')';ctx.fillRect(0,0,w,h);
 ctx.scale(scale/T,scale/T);ctx.translate(-cx*T,-cy*T);
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h)};
 for(let y=Math.max(0,Math.floor(cy));y<Math.min(H,cy+h/scale+1);y++)for(let x=Math.max(0,Math.floor(cx));x<Math.min(W,cx+w/scale+1);x++){
  const v=tile(x,y);if(!v)continue;const X=x*T,Y=y*T,n=(x*43+y*17)%13;
  rect(X,Y,20.3,20.3,colors[v]);rect(X+n,Y+4+n%5,6,2,'#ffffff16');rect(X+2,Y+15,8,2,'#101c3149');
  if(!tile(x,y-1)){rect(X,Y,20,3,v===1?'#80ac91':'#99a3a5');if(v===1&&x%3===0){rect(X+4,Y-4,2,5,'#91b091');rect(X+6,Y-6,2,3,'#e9c58b')}}
  if(v===9||v===10){rect(X+5,Y+4,4,10,'#fff1c6');rect(X+9,Y+8,5,5,colors[v]);rect(X+12,Y+3,2,8,'#ffe1b0')}
  if(v===4||v===5){for(let j=0;j<3;j++){let a=X+3+(n+j*4)%13,b=Y+3+j*4;rect(a,b,5,4,v===4?'#de9467':'#69e0d2');rect(a,b,3,1,v===4?'#ffe0a6':'#c3fff0')}}
  if(v===6){rect(X,Y+4,20,2,'#edbc81');rect(X+4,Y+10,2,2,'#fbd39d')}
 }
 let L=5*T,B=surface(5)*T;rect(L-14,B-52,28,52,'#465563');rect(L-10,B-69,20,17,state.lit?'#fff2ad':'#91baba');rect(L-16,B-73,32,5,'#bd8566');rect(L-4,B-28,9,28,'#243341');
 function person(a,tint){
  const x=a.x*T,y=a.y*T,dir=a.face||1;ctx.save();ctx.translate(x,y);ctx.scale(dir,1);
  rect(-7,-6,6,12,'#182d3a');rect(2,-6,6,12,'#233b42');rect(-7,-15,15,13,tint);rect(-10,-16,5,12,'#825840');rect(-6,-22,14,10,'#c18b67');rect(-8,-23,18,4,'#303846');rect(-5,-28,12,7,'#d39c5e');rect(5,-26,4,4,'#fff4aa');rect(2,-20,7,3,'#3c6166');
  ctx.translate(7,-10);ctx.rotate(a===p&&swing>0?-.8+swing*6:-.45);rect(0,-1,13,3,'#ae8057');rect(10,-6,4,11,state.drill?'#80e7df':'#d2c8a6');ctx.restore()
 }
 for(const f of friends.values())if(f.pos)person(f.pos,'#a9a1e5');if(hurt<=0||Math.sin(clock*22)>0)person(p,'#d36e4c');
 if(state.drill&&state.glass>=2&&!state.core){
  ctx.save();ctx.translate(boss.x*T,boss.y*T);const flap=.8+.22*Math.sin(clock*11);
  for(const side of [-1,1]){ctx.save();ctx.scale(side,flap);ctx.fillStyle='#75bcb8';ctx.beginPath();ctx.moveTo(1,0);ctx.lineTo(27,-21);ctx.lineTo(20,4);ctx.lineTo(8,13);ctx.fill();rect(9,-4,8,3,'#ffde91');ctx.restore()}
  rect(-4,-8,8,18,'#e8b36f');rect(-18,-31,36*state.bossHP/8,3,'#ffc685');ctx.restore();
  if(aimPhase>2.7&&aimPhase<3.1)rect(lockedX*T-10,(surface(Math.floor(lockedX)))*T-3,20,3,'#ff946e');
 }
 const r=encounter();
 if(r){
  const a=guardian(r),x=a.x*T,y=a.y*T;
  if(r.tile===9){for(const side of [-1,1]){rect(x+side*19-4,y-13,8,15,r.color);rect(x+side*18-5,y+7,10,5,'#c87870')}rect(x-16,y-10,32,18,'#a76169');rect(x-10,y-14,20,6,r.color)}
  else{ctx.strokeStyle=r.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,18,0,2*Math.PI);ctx.stroke();if(aimPhase>2.6)rect(x-9*T,y-2,18*T,aimPhase>3.3?7:2,aimPhase>3.3?'#ffe697':'#ab6959')}
  rect(x-16,y-28,32*state.guardianHP/r.hp,3,r.color);
 }
 for(const f of dust)rect(f.x*T,f.y*T,3,3,f.color);
 $('loc').textContent=(room?'방 '+room+' · ':'')+(p.y>=35?strata[Number(p.y>47)].name+' '+Math.floor(p.y):p.y>16?'유리맥 지층':'침수항 해안')+'　'+'♥'.repeat(Math.max(0,p.hp));
 $('goal').textContent=state.lit?deepGoal():state.core?'서쪽 등대에서 제작 눌러 점등':!state.drill?'갈색 구리 3개 채굴 → 드릴 제작':state.glass<2?'지하 청록 유리맥 2개 채굴':'동쪽 끝 유리나방 · 접근 후 사용';
 $('bag').textContent='발판 '+state.stone+'　구리 '+state.ore+'　유리 '+state.glass;
}
function frame(now){
 if(!active)return;const dt=lastFrame?Math.min(.035,(now-lastFrame)/1000):.016;lastFrame=now;clock+=dt;timer-=dt;cool-=dt;hurt-=dt;swing-=dt;
 if(timer<=0)$('toast').textContent='';
 move(dt);enemy(dt);if(keys.has('act'))use();
 for(let i=dust.length-1;i>=0;i--){const f=dust[i];f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=dt*12;if((f.life-=dt)<=0)dust.splice(i,1)}
 saveTime+=dt;if(saveTime>.7){saveTime=0;save()}
 netTime+=dt;if(netTime>.12){netTime=0;sync()}render();requestAnimationFrame(frame);
}
let loader;
function loadPeer(){
 if(window.Peer)return Promise.resolve();
 if(!loader)loader=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';s.onload=ok;s.onerror=()=>{loader=null;no(Error('연결 모듈을 불러올 수 없어요'))};document.head.append(s)});
 return loader;
}
function cleanPos(v){
 if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))return null;
 return {x:clamp(v.x,0,W-1),y:clamp(v.y,-5,H-1),face:v.face<0?-1:1};
}
function sync(){
 if(role==='solo')return;
 if(role==='guest'){if(link?.open)link.send({type:'pos',pos:cleanPos(p)});return}
 const roster=Object.fromEntries([['host',cleanPos(p)],...[...friends].map(([id,f])=>[id,f.pos])]);
 for(const f of friends.values())if(f.conn.open)f.conn.send({type:'tick',roster,boss,aimPhase,lockedX,state:dirty?state:null});
 dirty=false;
}
async function connect(host){
 if(active||peer)return;
 const code=host?String(crypto.getRandomValues(new Uint32Array(1))[0]%900000+100000):$('code').value.trim();
 if(!/^\d{6}$/.test(code)){$('status').textContent='숫자 6자리 방 코드를 입력하세요';return}
 $('status').textContent='친구 연결 준비 중…';
 try{
  await loadPeer();if(peer||active)return;
  const node=host?new Peer('tideglass-v2-'+code):new Peer();peer=node;
  const deadline=setTimeout(()=>{if(peer===node&&!active)fail('연결 시간이 초과됐어요. 방 번호와 네트워크를 확인하세요.')},15000);
  function fail(note){if(peer!==node)return;clearTimeout(deadline);leave();$('status').textContent=note}
  node.on('error',e=>fail('연결 실패 · '+(e.type==='peer-unavailable'?'방이 열려 있는지 확인하세요':e.type)));
  node.on('open',()=>{
   if(host){clearTimeout(deadline);state=newWorld();room=code;enter('host');msg('친구에게 방 번호 '+code+' 공유');return}
   const c=node.connect('tideglass-v2-'+code,{reliable:true});link=c;
   c.on('data',d=>{
    if(d.type==='full'){fail('방 인원이 가득 찼어요');return}
    if(d.type==='welcome'){clearTimeout(deadline);state=d.state;room=code;enter('guest')}
    if(d.type==='note')msg(d.text);
    if(d.type==='tick'&&active){if(d.state)state=d.state;boss=d.boss;aimPhase=d.aimPhase;lockedX=d.lockedX;friends=new Map(Object.entries(d.roster).filter(([id,pos])=>id!==node.id&&pos).map(([id,pos])=>[id,{pos}]))}
   });c.on('close',()=>fail('방장이 항구를 닫았어요'));
  });
  if(host)node.on('connection',c=>{
   c.on('open',()=>{
    if(friends.size>=3){c.send({type:'full'});setTimeout(()=>c.close(),350);return}
    friends.set(c.peer,{conn:c,pos:{...spawn},last:0});c.send({type:'welcome',state})
   });
   c.on('data',d=>{const f=friends.get(c.peer);if(!f||!d)return;
    const pos=cleanPos(d.pos);if(pos)f.pos=pos;
    if(d.type==='act'&&['mine','build','craft'].includes(d.kind)&&performance.now()-f.last>190){f.last=performance.now();const note=action(f.pos,d.kind,d.x,d.y);if(note)c.send({type:'note',text:note})}
   });c.on('close',()=>friends.delete(c.peer))
  });
 }catch(e){if(peer)leave();$('status').textContent=e.message}
}
$('host').onclick=()=>connect(true);$('join').onsubmit=e=>{e.preventDefault();connect(false)};

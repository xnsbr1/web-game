'use strict';
const $=id=>document.getElementById(id),cv=$('field'),ctx=cv.getContext('2d');
const world={w:1440,h:1000},limit=(v,min,max)=>Math.max(min,Math.min(max,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const skills=[
 ['등불 파편','✦','#ffd296','가까운 적을 추적하는 빛 조각. 강화하면 대상 수 증가.'],
 ['불씨 발자국','❋','#ff9864','이동 경로에 타는 불씨를 남긴다.'],
 ['자석 작살','↪','#bed4e2','적을 한 점으로 끌어모아 연쇄 공격한다.'],
 ['회전 갈고리','◉','#b4e6ce','주변을 도는 갈고리로 포위를 뚫는다.'],
 ['압력 물줄기','≋','#62dbe9','이동 방향을 쓸고 적을 뒤로 밀어낸다.'],
 ['서리 종','✳','#ccecff','넓은 범위의 적을 느리게 하고 피해를 준다.'],
 ['피뢰 기둥','ϟ','#c8a9ff','뒤에 기둥을 세워 이동 경로에 전류를 잇는다.'],
 ['유리 제비','◇','#99f4cf','적 쪽으로 날아간 뒤 돌아오며 또 공격한다.']
];
const fusion=[
 {pair:[1,2],name:'도화선',text:'작살이 지나온 불씨를 이어 폭발시킨다.',color:'#ffae62'},
 {pair:[4,6],name:'낙뢰 수로',text:'젖은 적을 타고 번개가 튄다.',color:'#9ad7ff'},
 {pair:[3,5],name:'얼음 닻',text:'얼음 파동이 포위를 깨고 적을 밀어낸다.',color:'#d9f5ff'},
 {pair:[0,7],name:'항로등',text:'유리 제비의 왕복 항로에 빛이 연쇄로 터진다.',color:'#ffe6ab'}
];
const crew=[
 {name:'등불지기',start:0,hp:110,speed:180,color:'#ffc477',desc:'빛 조각 · 안정적인 원거리 공격'},
 {name:'잠수공',start:4,hp:145,speed:169,color:'#88def4',desc:'물줄기 · 높은 최대 체력'},
 {name:'견인공',start:3,hp:96,speed:200,color:'#b7edbb',desc:'갈고리 · 빠른 이동'}
];
const storage='stormlight-progress-v1';
let progress={best:0,wins:0},selected=0,g=null,frameId=0,last=0,sound;
try{progress={...progress,...JSON.parse(localStorage.getItem(storage))}}catch{}
const keys=new Set(),stick={id:null,x:0,y:0,dx:0,dy:0};let camera={x:0,y:0,w:0,h:0,s:1};
const crane={x:720,y:500},containers=[[280,259,120,32],[1015,278,109,40],[310,740,96,40],[1005,732,133,33]];
function button(name,text,click,color){
 const b=document.createElement('button'),t=document.createElement('strong');b.className='pick';b.type='button';t.textContent=name;b.append(t);
 if(text){const detail=document.createElement('small');detail.textContent=text;b.append(detail)}
 if(color)b.style.setProperty('--skill',color);b.onclick=click;return b;
}
function home(){
 cancelAnimationFrame(frameId);g=null;clearInput();$('battle').hidden=true;$('overlay').hidden=true;$('home').hidden=false;
 $('crew-options').replaceChildren(...crew.map((c,i)=>{
  const b=button(c.name,c.desc,()=>{selected=i;home()});b.className='crew';b.setAttribute('aria-pressed',String(selected===i));return b;
 }));
 $('record').textContent='최고 생존 '+time(progress.best)+' · 구조 성공 '+progress.wins+'회'+(progress.wins?' · 피뢰 기둥 시작 장비 해금':'');
 $('catalog').replaceChildren(...[...skills.map(s=>s[1]+' '+s[0]+' · '+s[3]),...fusion.map(f=>f.name+' · '+f.pair.map(i=>skills[i][0]).join(' + '))].map(t=>{const d=document.createElement('div');d.textContent=t;return d}));
}
const time=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
function clearInput(){keys.clear();stick.id=null;stick.dx=stick.dy=0}
function beep(freq,duration=.08){
 if(!sound||sound.state!=='running')return;
 const o=sound.createOscillator(),v=sound.createGain();o.frequency.value=freq;o.type='triangle';v.gain.setValueAtTime(.075,sound.currentTime);v.gain.exponentialRampToValueAtTime(.001,sound.currentTime+duration);o.connect(v).connect(sound.destination);o.start();o.stop(sound.currentTime+duration)
}
function start(starter=crew[selected].start){
 cancelAnimationFrame(frameId);clearInput();
 const c=crew[selected];g={t:0,p:{x:720,y:540,hp:c.hp,max:c.hp,speed:c.speed,face:0,color:c.color,inv:0,moving:false},en:[],gems:[],fx:[],fire:[],posts:[],levels:Array(8).fill(0),cd:Array(8).fill(.15),up:new Set(),xp:0,next:4,lv:1,kills:0,spawn:.3,notice:'',noticeEnd:0,craneReady:0,stage:'play',boss:null,warning:null};
 g.levels[starter]=1;$('home').hidden=true;$('battle').hidden=false;$('overlay').hidden=true;
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){sound??=new Audio();sound.resume().catch(()=>{})}}catch{}
 notice('화면을 끌어 이동 · 공격은 자동',9);loadout();last=0;frameId=requestAnimationFrame(frame);
}
$('start').onclick=()=>progress.wins?dialog('출동 준비','시작 장비',[
 button(skills[crew[selected].start][0],'구조대원 기본 장비',()=>start()),
 button(skills[6][0],'클리어 보상 장비',()=>start(6)),
 button('돌아가기','',home)
]):start();
function notice(text,d=3){g.notice=text;g.noticeEnd=g.t+d}
function dialog(tag,title,choices){clearInput();$('over-tag').textContent=tag;$('over-title').textContent=title;$('choices').replaceChildren(...choices);$('overlay').hidden=false}
function loadout(){
 $('loadout').replaceChildren(...g.levels.flatMap((lv,i)=>{
  if(!lv)return [];const e=document.createElement('span');e.className='chip';e.textContent=skills[i][1]+lv;e.style.color=skills[i][2];e.title=skills[i][0];return [e];
 }),...[...g.up].map(i=>{const e=document.createElement('span');e.className='chip';e.textContent=fusion[i].name;e.style.color=fusion[i].color;return e}));
}
function resume(){if(!g)return;g.stage='play';$('overlay').hidden=true}
$('pause').onclick=()=>{if(g?.stage==='play'){g.stage='pause';dialog('일시 정지','출동 중',[
 button('계속하기','',resume),button('기지로 돌아가기','현재 출동 종료',home)])}};
function levelUp(){
 g.stage='pick';beep(610,.14);
 const options=[];
 for(const [i,f] of fusion.entries())if(!g.up.has(i)&&f.pair.every(j=>g.levels[j]>0)&&f.pair.some(j=>g.levels[j]===3)){
  options.push(button(f.name+' · 융합',f.text,()=>{g.up.add(i);loadout();notice(f.name+' 가동');resume()},f.color));break;
 }
 const choices=g.levels.flatMap((lv,i)=>lv<3?[i]:[]);
 for(let i=choices.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]]}
 // Early offers always contain a weapon and, when available, a compatible partner.
 const pair=fusion.find(f=>f.pair.some(i=>g.levels[i]>0)&&f.pair.some(i=>g.levels[i]===0));
 const partner=pair?.pair.find(i=>g.levels[i]===0);
 if(partner!==undefined)choices.splice(choices.indexOf(partner),1),choices.unshift(partner);
 if(g.lv%2===1){const owned=choices.find(i=>g.levels[i]>0);if(owned!==undefined)choices.splice(choices.indexOf(owned),1),choices.unshift(owned)}
 for(const i of choices.slice(0,3-options.length)){
  const s=skills[i];options.push(button(s[1]+' '+s[0]+'  Lv.'+(g.levels[i]+1),s[3],()=>{g.levels[i]++;g.cd[i]=.05;loadout();resume()},s[2]));
 }
 while(options.length<3){
  const boost=[['응급 치료','체력 30 회복',()=>g.p.hp=Math.min(g.p.max,g.p.hp+30)],['경량 장비','이동 속도 +8',()=>g.p.speed+=8],['안전 조끼','최대 체력과 현재 체력 +10',()=>{g.p.max+=10;g.p.hp+=10}]];
  const [name,desc,apply]=boost[options.length];options.push(button(name,desc,()=>{apply();resume()}));
 }
 dialog('LEVEL '+g.lv,'장비를 선택하세요',options);
}
function finish(win){
 g.stage='end';progress.best=Math.floor(Math.max(progress.best,g.t));if(win)progress.wins++;
 try{localStorage.setItem(storage,JSON.stringify(progress))}catch{}
 beep(win?850:165,.32);
 dialog(time(g.t)+' 생존 · '+g.kills+'마리 정리',win?'닻등 게 격파!':'출동 종료',[
 button('다시 출동','',()=>start()),button('기지로 돌아가기',win?'피뢰 기둥을 시작 장비로 선택할 수 있어요':'',home)]);
}
function spawn(kind){
 const p=g.p,a=Math.random()*Math.PI*2,d=limit(Math.min(camera.w,camera.h)/(2*camera.s)+32,240,360);
 const presets=[[24,52,11,'#6ebebb'],[21,84,9,'#c6acdb'],[53,44,16,'#71b892'],[38,61,12,'#f5ba79']];
 const [hp,speed,r,color]=presets[kind];
 const e={x:limit(p.x+Math.cos(a)*d,18,world.w-18),y:limit(p.y+Math.sin(a)*d,18,world.h-18),kind,hp,max:hp,speed,r,color,slow:0,wet:0,hit:0,angle:a};
 g.en.push(e);return e;
}
function bossSpawn(){
 const b=spawn(2);Object.assign(b,{boss:true,hp:1160,max:1160,speed:58,r:31,color:'#e4aa72',next:g.t+4,exposed:0,charge:0});
 g.boss=b;notice('닻등 게 출현 · 붉은 돌진 경로를 피하세요',5);beep(220,.25);
}
function fx(type,x,y,color,extra={}){g.fx.push({type,x,y,color,life:.34,max:.34,...extra});if(g.fx.length>135)g.fx.shift()}
function hit(e,n){
 if(e.hp<=0)return;
 e.hp-=n*(e.boss&&e.exposed>g.t?1.55:1);e.hit=.12;
 if(e.hp<=0){
  g.kills++;fx('burst',e.x,e.y,e.color,{r:e.r+10});
  if(!e.boss){g.gems.push({x:e.x,y:e.y,v:e.kind===2?2:1});if(g.gems.length>210){g.gems[1].v+=g.gems[0].v;g.gems.shift()}}
 }
}
function area(x,y,r,n,color,slow=0){
 fx('ring',x,y,color,{r});
 for(const e of g.en)if(dist(e,{x,y})<r+e.r){hit(e,n);e.slow=Math.max(e.slow,slow)}
}
function ray(x,y,e,color,n){fx('line',x,y,color,{ex:e.x,ey:e.y});hit(e,n)}
function push(e,x,y,m){
 if(e.boss)return;
 const d=Math.max(1,dist(e,{x,y}));e.x=limit(e.x+(e.x-x)/d*m,12,world.w-12);e.y=limit(e.y+(e.y-y)/d*m,12,world.h-12);
}
function cast(i,l,near){
 const p=g.p,s=skills[i],c=s[2],target=near[0];
 switch(i){
 case 0:
  for(const e of near.slice(0,l+(g.up.has(3)?2:0)))ray(p.x,p.y,e,c,15+l*6);
  if(g.up.has(3)&&target)area(target.x,target.y,62,21,c);
  return .92;
 case 1:
  if(p.moving){g.fire.push({x:p.x,y:p.y,end:g.t+2+l*.45,next:0,l});if(g.fire.length>22)g.fire.shift()}
  return .32;
 case 2:
  if(target){
   ray(p.x,p.y,target,c,18+l*7);
   for(const e of near.slice(1,3+l))if(dist(e,target)<155){push(e,target.x,target.y,-Math.min(42,dist(e,target)));ray(target.x,target.y,e,c,8+l*4)}
   if(g.up.has(0))for(const f of g.fire.splice(0))area(f.x,f.y,61,20,c);
  }
  return 2.25;
 case 3:
  area(p.x,p.y,57+l*15,11+l*6,c);
  if(g.up.has(2)){area(p.x,p.y,115,12,'#dcf8ff',1.5);for(const e of near)if(dist(e,p)<115)push(e,p.x,p.y,48)}
  return .83;
 case 4:
  {
   const ux=Math.cos(p.face),uy=Math.sin(p.face),r=120+l*35;
   fx('line',p.x,p.y,c,{ex:p.x+ux*r,ey:p.y+uy*r,width:12+l*3});
   for(const e of g.en){const dx=e.x-p.x,dy=e.y-p.y,along=dx*ux+dy*uy;
    if(along>-10&&along<r&&Math.abs(dx*uy-dy*ux)<30+l*5){hit(e,18+l*10);e.wet=3;push(e,p.x,p.y,30)}
   }
   return 1.24;
  }
 case 5:area(p.x,p.y,80+l*23,9+l*7,c,1.5+l*.25);return 2.5;
 case 6:
  {
   const old=g.posts.at(-1),post={x:p.x,y:p.y,end:g.t+4};g.posts.push(post);area(post.x,post.y,50+l*13,15+l*8,c);
   if(old){const dx=post.x-old.x,dy=post.y-old.y,den=Math.max(1,dx*dx+dy*dy);fx('line',old.x,old.y,c,{ex:post.x,ey:post.y});for(const e of g.en){const t=limit(((e.x-old.x)*dx+(e.y-old.y)*dy)/den,0,1);if(Math.hypot(e.x-old.x-t*dx,e.y-old.y-t*dy)<22)hit(e,13+l*7)}}
   if(g.up.has(1)){const wet=g.en.filter(e=>e.wet>0).sort((a,b)=>dist(a,p)-dist(b,p)).slice(0,7);let from=p;for(const e of wet){ray(from.x,from.y,e,'#d9ebff',24);from=e}}
   return 1.65;
  }
 case 7:
  if(target){const end={x:target.x,y:target.y};fx('bird',p.x,p.y,c,{ex:end.x,ey:end.y,life:.75,max:.75});hit(target,18+l*7);g.bird={...end,at:g.t+.4,l}}
  return 1.62;
 }
}
function step(dt){
 const p=g.p;g.t+=dt;p.inv-=dt;
 const x=stick.dx+Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
 const y=stick.dy+Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
 const mag=Math.hypot(x,y);p.moving=mag>.08;
 if(p.moving){p.face=Math.atan2(y,x);const nx=limit(p.x+x/Math.max(1,mag)*p.speed*dt,19,world.w-19),ny=limit(p.y+y/Math.max(1,mag)*p.speed*dt,19,world.h-19);
  const blocked=(a,b)=>containers.some(([x,y,w,h])=>a>x-10&&a<x+w+10&&b>y-10&&b<y+h+10);
  if(!blocked(nx,p.y))p.x=nx;if(!blocked(p.x,ny))p.y=ny;
 }
 if(!g.boss&&g.t>=193)bossSpawn();
 if((g.spawn-=dt)<=0&&g.en.length<125){
  const phase=g.t<36?1:g.t<79?2:g.t<128?3:4;
  for(let i=0;i<1+Math.floor(g.t/55);i++)spawn(Math.floor(Math.random()*phase));
  g.spawn=g.boss?1.5:Math.max(.62,1.65-g.t*.0053);
 }
 for(const e of g.en){
  if(e.hp<=0)continue;
  const d=dist(e,p);e.hit-=dt;e.slow-=dt;e.wet-=dt;
  if(e.boss&&g.t>=e.next&&!g.warning&&e.charge<=0){
   g.warning={x:e.x,y:e.y,a:Math.atan2(p.y-e.y,p.x-e.x),until:g.t+.85};
  }
  if(e.boss&&g.warning?.until<=g.t){e.angle=g.warning.a;e.charge=.55;g.warning=null}
  if(e.boss&&e.charge>0){
   e.charge-=dt;e.x+=Math.cos(e.angle)*400*dt;e.y+=Math.sin(e.angle)*400*dt;
   if(e.charge<=0){e.exposed=g.t+2;e.next=g.t+5;area(e.x,e.y,76,0,'#ffae7a');if(d<76&&p.inv<=0){p.hp-=21;p.inv=.7}}
  }else if(d>1&&!(e.boss&&(g.warning||e.exposed>g.t))){
   const speed=e.speed*(e.slow>0?.43:1);
   e.angle=Math.atan2(p.y-e.y,p.x-e.x);
   e.x+=(p.x-e.x)/d*speed*dt;e.y+=(p.y-e.y)/d*speed*dt;
  }
  e.x=limit(e.x,12,world.w-12);e.y=limit(e.y,12,world.h-12);
  if(d<e.r+12&&p.inv<=0){p.hp-=e.boss?22:10;p.inv=.59;beep(130)}
 }
 const near=g.en.filter(e=>e.hp>0&&dist(e,p)<275).sort((a,b)=>dist(a,p)-dist(b,p));
 g.levels.forEach((l,i)=>{if(l&&((g.cd[i]-=dt)<=0))g.cd[i]=cast(i,l,near)});
 for(const f of g.fire)if(g.t>=f.next){f.next=g.t+.36;for(const e of g.en)if(dist(e,f)<23+f.l*6)hit(e,5+f.l*2)}
 if(g.bird&&g.t>=g.bird.at){const f=g.bird;area(f.x,f.y,g.up.has(3)?91:57,13+f.l*6,skills[7][2]);g.bird=null}
 g.fire=g.fire.filter(f=>g.t<f.end);g.posts=g.posts.filter(f=>g.t<f.end);g.en=g.en.filter(e=>e.hp>0);g.fx=g.fx.filter(f=>(f.life-=dt)>0);
 const keep=[];
 for(const f of g.gems){const d=dist(f,p);if(d<24){g.xp+=f.v;continue}
  if(d<88){f.x+=(p.x-f.x)/d*250*dt;f.y+=(p.y-f.y)/d*250*dt}keep.push(f);
 }
 g.gems=keep;
 if(g.boss?.hp<=0){finish(true);return}
 if(p.hp<=0||g.t>=270){finish(false);return}
 if(g.xp>=g.next){g.xp-=g.next;g.lv++;g.next=Math.min(27,4+g.lv*2);p.hp=Math.min(p.max,p.hp+13);levelUp()}
}
$('crane').onclick=()=>{
 if(g?.stage!=='play'||dist(g.p,crane)>108||g.t<g.craneReady)return;
 g.craneReady=g.t+26;g.craneDrop=g.t;area(crane.x,crane.y,155,92,'#ffc97d');notice('화물 투하 · 26초 뒤 재사용');beep(290,.2);
};
const art=new Image();art.src=getComputedStyle(document.documentElement).getPropertyValue('--pier').trim().slice(4,-1);
function draw(){
 const {clientWidth:w,clientHeight:h}=cv;if(!w||!h)return;const d=Math.min(2,devicePixelRatio||1);
 if(cv.width!==Math.round(w*d)||cv.height!==Math.round(h*d)){cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
 const p=g.p,s=Math.max(.73,Math.min(1.14,Math.min(w,h)/455));
 const x=limit(p.x-w/(2*s),0,Math.max(0,world.w-w/s)),y=limit(p.y-h/(2*s),0,Math.max(0,world.h-h/s));
 camera={x,y,w,h,s};ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#092530';ctx.fillRect(0,0,w,h);ctx.scale(s,s);ctx.translate(-x,-y);
 if(art.complete&&art.naturalWidth){ctx.globalAlpha=.34;ctx.drawImage(art,0,0,world.w,world.h);ctx.globalAlpha=1}
 const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h)};
 const ring=(x,y,r,c,width=2)=>{ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke()};
 const dot=(x,y,r,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()};
 const line=(x,y,ex,ey,c,width=2)=>{ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke()};
 for(let i=0;i<world.w;i+=80)rect(i,0,1,world.h,'#78b4aa18');
 for(let i=0;i<world.h;i+=80)rect(0,i,world.w,1,'#78b4aa18');
 ctx.strokeStyle='#ba8d53';ctx.lineWidth=6;ctx.strokeRect(5,5,world.w-10,world.h-10);
 for(const [x,y,w,h] of containers){
  rect(x+5,y+7,w,h,'#06131caa');rect(x,y,w,h,'#426264');rect(x,y,w,5,'#9aaa92');rect(x,y+h-6,w,6,'#182e39');
  for(let j=8;j<w-6;j+=12)rect(x+j,y+7,2,h-15,'#27454c');
 }
 ring(crane.x,crane.y,108,g.t>=g.craneReady?'#f4bb674f':'#65828a40');
 const mastX=crane.x-50,mastY=crane.y-36;
 rect(mastX-16,mastY-8,32,35,'#071c26aa');
 rect(mastX-12,mastY-18,24,29,'#655846');
 rect(mastX-9,mastY-18,18,23,'#bc884e');
 line(mastX,mastY-17,crane.x+18,mastY-37,'#e2ac63',6);
 line(mastX,mastY-7,crane.x+18,mastY-37,'#805e43',3);
 for(let j=0;j<4;j++)line(mastX+j*15,mastY-10-j*6,mastX+8+j*15,mastY-20-j*4,'#dfaa61');
 const fall=limit((g.t-(g.craneDrop??-2))*3,0,1);
 const hookY=crane.y-36+Math.sin(fall*Math.PI)*37;
 line(crane.x+18,mastY-37,crane.x+18,hookY,'#e8d6aa',2);
 rect(crane.x+5,hookY,26,18,'#5f4f45');
 for(let j=0;j<3;j++)rect(crane.x+7+j*8,hookY+3,4,12,'#efb462');
 for(const f of g.fire){dot(f.x,f.y,15+f.l*3,'#fc744b30');rect(f.x-2,f.y-4,4,8,'#ffbc64')}
 for(const f of g.posts){rect(f.x-2,f.y-14,4,16,'#cdb3ff');dot(f.x,f.y-12,5,'#aa87ff85')}
 for(const f of g.gems){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(Math.PI/4);rect(-4,-4,8,8,'#6edec0');rect(-4,-4,7,2,'#d9fff0');ctx.restore()}
 for(const e of g.en){
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle);const r=e.r,c=e.hit>0?'#fff2e0':e.color;
  dot(-1,4,r+2,'#071d24b0');
  if(e.boss){for(const side of [-1,1]){for(let j=0;j<3;j++)line(-15+j*12,side*15,-25+j*13,side*34,'#965d46',7);rect(10,side*24-8,25,15,'#bb7854');rect(29,side*24-7,9,5,c)}}
  else if(e.kind===1){line(-9,-10,0,-4,c,5);line(-9,10,0,4,c,5)}
  else if(e.kind===2){rect(-12,-19,22,38,'#447461')}
  else if(e.kind===3){rect(-16,-8,11,16,'#895f4d');rect(-13,-6,6,4,'#fbd59b')}
  dot(0,0,r,c);dot(r*.34,0,r*.53,e.boss?'#985c4d':'#315862');rect(r*.55,-4,5,3,'#fbd297');rect(r*.55,2,5,3,'#fbd297');ctx.restore();
  if(e.boss){rect(e.x-35,e.y-48,70,5,'#391f27');rect(e.x-35,e.y-48,70*e.hp/e.max,5,'#ff927c')}
 }
 for(const f of g.fx){
  const t=1-f.life/f.max;ctx.globalAlpha=1-t;
  if(f.type==='line'){line(f.x,f.y,f.ex,f.ey,f.color,f.width||5);line(f.x,f.y,f.ex,f.ey,'#fff6d8',2)}
  else if(f.type==='bird'){const u=1-Math.abs(2*t-1);let a=f.x+(f.ex-f.x)*u,b=f.y+(f.ey-f.y)*u;line(a-9,b+4,a,b-5,f.color,4);line(a,b-5,a+9,b+4,f.color,4)}
  else ring(f.x,f.y,f.r*(.25+.75*t),f.color,4);
 }ctx.globalAlpha=1;
 if(g.warning){const {x,y,a}=g.warning;line(x,y,x+Math.cos(a)*235,y+Math.sin(a)*235,'#f65f5582',31);line(x,y,x+Math.cos(a)*235,y+Math.sin(a)*235,'#ffaf79',2)}
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.face);dot(0,3,14,'#071b23');rect(-8,-12,15,24,p.inv>0?'#ffdcd2':p.color);dot(3,0,9,'#f2d19f');rect(4,-7,5,14,'#295561');rect(-13,-7,5,14,'#705946');rect(9,6,7,5,'#ffe09d');ctx.restore();
 if(stick.id!==null){ctx.setTransform(d,0,0,d,0,0);ring(stick.x,stick.y,38,'#d2ece484',2);dot(stick.x+stick.dx*28,stick.y+stick.dy*28,13,'#c4e6dca0')}
}
function hud(){
 $('time').textContent=time(g.t);$('event').textContent=g.boss?'닻등 게':g.t>=155?'보스 접근 중':'폭풍 부두';
 $('hp').style.setProperty('--progress',100*Math.max(0,g.p.hp)/g.p.max+'%');$('xp').style.setProperty('--progress',Math.min(100,100*g.xp/g.next)+'%');
 $('stats').textContent='Lv.'+g.lv+' · '+Math.ceil(Math.max(0,g.p.hp))+' / '+g.p.max+' HP · '+g.kills+' 처치';
 $('hint').hidden=g.t>=g.noticeEnd;$('hint').textContent=g.notice;
 $('crane').hidden=g.stage!=='play'||dist(g.p,crane)>108||g.t<g.craneReady;
}
function frame(now){
 if(!g)return;
 const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
 if(g.stage==='play')step(dt);draw();hud();frameId=requestAnimationFrame(frame);
}
cv.addEventListener('pointerdown',e=>{if(g?.stage!=='play'||stick.id!==null)return;e.preventDefault();stick.id=e.pointerId;stick.x=e.clientX;stick.y=e.clientY;cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointermove',e=>{if(e.pointerId!==stick.id)return;const dx=e.clientX-stick.x,dy=e.clientY-stick.y,d=Math.max(38,Math.hypot(dx,dy));stick.dx=dx/d;stick.dy=dy/d});
for(const name of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(name,e=>{if(e.pointerId===stick.id){stick.id=null;stick.dx=stick.dy=0}});
for(const name of ['dblclick','dragstart','selectstart','contextmenu'])$('battle').addEventListener(name,e=>e.preventDefault());
cv.addEventListener('touchend',e=>e.preventDefault(),{passive:false});
addEventListener('keydown',e=>{if(g?.stage==='play'&&/^(Arrow|Key[WASD]$)/.test(e.code)){e.preventDefault();keys.add(e.code)}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',clearInput);
home();

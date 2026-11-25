import {randomBytes} from 'node:crypto';

const rooms=new Map();
const bound=(n,min,max)=>Math.max(min,Math.min(max,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const reject=(status,message)=>{throw Object.assign(new Error(message),{status});};
const player=i=>({x:130+60*i,y:275,hp:100,gun:'rifle',ready:false,cd:0,shot:0,heal:0,rescues:0,opened:0,revive:0,inv:0});
function relay(room,dt){
 const s=room.state;
 if(s.phase!=='battle')return;
 s.t+=dt;
 const live=s.players.filter(p=>p.hp>0);
 if(!live.length||s.t>260){s.phase='lost';return;}
 if(s.t>=s.spawnAt&&s.mobs.length<(s.t<36?6:4)){
  s.mobs.push({x:room.seq%2?35:565,y:65+(room.seq++*113)%330,hp:44});
  s.spawnAt=s.t+(s.t<36?2.8:5);
 }
 if(s.t>=36&&!s.boss)s.boss={x:460,y:190,hp:4200,max:4200,weak:0,next:42,rail:0,lane:0,charge:0,locked:false};
 const hit=(p,amount)=>{if(p.hp>0&&p.inv<=0){p.hp=Math.max(0,p.hp-amount);p.inv=.8;}};
 const closest=(list,o)=>list.reduce((best,p)=>!best||distance(o,p)<distance(o,best)?p:best,null);
 s.rays=[];
 for(const [i,p] of s.players.entries()){
  const cmd=room.inputs[i];
  if(Date.now()-cmd.at>500){cmd.x=0;cmd.y=0;cmd.dash=false;}
  p.inv=Math.max(0,p.inv-dt);p.cd=Math.max(0,p.cd-dt);
  if(!p.hp)continue;
  const len=Math.hypot(cmd.x,cmd.y);
  if(len>.02)p.dir=Math.atan2(cmd.y,cmd.x);
  if(cmd.dash&&p.cd<=0){p.cd=4;p.dash=.15;}
  cmd.dash=false;
  const speed=p.dash>0?370:90;
  p.x=bound(p.x+dt*speed*(p.dash>0?Math.cos(p.dir||0):cmd.x/Math.max(1,len)),14,586);
  p.y=bound(p.y+dt*speed*(p.dash>0?Math.sin(p.dir||0):cmd.y/Math.max(1,len)),14,426);
  p.dash=Math.max(0,(p.dash||0)-dt);
  const mate=s.players[1-i];
  if(!mate.hp){
   mate.revive=distance(p,mate)<49?mate.revive+dt:0;
   if(mate.revive>=1.7){mate.hp=48;mate.inv=2;mate.revive=0;p.rescues++;}
  }
  const target=closest(s.boss?[...s.mobs,s.boss]:s.mobs,p);
  if(target&&distance(target,p)<(p.gun==='scout'?310:220)&&s.t>=p.shot){
   const dmg=p.gun==='scout'?25:10;
   target.hp-=dmg*(target===s.boss&&s.boss.weak>s.t?2.5:1);
   p.shot=s.t+(p.gun==='scout'?.82:.31);p.ray={x:target.x,y:target.y,until:s.t+.16};
  }
 }
 for(const mob of s.mobs){
  if(mob.hp<=0)continue;
  const target=closest(live,mob),a=Math.atan2(target.y-mob.y,target.x-mob.x);
  mob.x+=Math.cos(a)*dt*39;mob.y+=Math.sin(a)*dt*39;
  if(distance(mob,target)<22)hit(target,9);
 }
 s.mobs=s.mobs.filter(m=>m.hp>0);
 const b=s.boss;if(!b)return;
 if(b.hp<=0){s.phase='won';return;}
 const target=closest(live,b),a=Math.atan2(target.y-b.y,target.x-b.x);
 if(b.weak<=s.t){b.x+=Math.cos(a)*dt*33;b.y+=Math.sin(a)*dt*33;if(distance(target,b)<29)hit(target,15);}
 if(!b.rail&&s.t>=b.next){b.rail=s.t+3;b.lane=b.y<220?132:310;b.locked=false;b.charge=0;}
 if(b.rail){
  const op=s.players.find(p=>p.hp>0&&distance(p,{x:64,y:220})<40);
  if(op&&!b.locked&&(b.charge+=dt)>.5){b.lane=b.lane===132?310:132;b.locked=true;b.operator=s.players.indexOf(op);}
  if(s.t>=b.rail){
   if(Math.abs(b.y-b.lane)<39){b.weak=s.t+5;b.hp-=125;if(b.locked)s.players[b.operator].opened++;}
   for(const p of live)if(Math.abs(p.y-b.lane)<32)hit(p,24);
   b.rail=0;b.next=s.t+7;
  }
 }
}
const tick=setInterval(()=>{
 const now=Date.now();
 for(const [code,r] of rooms){
  if(now-r.last>90000||now-r.created>1800000){rooms.delete(code);continue;}
  if(r.state.phase==='battle'&&r.seen.some(t=>now-t>30000))r.state.phase='lost';
  else if(r.seen.every(t=>now-t<4500))relay(r,.05);
 }
},50);tick.unref();
export function coop(action,body){
 const now=Date.now();
 if(action==='create'){
  if(rooms.size>=150)reject(503,'작전실이 가득 찼어.');
  let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
  const token=randomBytes(24).toString('hex');
  rooms.set(code,{state:{phase:'lobby',t:0,spawnAt:1,players:[player(0)],mobs:[]},seq:0,created:now,last:now,tokens:[token],seen:[now],inputs:[{x:0,y:0,at:now}]});
  return {code,token,index:0};
 }
 const code=String(body.code||'').toUpperCase(),r=rooms.get(code);
 if(!r)reject(404,'종료된 방이거나 코드가 달라.');
 if(action==='join'){
  if(r.tokens.length!==1||r.state.phase!=='lobby')reject(409,'이미 출발했거나 가득 찬 방이야.');
  const token=randomBytes(24).toString('hex');r.tokens.push(token);r.seen.push(now);
  r.inputs.push({x:0,y:0,at:now});r.state.players.push(player(1));r.last=now;return {code,token,index:1};
 }
 const i=r.tokens.indexOf(body.token);if(i<0)reject(403,'방 연결 정보를 확인해.');
 r.seen[i]=now;r.last=now;
 if(action==='leave'){r.state.phase='closed';return {};}
 if(action==='ready'&&r.state.phase==='lobby'){
  const p=r.state.players[i];p.gun=body.gun==='scout'?'scout':'rifle';p.ready=true;
  if(r.state.players.length===2&&r.state.players.every(p=>p.ready))r.state.phase='battle';
 }else if(action==='sync'){
  const num=n=>Number.isFinite(n)?bound(n,-1,1):0;
  r.inputs[i]={x:num(body.x),y:num(body.y),dash:r.inputs[i].dash||body.dash===true,at:now};
 }else if(action!=='ready')reject(404,'알 수 없는 작전이야.');
 return {...r.state,waiting:r.state.phase==='battle'&&r.seen.some(t=>now-t>4500)};
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(process.env.GAME_DB || 'game.sqlite');
database.exec(`
 PRAGMA journal_mode = WAL;
 PRAGMA foreign_keys = ON;
 CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  save TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
 );
 CREATE TABLE IF NOT EXISTS mail (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL, message TEXT NOT NULL, reward TEXT NOT NULL,
  sent_at TEXT NOT NULL, claimed INTEGER NOT NULL DEFAULT 0
 );
 CREATE INDEX IF NOT EXISTS mail_recipient ON mail(account_id, sent_at);
`);

database.exec(`
 CREATE TABLE IF NOT EXISTS ranking (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  alias TEXT NOT NULL UNIQUE, cleared INTEGER NOT NULL, stars INTEGER NOT NULL,
  alpha INTEGER NOT NULL, level INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS reports (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id), message TEXT NOT NULL,
  build TEXT NOT NULL, page TEXT NOT NULL, sent_at TEXT NOT NULL
 );
`);
const rankingOrder='cleared DESC, stars DESC, alpha DESC, level DESC';
const rankedRows=database.prepare(`SELECT account_id, alias, cleared, stars, alpha, level,
 RANK() OVER(ORDER BY ${rankingOrder}) AS position FROM ranking`);
const clampInt=(number,max)=>Number.isInteger(number)?Math.max(0,Math.min(max,number)):0;
function rankingProgress(save){
 const stars=Array.from({length:20},(_,index)=>clampInt(save.stars?.[index],3)).reduce((a,b)=>a+b,0);
 const cleared=clampInt(save.cleared,20);
 const alpha=cleared===20?Array.from({length:10},(_,index)=>clampInt(save.challengeStars?.['alpha'+index],3)).filter(Boolean).length:0;
 return [cleared,stars,alpha,Math.floor(clampInt(save.xp,9900)/100)+1];
}
function refreshRanking(accountId,save){
 database.prepare('UPDATE ranking SET cleared=?, stars=?, alpha=?, level=? WHERE account_id=?').run(...rankingProgress(save),accountId);
}
const hash = value => createHash('sha256').update(value).digest('hex');
const lookupCode = database.prepare('SELECT * FROM accounts WHERE code_hash=?');
const lookupAccount = database.prepare('SELECT * FROM accounts WHERE id=?');
const saveUpdate = database.prepare('UPDATE accounts SET save=?, revision=revision+1 WHERE id=? AND revision=?');
const playerRecord = row => ({id:row.id,name:row.name,revision:row.revision,save:JSON.parse(row.save)});
const allowedRewards = new Set(['credits','alloy','parts','cores','skillData']);
const adminKey = process.env.GAME_ADMIN_KEY || '';
const html = new URL('../shooter.html', import.meta.url);

function fail(status, message) {
 throw Object.assign(new Error(message), { status });
}
function validSave(value) {
 return value && typeof value==='object' && !Array.isArray(value) &&
  Number.isInteger(value.cleared) && value.cleared>=0 && value.cleared<=20 &&
  value.levels && typeof value.levels==='object' && !Array.isArray(value.levels) &&
  value.equipped && typeof value.equipped==='object' && !Array.isArray(value.equipped) &&
  (!value.materials || typeof value.materials==='object' && !Array.isArray(value.materials));
}
function saveText(value){
 if(!validSave(value))fail(400,'저장 데이터 형식이 올바르지 않아.');
 return JSON.stringify(value);
}
function player(request){
 const code=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
 const account=code&&lookupCode.get(hash(code));
 if(!account)fail(401,'연동 코드가 올바르지 않아.');
 return account;
}
function requireAdmin(request){
 const token=request.headers.authorization?.slice(7)||'';
 if(!adminKey||adminKey.length<32||!request.headers.authorization?.startsWith('Bearer ')||
  !timingSafeEqual(Buffer.from(hash(token),'hex'),Buffer.from(hash(adminKey),'hex')))fail(403,'개발자 권한이 필요해.');
}
async function readBody(request){
 let body='',size=0;
 for await(const chunk of request){
  size+=chunk.length;
  if(size>512*1024)fail(413,'저장 데이터가 너무 커.');
  body+=chunk;
 }
 try{return JSON.parse(body||'{}');}catch{fail(400,'요청 형식이 올바르지 않아.');}
}
function transaction(action){
 database.exec('BEGIN IMMEDIATE');
 try{const value=action();database.exec('COMMIT');return value;}
 catch(error){database.exec('ROLLBACK');throw error;}
}
function claim(account,id,revision){
 return transaction(()=>{
  const mail=database.prepare('SELECT * FROM mail WHERE id=? AND account_id=?').get(id,account.id);
  if(!mail)fail(404,'우편을 찾을 수 없어.');
  const latest=lookupAccount.get(account.id);
  if(latest.revision!==revision)fail(409,'다른 기기에서 기록이 바뀌었어.');
  if(mail.claimed)return playerRecord(latest);
  const snapshot=JSON.parse(latest.save);
  for(const [currency,amount] of Object.entries(JSON.parse(mail.reward))){
   const wallet=currency==='skillData'?(snapshot.materials??={}):snapshot;
   const balance=Number.isSafeInteger(wallet[currency])?Math.max(0,wallet[currency]):0;
   wallet[currency]=Math.min(Number.MAX_SAFE_INTEGER,balance+amount);
  }
  saveUpdate.run(JSON.stringify(snapshot),account.id,latest.revision);
  database.prepare('UPDATE mail SET claimed=1 WHERE id=?').run(id);
  return playerRecord(lookupAccount.get(account.id));
 });
}

const server=createServer(async (request,response)=>{
 const send=(status,value)=>response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));
 try{
  const path=new URL(request.url,'http://localhost').pathname;
  if(request.method==='GET'&&(path==='/'||path==='/shooter.html')){
   const content=await readFile(html);
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}).end(content);
   return;
  }
  if(!path.startsWith('/api/game/'))return send(404,{error:'주소를 찾을 수 없어.'});
  const route=path.slice('/api/game/'.length);
  if(request.method==='GET'&&route==='status')return send(200,{online:true});
  if(request.method==='GET'&&route==='ranking'){
   const account=request.headers.authorization?player(request):null;
   const rows=rankedRows.all().sort((a,b)=>a.position-b.position||a.alias.localeCompare(b.alias));
   const publicRow=({alias,cleared,stars,alpha,level,position})=>({alias,cleared,stars,alpha,level,position});
   const own=account&&rows.find(row=>row.account_id===account.id);
   return send(200,{items:rows.slice(0,25).map(publicRow),own:own?publicRow(own):null,optedIn:Boolean(own)});
  }
 if(request.method==='POST'){
   if(!request.headers['content-type']?.startsWith('application/json'))fail(415,'JSON 요청만 지원해.');
   const body=await readBody(request);
   if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'요청 형식이 올바르지 않아.');
   if(route==='account'){
    const name=typeof body.name==='string'?body.name.normalize('NFKC').trim():'';
    if(!/^[\p{L}\p{N} _-]{2,20}$/u.test(name))fail(400,'이름은 2~20자의 글자, 숫자, 공백, _ 또는 -로 만들어.');
    const code=randomBytes(32).toString('base64url'),id=randomBytes(8).toString('hex');
    database.prepare('INSERT INTO accounts(id,code_hash,name,save) VALUES(?,?,?,?)').run(id,hash(code),name,saveText(body.save));
    return send(201,{...playerRecord(lookupAccount.get(id)),code});
   }
   if(route==='admin/mail'){
    requireAdmin(request);
    const id=typeof body.recipient==='string'?body.recipient.trim():'';
    if(!lookupAccount.get(id))fail(404,'받는 계정 ID를 찾을 수 없어.');
    const title=typeof body.title==='string'?body.title.trim():'';
    const message=typeof body.message==='string'?body.message.trim():'';
    if(!title||title.length>80||message.length>800)fail(400,'제목은 1~80자, 내용은 최대 800자로 입력해.');
    if(!allowedRewards.has(body.currency)||!Number.isSafeInteger(body.amount)||body.amount<1||body.amount>100000)fail(400,'보상 종류와 지급량(1~100,000)을 확인해.');
    const mailId=randomBytes(12).toString('hex');
    database.prepare('INSERT INTO mail(id,account_id,title,message,reward,sent_at) VALUES(?,?,?,?,?,?)')
     .run(mailId,id,title,message,JSON.stringify({[body.currency]:body.amount}),new Date().toISOString());
    return send(201,{id:mailId});
   }
   const account=player(request);
   if(route==='save'){
    if(body.revision!==account.revision)fail(409,'다른 기기에서 기록이 바뀌었어. 서버 기록을 먼저 확인해.');
    transaction(()=>{
     if(!saveUpdate.run(saveText(body.save),account.id,account.revision).changes)fail(409,'다른 기기에서 기록이 바뀌었어.');
     refreshRanking(account.id,body.save);
    });
    return send(200,playerRecord(lookupAccount.get(account.id)));
   }
   if(route==='ranking'){
    if(typeof body.optIn!=='boolean')fail(400,'공개 설정을 확인해.');
    if(body.optIn){
     const alias='탐사대 '+randomBytes(5).toString('hex').toUpperCase();
     database.prepare('INSERT OR IGNORE INTO ranking(account_id,alias,cleared,stars,alpha,level) VALUES(?,?,?,?,?,?)')
      .run(account.id,alias,...rankingProgress(JSON.parse(account.save)));
    }else database.prepare('DELETE FROM ranking WHERE account_id=?').run(account.id);
    return send(200,{optIn:body.optIn});
   }
   if(route==='report'){
    const message=typeof body.message==='string'?body.message.trim():'';
    if(message.length<4||message.length>700||typeof body.build!=='string'||!/^\d+\.\d+\.\d+$/.test(body.build)||
       typeof body.page!=='string'||!/^[a-z]{1,20}$/.test(body.page))fail(400,'제보 형식을 확인해.');
    database.prepare('INSERT INTO reports(account_id,message,build,page,sent_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET message=excluded.message,build=excluded.build,page=excluded.page,sent_at=excluded.sent_at')
     .run(account.id,message,body.build,body.page,new Date().toISOString());
    return send(201,{received:true});
   }
   if(route==='claim'){
    if(typeof body.id!=='string')fail(400,'우편을 선택해.');
    return send(200,claim(account,body.id,body.revision));
   }
  }
  if(request.method==='GET'&&route==='admin/reports'){
   requireAdmin(request);
   const items=database.prepare('SELECT message,build,page,sent_at FROM reports ORDER BY sent_at DESC LIMIT 50').all();
   return send(200,{items});
  }
  if(request.method==='GET'&&route==='account')return send(200,playerRecord(player(request)));
  if(request.method==='GET'&&route==='mail'){
   const account=player(request);
   const rows=database.prepare('SELECT id,title,message,reward,sent_at,claimed FROM mail WHERE account_id=? ORDER BY claimed, sent_at DESC').all(account.id);
   return send(200,{items:rows.map(row=>({...row,reward:JSON.parse(row.reward)}))});
  }
  return send(404,{error:'주소를 찾을 수 없어.'});
 }catch(error){
  if(!error.status)console.error(error);
  if(!response.destroyed)send(error.status||500,{error:error.status?error.message:'서버에서 요청을 처리하지 못했어.'});
 }
});
server.listen(Number(process.env.PORT||8080),process.env.HOST||'127.0.0.1');

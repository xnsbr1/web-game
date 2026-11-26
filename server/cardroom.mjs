import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';

const derive = promisify(scrypt);
const hour = 3600000;
const sessionAge = 30 * 24 * hour;
const staticFiles = new Map([
  ['/', ['../cardroom/index.html', 'text/html; charset=utf-8']],
  ['/cardroom/', ['../cardroom/index.html', 'text/html; charset=utf-8']],
  ['/real-game/', ['../real-game/index.html', 'text/html; charset=utf-8']],
  ['/cardroom/friends.js', ['../cardroom/friends.js', 'text/javascript; charset=utf-8']]
]);
const id = () => randomBytes(24).toString('base64url');
const hash = token => createHash('sha256').update(token).digest('hex');
const handle = name => typeof name === 'string' && /^[a-z0-9_가-힣]{3,20}$/u.test(name);
const pair = (a,b) => a < b ? [a,b] : [b,a];

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new RequestError(status, message); };

async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    fail(415,'지원하지 않는 요청 형식이에요.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) fail(413,'입력 내용이 너무 길어요.');
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks));
    if (result && typeof result === 'object' && !Array.isArray(result)) return result;
  } catch {}
  fail(400,'요청 내용을 확인해 주세요.');
}

export function createCardroomServer({origin, database, secure = true}) {
  if (!origin || new URL(origin).origin !== origin || (secure && !origin.startsWith('https://'))) {
    throw new Error('Set CARDROOM_ORIGIN to the deployment HTTPS origin.');
  }
  const db = new DatabaseSync(database);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS accounts (name TEXT PRIMARY KEY, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, name TEXT NOT NULL REFERENCES accounts(name), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friends (
      low TEXT NOT NULL REFERENCES accounts(name), high TEXT NOT NULL REFERENCES accounts(name),
      sender TEXT NOT NULL REFERENCES accounts(name), accepted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(low,high)
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES accounts(name),
      recipient TEXT NOT NULL REFERENCES accounts(name), room TEXT NOT NULL, expires INTEGER NOT NULL,
      UNIQUE(sender,recipient,room)
    );
    CREATE TABLE IF NOT EXISTS request_limits (
      bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
    );
  `);
  const stmt = sql => db.prepare(sql);
  function rateLimit(bucket, maximum, duration) {
    const now = Date.now();
    stmt('DELETE FROM request_limits WHERE expires <= ?').run(now);
    const {count} = stmt(`INSERT INTO request_limits VALUES (?,1,?) ON CONFLICT(bucket)
      DO UPDATE SET count=count+1 RETURNING count`).get(bucket, now+duration);
    if (count > maximum) fail(429,'잠시 뒤 다시 시도해 주세요.');
  }
  const cookieName = secure ? '__Host-cardroom' : 'cardroom-dev';
  function cookie(value, age) {
    return cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+age+(secure?'; Secure':'');
  }
  function session(req) {
    const token = req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    return token && /^[A-Za-z0-9_-]{32}$/.test(token) ? hash(token) : '';
  }
  function account(req) {
    return stmt('SELECT name FROM sessions WHERE token=? AND expires>?').get(session(req),Date.now())?.name;
  }
  function snapshot(name) {
    if (!name) return {name:null};
    const links = stmt('SELECT * FROM friends WHERE low=? OR high=?').all(name,name);
    const other = link => link.low === name ? link.high : link.low;
    return {name,
      friends:links.filter(link=>link.accepted).map(other),
      requests:links.filter(link=>!link.accepted && link.sender!==name).map(other),
      sent:links.filter(link=>!link.accepted && link.sender===name).map(other),
      invites:stmt('SELECT id,sender,room FROM invites WHERE recipient=? AND expires>? ORDER BY expires DESC LIMIT 40')
        .all(name,Date.now())
    };
  }
  async function auth(req, res, action, data) {
    const name = typeof data.name === 'string' ? data.name.trim().toLowerCase() : '';
    const password = data.password;
    if (!handle(name) || typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password)>160) {
      fail(400,'닉네임은 한글·영문·숫자·밑줄 3~20자, 비밀번호는 10자 이상이어야 해요.');
    }
    rateLimit('auth:'+req.socket.remoteAddress,30,hour);
    rateLimit('name:'+name,12,hour);
    const current = stmt('SELECT * FROM accounts WHERE name=?').get(name);
    const salt = current?.salt ?? randomBytes(16).toString('hex');
    const derived = await derive(password,salt,64);
    if (action === 'signup') {
      const inserted = stmt('INSERT OR IGNORE INTO accounts VALUES (?,?,?)').run(name,salt,derived.toString('hex'));
      if (!inserted.changes) fail(409,'이미 사용 중인 닉네임이에요.');
    } else if (!current || !timingSafeEqual(Buffer.from(current.password,'hex'),derived)) {
      fail(401,'닉네임 또는 비밀번호를 확인해 주세요.');
    }
    stmt('DELETE FROM sessions WHERE expires<=? OR token=?').run(Date.now(),session(req));
    const token = id();
    stmt('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),name,Date.now()+sessionAge);
    res.setHeader('Set-Cookie',cookie(token,sessionAge/1000));
    return snapshot(name);
  }
  async function api(req, res, path) {
    if (path === 'state' && req.method === 'GET') return snapshot(account(req));
    if (req.method !== 'POST') fail(405,'지원하지 않는 요청이에요.');
    if (req.headers.origin !== origin) fail(403,'게임 주소에서 다시 시도해 주세요.');
    const data = await readBody(req);
    if (path === 'signup' || path === 'login') return auth(req,res,path,data);
    const name = account(req);
    if (!name) fail(401,'먼저 로그인해 주세요.');
    rateLimit('write:'+name,100,hour);
    if (path === 'logout') {
      stmt('DELETE FROM sessions WHERE token=?').run(session(req));
      res.setHeader('Set-Cookie',cookie('',0));
      return {name:null};
    }
    if (path === 'dismiss') {
      stmt('DELETE FROM invites WHERE id=? AND recipient=?').run(String(data.id),name);
      return snapshot(name);
    }
    const other = typeof data.friend === 'string' ? data.friend.trim().toLowerCase() : '';
    if (!handle(other) || other===name) fail(400,'친구 닉네임을 확인해 주세요.');
    const [low,high] = pair(name,other);
    if (path === 'request') {
      rateLimit('friend-request:'+name,25,24*hour);
      if (!stmt('SELECT 1 FROM accounts WHERE name=?').get(other)) fail(404,'해당 닉네임을 찾지 못했어요.');
      stmt('INSERT OR IGNORE INTO friends (low,high,sender) VALUES (?,?,?)').run(low,high,name);
    } else if (path === 'accept') {
      stmt('UPDATE friends SET accepted=1 WHERE low=? AND high=? AND sender=?').run(low,high,other);
    } else if (path === 'remove') {
      db.exec('BEGIN IMMEDIATE');
      try {
        stmt('DELETE FROM friends WHERE low=? AND high=?').run(low,high);
        stmt('DELETE FROM invites WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)')
          .run(name,other,other,name);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } else if (path === 'invite') {
      if (typeof data.room !== 'string' || !/^\d{6}$/.test(data.room)) fail(400,'먼저 방을 만들어 주세요.');
      const now = Date.now();
      stmt('DELETE FROM invites WHERE expires<=?').run(now);
      const invite = stmt(`INSERT INTO invites
        SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM friends WHERE low=? AND high=? AND accepted=1)
        ON CONFLICT(sender,recipient,room) DO UPDATE SET expires=excluded.expires`)
        .run(id(),name,other,data.room,now+hour,low,high);
      if (!invite.changes) fail(403,'친구 요청을 수락한 사람만 초대할 수 있어요.');
    } else fail(404,'찾을 수 없는 요청이에요.');
    return snapshot(name);
  }
  const server = createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const path = new URL(req.url,origin).pathname;
      if (path.startsWith('/api/cardroom/')) {
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.end(JSON.stringify(await api(req,res,path.slice('/api/cardroom/'.length))));
      } else if (req.method === 'GET' && staticFiles.has(path)) {
        const [file,type] = staticFiles.get(path);
        res.setHeader('Content-Type',type);
        res.end(await readFile(new URL(file,import.meta.url)));
      } else fail(404,'페이지를 찾을 수 없어요.');
    } catch(error) {
      res.statusCode = error.status || 500;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({error:error.status ? error.message : '잠시 뒤 다시 시도해 주세요.'}));
      if (!error.status) console.error(error);
    }
  });
  server.on('close',()=>db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const origin = process.env.CARDROOM_ORIGIN || 'http://localhost:'+port;
  const secure = !['localhost','127.0.0.1'].includes(new URL(origin).hostname);
  if (secure && !process.env.CARDROOM_DB) throw new Error('Set CARDROOM_DB to a persistent data volume.');
  createCardroomServer({origin, database:process.env.CARDROOM_DB || './cardroom.sqlite', secure})
    .listen(port, () => console.log('Cardroom listening on port '+port));
}

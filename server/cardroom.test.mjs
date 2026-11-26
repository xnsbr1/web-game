import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCardroomServer} from './cardroom.mjs';

test('accounts, mutual friends, saved invitations, and access boundaries',async () => {
  const directory = await mkdtemp(join(tmpdir(),'cardroom-'));
  const origin = 'http://localhost:3000';
  const database = join(directory,'test.sqlite');
  let server, base;
  async function start() {
    server = createCardroomServer({origin,database,secure:false});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base = 'http://127.0.0.1:'+server.address().port;
  }
  const stop = () => new Promise(resolve=>server.close(resolve));
  const password = 'test-only-passphrase';
  async function api(path, body, cookie, caller = origin) {
    const headers = {origin:caller};
    if (cookie) headers.cookie = cookie;
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(base+'/api/cardroom/'+path,
      {method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    await start();
    const game = await fetch(base+'/cardroom/');
    assert.equal(game.status,200);
    assert.match(await game.text(),/data-friends-open/);
    assert.equal((await fetch(base+'/cardroom/friends.js')).status,200);
    assert.equal((await api('request',{friend:'player_b'})).status,401);
    const a = await api('signup',{name:'player_a',password});
    const b = await api('signup',{name:'player_b',password});
    assert(a.cookie && b.cookie);
    assert.equal((await api('signup',{name:'PLAYER_A',password})).status,409);
    assert.equal((await api('login',{name:'player_a',password:'test-only-wrong'})).status,401);
    assert.equal((await api('request',{friend:'player_b'},a.cookie,'https://outside.example')).status,403);
    assert.equal((await api('invite',{friend:'player_b',room:'123456'},a.cookie)).status,403);
    assert.deepEqual((await api('request',{friend:'player_b'},a.cookie)).data.sent,['player_b']);
    assert.deepEqual((await api('state',null,b.cookie)).data.requests,['player_a']);
    assert.deepEqual((await api('accept',{friend:'player_b'},a.cookie)).data.friends,[]);
    assert.deepEqual((await api('accept',{friend:'player_a'},b.cookie)).data.friends,['player_a']);
    for(let i=0;i<2;i++) assert.equal((await api('invite',{friend:'player_b',room:'123456'},a.cookie)).status,200);
    assert.equal((await api('state',null,a.cookie)).data.invites.length,0);
    const inbox = (await api('state',null,b.cookie)).data.invites;
    assert.equal(inbox.length,1);
    assert.equal(inbox[0].room,'123456');
    await api('dismiss',{id:inbox[0].id},a.cookie);
    await stop();
    await start();
    const otherDevice = await api('login',{name:'player_b',password});
    assert.deepEqual(otherDevice.data.invites,inbox);
    await api('remove',{friend:'player_a'},otherDevice.cookie);
    assert.equal((await api('state',null,b.cookie)).data.invites.length,0);
    assert.equal((await api('logout',{},otherDevice.cookie)).status,200);
    assert.equal((await api('state',null,otherDevice.cookie)).data.name,null);
  } finally {
    if (server?.listening) await stop();
    await rm(directory,{recursive:true,force:true});
  }
});

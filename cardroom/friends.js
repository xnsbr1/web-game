(() => {
  const api = '/api/cardroom/';
  let state = {name:null}, busy = false, serviceAvailable = true;
  const dialog = document.createElement('dialog');
  dialog.className = 'friends-dialog';
  dialog.innerHTML = '<div class="hero"><h2>친구</h2><form method="dialog"><button>닫기</button></form></div>' +
    '<p id="friends-message" role="status"></p><section id="friends-content"></section>';
  document.body.append(dialog);
  const message = dialog.querySelector('#friends-message');
  const content = dialog.querySelector('#friends-content');
  const escape = value => String(value).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const button = (label, action, value) => '<button type="button" data-action="' + action +
    '" data-value="' + escape(value) + '">' + label + '</button>';
  const roomCode = () => window.cardroomFriends.room();

  function render() {
    if (!serviceAvailable) {
      content.innerHTML = '<p>지금은 친구 서버에 연결할 수 없어요.</p>';
    } else if (!state.name) {
      content.innerHTML = '<form id="friends-auth"><label>닉네임<input name="name" required minlength="3" maxlength="20" autocomplete="username"></label>' +
        '<label>비밀번호<input name="password" type="password" required minlength="10" maxlength="120" autocomplete="current-password"></label>' +
        '<div class="row"><button class="primary" value="login">로그인</button><button value="signup">계정 만들기</button></div>' +
        '<small>한글·영문·숫자·밑줄 3~20자 · 비밀번호 10자 이상</small></form>';
    } else {
      const rows = (names, renderRow, empty) => names.length ? names.map(renderRow).join('') : '<p>' + empty + '</p>';
      content.innerHTML = '<div class="row"><b>@' + escape(state.name) + '</b>' + button('로그아웃','logout','') + '</div>' +
        '<form id="friends-add"><label>친구 닉네임<input name="friend" maxlength="20" required></label><button>친구 요청 보내기</button></form>' +
        '<h3>받은 친구 요청</h3>' + rows(state.requests, name => '<div class="row">@' + escape(name) +
          button('수락','accept',name) + button('거절','remove',name) + '</div>', '받은 요청이 없어요.') +
        (state.sent.length ? '<h3>보낸 친구 요청</h3>' + state.sent.map(name => '<div class="row">@' + escape(name) +
          button('취소','remove',name) + '</div>').join('') : '') +
        '<h3>친구 목록</h3>' + rows(state.friends, name => '<div class="row">@' + escape(name) +
          (roomCode() ? button('이 방에 초대','invite',name) : '') + button('친구 삭제','remove',name) +
          '</div>','추가된 친구가 없어요.') +
        '<h3>받은 방 초대</h3>' + rows(state.invites, item => '<div class="row">@' + escape(item.sender) + ' · ' +
          escape(item.room) + button('참가','join',item.id) + button('닫기','dismiss',item.id) +
          '</div>','받은 초대가 없어요.');
    }
    document.querySelectorAll('[data-friends-open]').forEach(open => {
      const count = (state.requests?.length || 0) + (state.invites?.length || 0);
      open.textContent = '친구' + (count ? ' · ' + count : '');
    });
  }

  async function request(action, payload) {
    const response = await fetch(api + action, payload ? {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    } : {cache:'no-store'});
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('친구 서버에 연결할 수 없어요.');
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    return data;
  }
  async function refresh(showErrors = false) {
    if (busy) return;
    busy = true;
    try {
      const next = await request('state');
      const changed = !serviceAvailable || JSON.stringify(state) !== JSON.stringify(next);
      serviceAvailable = true;
      state = next;
      if (changed || showErrors) render();
      else document.querySelectorAll('[data-friends-open]').forEach(open => {
        const count = (state.requests?.length || 0) + (state.invites?.length || 0);
        if (count) open.textContent = '친구 · ' + count;
      });
    } catch {
      if (showErrors) { serviceAvailable = false; render(); }
    } finally { busy = false; }
  }
  async function submit(action, fields) {
    if (busy) return false;
    busy = true;
    message.textContent = '';
    try {
      state = await request(action,fields);
      render();
      const messages = {request:'친구 요청을 보냈어요.',invite:'방 초대를 보냈어요.'};
      message.textContent = messages[action] || '';
      return true;
    } catch(error) {
      message.textContent = error.message;
      return false;
    } finally { busy = false; }
  }
  document.addEventListener('click',event => {
    if (!event.target.closest('[data-friends-open]')) return;
    message.textContent = '';
    if (!dialog.open) dialog.showModal();
    refresh(true);
  });
  dialog.addEventListener('submit',event => {
    const form = event.target;
    if (!['friends-auth','friends-add'].includes(form.id)) return;
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    submit(form.id === 'friends-auth' ? event.submitter.value : 'request',fields);
  });
  dialog.addEventListener('click',async event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const {action,value} = target.dataset;
    if (action === 'join') {
      const item = state.invites.find(invite => invite.id === value);
      if (item && window.cardroomFriends.join(item.room,state.name)) dialog.close();
      else message.textContent = '현재 게임을 나간 뒤 초대받은 방에 참가할 수 있어요.';
    } else if (action === 'dismiss') {
      await submit(action,{id:value});
    } else {
      await submit(action,{friend:value,room:roomCode()});
    }
  });
  render();
  refresh();
  const refreshIfVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  document.addEventListener('visibilitychange',refreshIfVisible);
  setInterval(refreshIfVisible,10000);
})();

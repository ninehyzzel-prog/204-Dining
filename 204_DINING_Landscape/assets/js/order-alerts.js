(() => {
  const panel = document.createElement('section');
  panel.className = 'editor-card'; panel.style.marginBottom = '30px';
  panel.innerHTML = `<h2>🔔 새 주문 알림</h2>
    <p>이 기기에서 알림을 켜면 새 주문이 들어올 때 소리가 납니다.</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px"><button class="btn" id="order-alert-toggle">주문 알림 켜기</button>
    <button class="btn secondary" id="order-alert-test">알림음 테스트</button></div>
    <p id="order-alert-status" role="status">주문 서버 연결 중…</p>
    <p style="font-size:12px;color:var(--muted)">알림을 받을 기기에서 이 페이지를 열어두세요. 화면 잠금이나 브라우저 절전 중에는 소리가 지연될 수 있습니다.</p>
    <div id="order-alert-banner" role="status" style="color:#f5d59c;font-size:20px"></div>
    <div id="order-alert-list" style="max-height:320px;overflow:auto;margin-top:15px"></div>`;
  document.querySelector('header').after(panel);
  const toggle = panel.querySelector('#order-alert-toggle');
  const status = panel.querySelector('#order-alert-status');
  const banner = panel.querySelector('#order-alert-banner');
  const list = panel.querySelector('#order-alert-list');
  const pin = new URLSearchParams(location.search).get('pin') || '';
  let context, enabled = false, initialized = false, connected = false, timer, wakeLock;
  let nextSound = 0;
  const sources = new Set(), seen = new Set();
  let alertBuffer = null;
  async function loadAlertAudio() {
    if (alertBuffer || !context) return;
    try {
      const res = await fetch('assets/audio/order_alert.wav');
      if (res.ok) {
        const arr = await res.arrayBuffer();
        alertBuffer = await context.decodeAudioData(arr);
      }
    } catch (_) {}
  }

  function state() { status.textContent = connected ? (enabled ? '● 연결됨 · 새 주문 소리 알림 켜짐' : '● 연결됨 · 소리 알림 꺼짐') : '연결 재시도 중…'; }
  async function unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('이 브라우저는 알림음을 지원하지 않습니다.');
    context ||= new AudioContext();
    await context.resume();
    if (context.state !== 'running') throw new Error('소리 재생이 차단됐습니다. 알림 켜기를 다시 눌러주세요.');
    loadAlertAudio();
  }
  function chime() {
    if (!context || context.state !== 'running') { status.textContent = '새 주문이 있습니다. 소리를 다시 켜려면 알림 버튼을 눌러주세요.'; return; }
    const start = Math.max(context.currentTime, nextSound); nextSound = start + 4.9;

    // 1. Play master synthesized chime + voice audio
    if (alertBuffer) {
      const source = context.createBufferSource();
      source.buffer = alertBuffer;
      source.connect(context.destination);
      source.start(start);
      sources.add(source);
      source.onended = () => sources.delete(source);
      return;
    }

    // 2. Seamless layered fallback
    [880,1174.66,1567.98].forEach((frequency,i) => {
      const oscillator = context.createOscillator(), gain = context.createGain(), time = start + i * .22;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.26, time + .01); gain.gain.exponentialRampToValueAtTime(.001, time + .55);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(time); oscillator.stop(time + .6);
      sources.add(oscillator); oscillator.onended = () => { sources.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    });

    try {
      setTimeout(() => {
        const voice = new Audio('assets/audio/new_order_voice.mp3');
        voice.play().catch(() => {});
      }, 920);
    } catch (_) {}
  }
  async function keepAwake() {
    if (enabled && document.visibilityState === 'visible' && navigator.wakeLock && !wakeLock) {
      try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch (_) {}
    }
  }
  toggle.onclick = async () => {
    if (enabled && context?.state === 'running') {
      enabled = false; sources.forEach(source => { try { source.stop(); } catch (_) {} }); nextSound = 0;
      if (wakeLock) await wakeLock.release(); toggle.textContent = '주문 알림 켜기'; state(); return;
    }
    try { await unlock(); enabled = true; toggle.textContent = '주문 알림 끄기'; chime(); await keepAwake(); state(); }
    catch (error) { status.textContent = error.message; }
  };
  panel.querySelector('#order-alert-test').onclick = async () => {
    try { await unlock(); chime(); } catch (error) { status.textContent = error.message; }
  };
  let previousSignature = '';
  async function poll() {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/orders', {headers:{'X-Admin-Pin':pin}, cache:'no-store',signal:controller.signal});
      if (response.status === 401) throw new Error('관리자 PIN으로 다시 접속해주세요.');
      if (!response.ok) throw new Error('주문 서버에 연결할 수 없습니다. 잠시 후 다시 확인합니다.');
      const data = await response.json();
      if (!Array.isArray(data.orders)) throw new Error('주문 응답을 확인할 수 없습니다.');
      connected = true; state();
      const fresh = [];
      for (const order of data.orders) {
        const id = order.notificationId || order.timestamp + ':' + order.orderId;
        if (!seen.has(id)) { if (initialized) fresh.push(order); seen.add(id); }
      }
      initialized = true;
      // Keep enough history to suppress repeats across reconnects, without unlimited growth.
      if (seen.size > 1000) { const recent = Array.from(seen).slice(-500); seen.clear(); recent.forEach(id => seen.add(id)); }
      if (fresh.length) {
        banner.textContent = `새 주문 ${fresh.length}건 · ${fresh[0].table || '테이블'} · ${fresh[0].orderId}`;
        if (enabled) fresh.forEach(() => chime());
      }
      const signature = JSON.stringify(data.orders.slice(0,20));
      if (signature !== previousSignature) {
        previousSignature = signature; list.replaceChildren();
        if (!data.orders.length) list.textContent = '아직 접수된 주문이 없습니다.';
        data.orders.slice(0,20).forEach(order => {
          const card = document.createElement('div'); card.style.cssText = 'padding:14px 0;border-bottom:1px solid var(--border)';
          const heading = document.createElement('strong'); heading.textContent = `${order.orderId} · ${order.table || '테이블'} · ${new Date(order.timestamp).toLocaleTimeString('ko-KR')}`;
          const items = document.createElement('p'); items.style.marginBottom = '0';
          items.textContent = (order.items || []).map(item => `${item.nameKo || item.name || '메뉴'} × ${item.qty}`).join(' / ');
          card.append(heading,items); list.append(card);
        });
      }
    } catch (error) { connected = false; status.textContent = error.name === 'AbortError' ? '연결 시간 초과 · 자동 재연결 중…' : error.message; }
    finally { clearTimeout(timeout); timer = setTimeout(poll, 2000); }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
  window.addEventListener('pagehide', () => { clearTimeout(timer); if (wakeLock) wakeLock.release(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearTimeout(timer); poll(); } });
  poll();
})();

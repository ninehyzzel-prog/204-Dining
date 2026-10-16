(() => {

  const dialog = document.createElement('dialog');
  dialog.id = 'quantity-dialog';
  dialog.setAttribute('aria-labelledby', 'quantity-title');
  dialog.innerHTML = `
    <button class="quantity-close" aria-label="수량 선택 취소">×</button>
    <div class="quantity-heading"><span>204 DINING · YOUR SELECTION</span><h2 id="quantity-title">몇 개를 준비해 드릴까요?</h2></div>
    <div class="quantity-dial" role="group" aria-label="수량 다이얼">
      <div class="quantity-wheel"><img src="assets/quantity-dial.png" alt="" draggable="false"></div>
      <img class="quantity-center" src="assets/quantity-dial.png" alt="" draggable="false">
      <span class="quantity-marker" aria-hidden="true">◀</span>
    </div>
    <div class="quantity-readout"><button type="button" class="quantity-minus" aria-label="수량 한 개 줄이기">−</button>
      <output id="quantity-output" aria-live="polite" aria-atomic="true">1개</output>
      <button type="button" class="quantity-plus" aria-label="수량 한 개 늘리기">+</button></div>
    <p class="quantity-hint">다이얼을 돌리거나 숫자를 눌러주세요 · 0은 10개</p>
    <label class="quantity-sound"><input type="checkbox" checked> 다이얼 소리</label>
    <button type="button" class="quantity-confirm">1개로 선택</button>`;
  document.body.append(dialog);
  const surface = dialog.querySelector('.quantity-dial');
  const wheel = dialog.querySelector('.quantity-wheel');
  const output = dialog.querySelector('output');
  const confirm = dialog.querySelector('.quantity-confirm');
  const minus = dialog.querySelector('.quantity-minus');
  const plus = dialog.querySelector('.quantity-plus');
  const sound = dialog.querySelector('input');
  let quantity = 1, angle = 0, pointer = null, previousAngle = 0, moved = false, travel = 0;
  let callback = null, context = null, noise = null, nextTick = 0;
  let maxQuantity = 10;
  const activeSounds = new Set();
  // Each image number is a real accessible hit target, rotating with the plate.
  const positions = [[82.3,31.5],[69.8,19.7],[52.7,12.8],[34.7,16.4],[20.5,26.8],[12.6,44.1],[13.5,61.7],[22.9,76.8],[34.4,86.4],[50.4,89.3]];
  const numberAngles = positions.map(([x,y]) => Math.atan2((y - 51) * 1235, (x - 50) * 1272) * 180 / Math.PI);
  const detents = numberAngles.map(a => (numberAngles[0] - a + 360) % 360);
  const MAX = detents[9];
  const closestDetent = a => {
    let best = 0;
    const limit = Math.min(10, maxQuantity);
    for (let i = 0; i < limit; i++) {
      if (Math.abs(detents[i] - a) < Math.abs(detents[best] - a)) {
        best = i;
      }
    }
    return best + 1;
  };
  positions.forEach(([x,y], i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'quantity-number';
    button.style.left = x + '%'; button.style.top = y + '%';
    button.setAttribute('aria-label', `${i + 1}개 선택`);
    button.onclick = () => { if (!moved && (i + 1) <= maxQuantity) select(i + 1, true); };
    wheel.append(button);
  });
  function unlock() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      context = new AudioContext();
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.028), context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.005));
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }
  function ticks(count) {
    if (!sound.checked || (typeof sfxEnabled !== 'undefined' && !sfxEnabled)) return;
    unlock(); if (!context || !noise) return;
    // No throttling: one short mechanical click for every crossed detent.
    for (let i = 0; i < count; i++) {
      const time = Math.max(context.currentTime, nextTick);
      nextTick = time + 0.009;
      const source = context.createBufferSource(); source.buffer = noise;
      const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1700; filter.Q.value = 0.7;
      const gain = context.createGain(); gain.gain.setValueAtTime(0.45, time); gain.gain.exponentialRampToValueAtTime(0.001, time + 0.028);
      source.connect(filter); filter.connect(gain); gain.connect(context.destination);
      source.start(time); activeSounds.add(source);
      source.onended = () => { activeSounds.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    }
  }
  function render() {
    const atLimit = quantity >= maxQuantity;
    surface.setAttribute('data-at-limit', String(atLimit));
    wheel.style.transform = `rotate(${angle}deg)`;
    output.textContent = `${quantity}개`;
    confirm.textContent = `${quantity}개로 선택`;
    minus.disabled = quantity <= 1;
    plus.disabled = quantity >= maxQuantity;
    wheel.querySelectorAll('.quantity-number').forEach((button, i) => {
      const num = i + 1;
      const isOver = num > maxQuantity;
      button.setAttribute('aria-pressed', String(num === quantity));
      button.disabled = isOver;
      button.style.opacity = isOver ? '0.18' : '';
      button.style.cursor = isOver ? 'not-allowed' : 'pointer';
      button.style.pointerEvents = isOver ? 'none' : 'auto';
    });
    const hintEl = dialog.querySelector('.quantity-hint');
    if (hintEl) {
      if (atLimit) {
        hintEl.textContent = `최대 수량 ${maxQuantity}개에 도달했습니다.`;
      } else if (maxQuantity < 10) {
        hintEl.textContent = `다이얼을 돌리거나 숫자를 눌러주세요 (최대 재고: ${maxQuantity}개)`;
      } else {
        hintEl.textContent = '다이얼을 돌리거나 숫자를 눌러주세요 · 0은 10개';
      }
    }
  }
  function select(value, audible) {
    const next = Math.max(1, Math.min(maxQuantity, value));
    if (audible && next !== quantity) ticks(Math.abs(next - quantity));
    quantity = next; angle = detents[next - 1]; render();
  }
  function pointerAngle(event) {
    const box = surface.getBoundingClientRect();
    return Math.atan2(event.clientY - (box.top + box.height * 0.51), event.clientX - (box.left + box.width * 0.50)) * 180 / Math.PI;
  }
  surface.addEventListener('pointerdown', event => {
    if (pointer !== null || event.button !== 0) return;
    unlock(); pointer = event.pointerId; previousAngle = pointerAngle(event); moved = false; travel = 0;
    surface.classList.add('dragging');
    // Capture on the number button when present so taps retain their target.
    event.target.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    const maxLimitAngle = detents[Math.min(9, maxQuantity - 1)];
    for (const sample of samples.length ? samples : [event]) {
      const current = pointerAngle(sample);
      const delta = ((current - previousAngle + 540) % 360) - 180;
      previousAngle = current; travel += Math.abs(delta);
      if (travel < 3) continue;
      moved = true;
      angle = Math.max(0, Math.min(maxLimitAngle, angle + delta));
      const next = Math.min(maxQuantity, closestDetent(angle));
      if (next !== quantity) ticks(Math.abs(next - quantity));
      quantity = next; render();
    }
  });
  function release(event) {
    if (event.pointerId !== pointer) return;
    pointer = null; surface.classList.remove('dragging');
    angle = detents[quantity - 1]; render();
    // The following click must not accidentally select the dragged number.
    setTimeout(() => { moved = false; }, 0);
  }
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);
  surface.addEventListener('lostpointercapture', release);
  surface.addEventListener('wheel', event => {
    event.preventDefault(); select(quantity + Math.sign(event.deltaY), true);
  }, {passive:false});
  minus.onclick = () => select(quantity - 1, true);
  plus.onclick = () => select(quantity + 1, true);
  dialog.addEventListener('keydown', event => {
    const keys = {ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1};
    if (event.key in keys) { event.preventDefault(); select(quantity + keys[event.key], true); }
    if (event.key === 'Home') { event.preventDefault(); select(1, true); }
    if (event.key === 'End') { event.preventDefault(); select(maxQuantity, true); }
  });
  dialog.querySelector('.quantity-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => {
    pointer = null; callback = null; surface.classList.remove('dragging');
    activeSounds.forEach(source => { try { source.stop(); } catch (_) {} }); nextTick = 0;
  });
  confirm.onclick = () => { const apply = callback; const value = quantity; dialog.close(); if (apply) apply(value); };
  window.openQuantityDial = (value, apply, max = 10) => {
    if (dialog.open) return;
    maxQuantity = Math.max(1, Math.min(10, Number(max) || 10));
    callback = apply; moved = false;
    select(Math.min(value, maxQuantity), false);
    dialog.showModal(); unlock(); confirm.focus();
  };
})();

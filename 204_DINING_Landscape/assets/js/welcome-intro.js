(() => {
  const welcome = document.getElementById('p1');
  if (!welcome) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  let wasActive = welcome.classList.contains('active');
  function finish() {
    clearTimeout(timer);
    welcome.classList.remove('welcome-intro');
  }
  function play() {
    finish();
    if (reduced.matches || !welcome.classList.contains('active')) return;
    welcome.classList.add('welcome-intro');
    timer = setTimeout(finish, 1900);
  }
  // Capture phase ends the entrance before the existing card/chef click handlers run.
  welcome.addEventListener('pointerdown', finish, {capture:true, passive:true});
  welcome.addEventListener('click', finish, {capture:true});
  new MutationObserver(() => {
    const active = welcome.classList.contains('active');
    if (active !== wasActive) {
      wasActive = active;
      if (active) play(); else finish();
    }
  }).observe(welcome, {attributes:true, attributeFilter:['class']});
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  // The initial class is in the markup, so the first paint never flashes all layers.
  if (reduced.matches) finish();
  else if (wasActive) timer = setTimeout(finish, 1900);
})();

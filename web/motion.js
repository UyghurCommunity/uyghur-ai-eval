// Presentation only: never reads predictions, scores, or uploaded files.
const root = document.documentElement;
const instrument = document.getElementById('scoring-instrument');
const toggle = document.getElementById('motion-toggle');
const label = document.getElementById('motion-label');
const icon = document.getElementById('motion-icon');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = false;

function updateMotion() {
  const stopped = paused || reduced.matches;
  root.dataset.motion = stopped || document.hidden ? 'paused' : 'running';
  toggle.setAttribute('aria-pressed', String(stopped));
  toggle.disabled = reduced.matches;
  label.textContent = reduced.matches ? 'ھەرىكەت ئازايتىلغان' : stopped ? 'ھەرىكەتنى قوزغىتىش' : 'ھەرىكەتنى توختىتىش';
  icon.textContent = stopped ? '▷' : 'Ⅱ';
  toggle.setAttribute('aria-label', reduced.matches ? 'سىستېما تەڭشىكى بويىچە ھەرىكەت ئازايتىلغان' : label.textContent);
}

if (instrument && toggle) {
  // CSS starts paused, including before this module loads.
  const bounds = instrument.getBoundingClientRect();
  root.dataset.instrumentVisible = String(bounds.bottom > 0 && bounds.top < window.innerHeight);
  updateMotion();
  toggle.hidden = false;
  toggle.addEventListener('click', () => { paused = !paused; updateMotion(); });
  reduced.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);

  if ('IntersectionObserver' in window) {
    const instrumentObserver = new IntersectionObserver(([entry]) => {
      root.dataset.instrumentVisible = String(entry.isIntersecting);
    }, { threshold:0 });
    instrumentObserver.observe(instrument);

    // Static explanatory sections remain fully visible without JS or motion.
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (!paused && !reduced.matches && !document.hidden) entry.target.classList.add('reveal-arrived');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold:.12 });
    document.querySelectorAll('.notice, .section-title, .method-grid article, .cli-section').forEach((section) => revealObserver.observe(section));
  }
}

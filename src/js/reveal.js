import { reduced, spring } from './motion.js';

export function initReveal() {
  const els = [...document.querySelectorAll('.reveal')];
  const finish = (el) => { el.style.opacity = ''; el.style.transform = ''; el.classList.add('is-in'); };
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach(finish); return; }
  const run = (el) => {
    const kids = el.hasAttribute('data-stagger') ? [...el.children] : [];
    const targets = kids.length ? [el, ...kids] : [el];
    targets.forEach((t, i) => {
      const delay = i === 0 ? 0 : 60 + i * 55;
      if (i > 0) t.style.opacity = '0';
      spring({
        delay,
        onUpdate: (p) => {
          t.style.opacity = String(Math.max(0, Math.min(1, p * 1.15)));
          t.style.transform = 'translate3d(0,' + ((1 - p) * 26).toFixed(2) + 'px,0) scale(' + (0.985 + 0.015 * p).toFixed(4) + ')';
        },
        onDone: () => finish(t),
      });
    });
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      run(e.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
  els.forEach((el) => io.observe(el));
}

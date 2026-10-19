import { reduced } from './motion.js';

/* scroll progress */
export function initProgress() {
  const bar = document.querySelector('.progress span');
  if (!bar) return;
  let q = false;
  const upd = () => {
    q = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0).toFixed(4) + ')';
  };
  addEventListener('scroll', () => { if (!q) { q = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd);
  upd();
}

/* spotlight: pointer position feeds --mx/--my on the card under it */
export function initSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('[data-spot]');
    if (!t) return;
    const x = e.clientX, y = e.clientY;
    requestAnimationFrame(() => {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', (x - r.left) + 'px');
      t.style.setProperty('--my', (y - r.top) + 'px');
    });
  }, { passive: true });
}

/* parallax: pointer + scroll, eased toward target */
export function initParallax() {
  const layers = [...document.querySelectorAll('[data-depth]')];
  if (!layers.length) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, sy = scrollY, csy = scrollY, raf = 0;
  addEventListener('pointermove', (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  addEventListener('scroll', () => { sy = scrollY; }, { passive: true });
  const loop = () => {
    if (reduced()) { layers.forEach((l) => { l.style.transform = ''; }); return; }
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07; csy += (sy - csy) * 0.1;
    for (const l of layers) {
      const d = parseFloat(l.dataset.depth);
      l.style.transform = 'translate3d(' + (-cx * d * 160).toFixed(2) + 'px,' + (-cy * d * 110 - csy * d * 0.9).toFixed(2) + 'px,0)';
    }
    raf = requestAnimationFrame(loop);
  };
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(loop);
  });
  raf = requestAnimationFrame(loop);
}

/* tabs */
export function initTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const select = (id, focus) => {
    tabs.forEach((t) => {
      const on = t.id === 'tab-' + id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      p.hidden = !on;
      if (on) { p.classList.add('is-in'); if (focus) t.focus(); }
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t.id.slice(4)));
    t.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!k) return;
      e.preventDefault();
      select(tabs[(i + k + tabs.length) % tabs.length].id.slice(4), true);
    });
  });
  document.querySelectorAll('a[data-tab]').forEach((a) => a.addEventListener('click', () => select(a.dataset.tab)));
}

/* copy: any [data-copy] button */
export function initCopy() {
  const live = document.getElementById('live');
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-only';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  };
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    const ok = await copy(b.dataset.copy);
    if (live) live.textContent = ok ? 'Copied to clipboard' : 'Copy failed, select the text by hand';
    if (!ok) return;
    b.dataset.copied = 'true';
    clearTimeout(b._t);
    b._t = setTimeout(() => { delete b.dataset.copied; if (live) live.textContent = ''; }, 1600);
  });
}

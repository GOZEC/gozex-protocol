const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;

/* Damped spring, fixed 1/120s sub-steps. Progress runs 0 to 1 with a slight overshoot. */
export function spring({ stiffness = 170, damping = 22, mass = 1, delay = 0, onUpdate, onDone }) {
  let x = 0, v = 0, raf = 0, last = 0, acc = 0, dead = false;
  const dt = 1 / 120;
  const step = (t) => {
    if (dead) return;
    if (!last) last = t;
    acc += Math.min(0.05, (t - last) / 1000);
    last = t;
    while (acc >= dt) {
      const a = (stiffness * (1 - x) - damping * v) / mass;
      v += a * dt;
      x += v * dt;
      acc -= dt;
    }
    if (Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.002) { onUpdate(1); if (onDone) onDone(); return; }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  const timer = setTimeout(() => { raf = requestAnimationFrame(step); }, delay);
  return () => { dead = true; clearTimeout(timer); cancelAnimationFrame(raf); };
}

export function tween(from, to, ms, onUpdate, onDone) {
  let raf = 0, t0 = 0, dead = false;
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const f = (t) => {
    if (dead) return;
    if (!t0) t0 = t;
    const p = Math.min(1, (t - t0) / ms);
    onUpdate(from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(f); else if (onDone) onDone();
  };
  raf = requestAnimationFrame(f);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

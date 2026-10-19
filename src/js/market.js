/* Market data layer. Reads ONLY the market-source register record. */
const reg = JSON.parse(document.getElementById('register-data').textContent);
const src = reg.records.find((r) => r.id === 'market-source');

const POLL_MS = 60000;
const TRIES = 4;
const BASE_MS = 800;
const CAP_MS = 8000;

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
});

async function getJSON(url, signal) {
  const c = new AbortController();
  const kill = setTimeout(() => c.abort(), 12000);
  const onAbort = () => c.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const r = await fetch(url, { signal: c.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(kill);
    signal.removeEventListener('abort', onAbort);
  }
}

async function withBackoff(fn, signal) {
  let err;
  for (let i = 0; i < TRIES; i++) {
    try { return await fn(); } catch (e) {
      if (e.name === 'AbortError' && signal.aborted) throw e;
      err = e;
      if (i < TRIES - 1) await sleep(Math.min(CAP_MS, BASE_MS * 2 ** i) * (0.75 + Math.random() * 0.5), signal);
    }
  }
  throw err;
}

async function pull(signal) {
  const boosts = await getJSON(src.boosts, signal);
  const seen = new Set();
  const addrs = [];
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b && b.chainId === 'solana' && typeof b.tokenAddress === 'string' && !seen.has(b.tokenAddress)) {
      seen.add(b.tokenAddress); addrs.push(b.tokenAddress);
    }
  }
  if (!addrs.length) throw new Error('no solana entries');
  const chunks = [];
  for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
  const parts = await Promise.all(chunks.map((c) => getJSON(src.pairs.replace('{addresses}', c.join(',')), signal)));
  const best = new Map();
  for (const p of parts.flat()) {
    if (!p || !p.baseToken || !seen.has(p.baseToken.address)) continue;
    const vol = Number(p.volume && p.volume.h24);
    if (!Number.isFinite(vol)) continue;
    const cur = best.get(p.baseToken.address);
    if (!cur || vol > cur.volume) {
      best.set(p.baseToken.address, {
        address: p.baseToken.address,
        symbol: p.baseToken.symbol || '?',
        name: p.baseToken.name || '',
        imageUrl: (p.info && p.info.imageUrl) || '',
        price: Number(p.priceUsd),
        change: Number(p.priceChange && p.priceChange.h24),
        volume: vol,
        liquidity: Number(p.liquidity && p.liquidity.usd),
      });
    }
  }
  const rows = [...best.values()].sort((a, b) => b.volume - a.volume).slice(0, 10);
  if (!rows.length) throw new Error('no pairs');
  return rows;
}

export function startMarket({ onLoading, onData, onError }) {
  let ctrl = null, timer = 0, fails = 0, good = null;
  const clear = () => { clearTimeout(timer); timer = 0; if (ctrl) ctrl.abort(); ctrl = null; };
  const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(tick, ms); };
  async function tick() {
    if (document.hidden) return;
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const mine = ctrl;
    onLoading(!!good);
    try {
      const rows = await withBackoff(() => pull(mine.signal), mine.signal);
      if (mine !== ctrl) return;
      good = rows; fails = 0;
      onData(rows);
      schedule(POLL_MS);
    } catch (e) {
      if (mine !== ctrl || (e.name === 'AbortError' && mine.signal.aborted)) return;
      fails += 1;
      onError(!!good, good);
      schedule(Math.min(POLL_MS, 5000 * 2 ** (fails - 1)));
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear(); else tick();
  });
  if (!document.hidden) tick();
}

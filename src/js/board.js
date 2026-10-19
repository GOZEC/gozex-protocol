import { reduced, tween } from './motion.js';
import { usdCompact, usdPrice, pct } from './format.js';

const $ = (s, r = document) => r.querySelector(s);
const ICON = (id) => '<svg class="icon" aria-hidden="true" width="18" height="18"><use href="#' + id + '"/></svg>';
const N = 10;

const rowsEl = $('#rows');
const tickEl = $('.ticker');
const track = $('#ticker-track');
const pill = $('#status-pill');
const note = $('#board-note');
const stat = { vol: $('#stat-vol'), liq: $('#stat-liq'), up: $('#stat-up'), n: $('#stat-n') };

function logoHTML(sym) {
  return '<span class="logo"><span class="letter">' + esc((sym || '?').trim().charAt(0).toUpperCase() || '?') + '</span></span>';
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function attachImg(logo, url) {
  if (!url) return;
  const img = new Image();
  img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.onload = () => logo.classList.add('has-img');
  img.onerror = () => img.remove();
  img.src = url;
  logo.appendChild(img);
}

function buildRows() {
  const bar = (c) => '<span class="bar ' + (c || '') + '"></span>';
  for (let i = 0; i < N; i++) {
    const li = document.createElement('li');
    li.className = 'row'; li.dataset.state = 'skeleton'; li.dataset.spot = '';
    li.style.setProperty('--i', i);
    li.innerHTML =
      '<div class="skel" aria-hidden="true">' + bar() + '<span class="tok">' + bar('b-logo') + bar('b-tok') + '</span>' + bar() + bar() + bar() + bar() + bar('b-logo') + '</div>' +
      '<div class="real"><span class="rank">' + (i + 1) + '</span><span class="tok"></span>' +
      '<span class="cell price" data-label="Price"></span><span class="cell chg" data-label="24h"></span>' +
      '<span class="cell vol" data-label="Volume"></span><span class="cell liq" data-label="Liquidity"></span>' +
      '<button class="copy" type="button" disabled aria-label="Copy token address">' +
      '<svg class="icon copy-i" aria-hidden="true" width="18" height="18"><use href="#i-copy"/></svg><svg class="icon tick-i" aria-hidden="true" width="18" height="18"><use href="#i-tick"/></svg></button></div>';
    rowsEl.appendChild(li);
  }
  track.innerHTML = Array.from({ length: 10 }, () => '<span class="tick tick-skel"><span class="bar"></span></span>').join('');
}

/* number with count-up and flash */
function setNum(el, to, fmt, { initialFrom = 0, flash = true } = {}) {
  const prev = el._v;
  if (el._stop) el._stop();
  el._v = to;
  const show = (v) => { el.textContent = fmt(v); };
  if (!Number.isFinite(to)) { show(NaN); return; }
  if (reduced()) { show(to); return; }
  const from = Number.isFinite(prev) ? prev : initialFrom;
  if (flash && Number.isFinite(prev) && prev !== to) {
    el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth;
    el.classList.add(to > prev ? 'flash-up' : 'flash-down');
    setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 1000);
  }
  if (from === to) { show(to); return; }
  el._stop = tween(from, to, 700, show, () => show(to));
}

function fillRow(li, t, first) {
  const real = $('.real', li);
  const tok = $('.tok', real);
  if (li._addr !== t.address) {
    li._addr = t.address;
    tok.innerHTML = logoHTML(t.symbol) + '<span class="tok-text"><b class="sym"></b><span class="nm"></span></span>';
    $('.sym', tok).textContent = t.symbol;
    $('.nm', tok).textContent = t.name;
    attachImg($('.logo', tok), t.imageUrl);
    ['.price', '.chg', '.vol', '.liq'].forEach((s) => { const c = $(s, real); c._v = undefined; });
  }
  const btn = $('.copy', real);
  btn.disabled = false; btn.dataset.copy = t.address; btn.setAttribute('aria-label', 'Copy address for ' + t.symbol);
  setNum($('.price', real), t.price, usdPrice, { initialFrom: t.price });
  const chg = $('.chg', real);
  chg.classList.toggle('up', t.change > 0); chg.classList.toggle('down', t.change < 0);
  setNum(chg, t.change, (v) => pct(v));
  setNum($('.vol', real), t.volume, usdCompact);
  setNum($('.liq', real), t.liquidity, usdCompact);
  li.dataset.state = 'ready';
}

function fillTicker(rows) {
  const one = rows.map((t) => {
    const cls = t.change > 0 ? 'up' : t.change < 0 ? 'down' : '';
    return '<span class="tick">' + logoHTML(t.symbol) + '<b>' + esc(t.symbol) + '</b><span class="px">' + usdPrice(t.price) + '</span><span class="cell chg ' + cls + '">' + pct(t.change) + '</span></span>';
  }).join('');
  track.innerHTML = one + one;
  [...track.children].forEach((el, i) => attachImg($('.logo', el), rows[i % rows.length].imageUrl));
  tickEl.dataset.state = 'ready';
  requestAnimationFrame(() => track.style.setProperty('--dur', Math.max(24, track.scrollWidth / 2 / 55).toFixed(1) + 's'));
}

function setPill(state, text) {
  pill.dataset.status = state;
  $('.pill-text', pill).textContent = text;
}

function fillStats(rows) {
  const sum = (k) => rows.reduce((a, r) => a + (Number.isFinite(r[k]) ? r[k] : 0), 0);
  setNum(stat.vol, sum('volume'), usdCompact);
  setNum(stat.liq, sum('liquidity'), usdCompact);
  setNum(stat.up, rows.filter((r) => r.change > 0).length, (v) => Math.round(v) + ' of ' + rows.length, { flash: false });
  setNum(stat.n, rows.length, (v) => String(Math.round(v)), { flash: false });
}

export const ui = {
  init: buildRows,
  loading(hasData) { if (!hasData) setPill('loading', 'Syncing'); },
  data(rows) {
    note.hidden = true;
    setPill('live', 'Live');
    const first = !rowsEl.querySelector('.row[data-state="ready"]');
    [...rowsEl.children].forEach((li, i) => {
      if (rows[i]) fillRow(li, rows[i], first);
    });
    fillStats(rows);
    fillTicker(rows);
  },
  error(hasData) {
    note.hidden = false;
    if (hasData) { setPill('stale', 'Retrying, showing last pull'); return; }
    setPill('error', 'Source offline');
    [...rowsEl.children].forEach((li) => {
      const real = $('.real', li);
      $('.tok', real).innerHTML = logoHTML('–') + '<span class="tok-text"><b class="sym">—</b><span class="nm">no data</span></span>';
      ['.price', '.chg', '.vol', '.liq'].forEach((s) => { $(s, real).textContent = '—'; });
      li.dataset.state = 'error';
    });
    Object.values(stat).forEach((e) => { e.textContent = '—'; });
  },
};

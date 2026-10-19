import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const X_PATH = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';
const octicon = () => {
  const p = path.join(ROOT, 'node_modules/@primer/octicons/build/svg/mark-github-16.svg');
  return /<path d="([^"]+)"/.exec(fs.readFileSync(p, 'utf8'))[1];
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function validate(reg) {
  const errs = [];
  const ids = new Set();
  for (const r of reg.records) {
    if (ids.has(r.id)) errs.push('duplicate id ' + r.id);
    ids.add(r.id);
    if (!['stated', 'absent', 'unconfirmed'].includes(r.state)) errs.push(r.id + ': bad state');
    if (r.state !== 'stated') {
      for (const k of ['value', 'url', 'rpc', 'boosts', 'pairs']) if (k in r) errs.push(r.id + ': inert record carries ' + k);
    } else {
      if (r.kind === 'address' && !B58.test(r.value || '')) errs.push(r.id + ': not an address of the stated chain');
      if (r.kind === 'link' && r.id !== 'site') {
        let u; try { u = new URL(r.url); } catch { errs.push(r.id + ': bad url'); continue; }
        if (u.protocol !== 'https:' || !r.host.includes(u.hostname.replace(/^www\./, ''))) errs.push(r.id + ': host not allowed');
      }
      if (r.kind !== 'link' && !r.value) errs.push(r.id + ': stated without value');
    }
  }
  return errs;
}

export const handleOf = (url) => {
  const seg = new URL(url).pathname.split('/').filter(Boolean)[0];
  return seg ? '@' + seg.replace(/^@/, '') : '';
};

function social(rec, svg) {
  const label = esc(rec.label);
  if (rec.state === 'stated') {
    const h = handleOf(rec.url);
    return `    <a class="social" data-record="${rec.id}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}${h ? ' ' + esc(h) : ''}">${svg}</a>`;
  }
  return `    <span class="social is-inert" data-record="${rec.id}" data-state="${rec.state}" role="img" aria-label="${label}: pending" title="${label}: pending">${svg}</span>`;
}

function caSlot(rec) {
  if (rec.state === 'stated') {
    return `<section class="ca" id="ca" data-record="ca" data-state="stated" aria-label="${esc(rec.label)}">
  <div class="ca-label">${esc(rec.label)}</div>
  <div class="ca-row">
    <code class="ca-value" id="ca-value">${esc(rec.value)}</code>
    <button class="ca-copy" type="button" data-copy="${esc(rec.value)}" aria-label="Copy contract address"><svg class="icon" aria-hidden="true" width="18" height="18"><use href="#i-copy"/></svg><span class="lbl-copy">Copy</span><span class="lbl-done">Copied</span></button>
  </div>
</section>`;
  }
  return `<section class="ca" id="ca" data-record="ca" data-state="${rec.state}" aria-label="${esc(rec.label)}">
  <div class="ca-label">${esc(rec.label)}</div>
  <div class="ca-row"><span class="ca-value">pending</span></div>
</section>`;
}

function fact(rec) {
  const stated = rec.state === 'stated';
  let value = '<span class="fact-value">pending</span>';
  if (stated) {
    if (rec.kind === 'address') value = `<span class="fact-value mono">${esc(rec.value)}</span>`;
    else if (rec.kind === 'link') value = `<span class="fact-value"><a class="fact-link" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer">${esc(rec.id === 'site' ? rec.value : handleOf(rec.url) || rec.label)}</a></span>`;
    else value = `<span class="fact-value">${esc(rec.value)}</span>`;
  }
  const src = stated && rec.source ? `<span class="fact-src">Source: ${esc(rec.source)}</span>` : '';
  return `      <li data-record="${rec.id}" data-state="${rec.state}" data-spot><span class="fact-label">${esc(rec.label)}</span>${value}${src}</li>`;
}

const chip = (rec) =>
  `      <li data-record="${rec.id}" data-state="${rec.state}" data-spot><span class="chip-label">${esc(rec.label)}</span><span class="chip-value">${rec.state === 'stated' ? esc(rec.value) : 'pending'}</span></li>`;

export function publicRegister(reg) {
  const strip = (r) => { const { checked, ...rest } = r; return rest; };
  return { project: reg.project, records: reg.records.map(strip) };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

export function build({ registerPath = path.join(ROOT, 'register.json'), outDir = path.join(ROOT, 'dist') } = {}) {
  const reg = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  const errs = validate(reg);
  if (errs.length) throw new Error('register invalid:\n  ' + errs.join('\n  '));
  const rec = (id) => reg.records.find((r) => r.id === id);
  const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/palette.json'), 'utf8'));

  fs.rmSync(outDir, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'src'), outDir);
  fs.rmSync(path.join(outDir, 'palette.json'));

  const xSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${X_PATH}"/></svg>`;
  const ghSvg = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${octicon()}"/></svg>`;
  const site = rec('site'), chain = rec('chain');
  const pills = [
    site.state === 'stated'
      ? `        <a class="hero-pill" href="${esc(site.url)}" rel="noopener">${esc(site.value)}</a>`
      : `        <span class="hero-pill">${esc(site.label)}: pending</span>`,
    chain.state === 'stated' ? `        <span class="hero-pill">${esc(chain.value)}</span>` : `        <span class="hero-pill">${esc(chain.label)}: pending</span>`,
  ].join('\n');
  const foot = site.state === 'stated' ? `<a href="${esc(site.url)}" rel="noopener">${esc(site.value)}</a>` : `${esc(site.label)}: pending`;
  const factIds = ['chain', 'ca', 'x', 'github', 'site', 'market-source', 'team'];
  const chipIds = ['supply', 'allocation', 'liquidity', 'locks'];
  const pub = JSON.stringify(publicRegister(reg)).replace(/</g, '\\u003c');

  const map = {
    THEME_COLOR: palette.bg.hex,
    SOCIALS: [social(rec('x'), xSvg), social(rec('github'), ghSvg)].join('\n'),
    CA_SLOT: caSlot(rec('ca')),
    HERO_PILLS: pills,
    FACTS: factIds.map((i) => fact(rec(i))).join('\n'),
    CHIPS: chipIds.map((i) => chip(rec(i))).join('\n'),
    FOOT_SITE: foot,
    REGISTER_JSON: pub,
  };
  let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in map)) throw new Error('unknown placeholder ' + k);
    return map[k];
  });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  return { outDir, reg };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = build();
  console.log('built ->', path.relative(ROOT, r.outDir));
}

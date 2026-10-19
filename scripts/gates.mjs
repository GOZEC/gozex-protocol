import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { build, validate, B58 } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TMP = path.join(ROOT, '.gates-tmp');
const results = [];
const gate = (name, fn) => {
  try { const r = fn(); if (r === false) throw new Error('returned false'); results.push([name, true]); }
  catch (e) { results.push([name, false, e.message]); }
};
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const TEXT = /\.(html|css|js|json|svg|md|txt|mjs|py)$/;
const textFiles = (d) => walk(d).filter((f) => TEXT.test(f));
const assert = (c, m) => { if (!c) throw new Error(m); };

/* ---------- helpers ---------- */
export const ADDR_RE = /\b(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
/* Address scanner: every address-shaped string must match a STATED registry value.
   0x hex is never rejected as such, only when it is not in the registry. */
function scanAddresses(text, reg) {
  const allowed = new Set(reg.records.filter((r) => r.state === 'stated' && typeof r.value === 'string').map((r) => r.value));
  return [...text.matchAll(ADDR_RE)].map((m) => m[0]).filter((a) => !allowed.has(a));
}
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
const textOf = (html) => visible(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
const attrsOf = (html) => [...visible(html).matchAll(/\s(?:aria-[a-z]+|title|alt|content|placeholder)="([^"]*)"/g)].map((m) => m[1]).join(' \n ');
const DATE_RES = [
  /\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/, /\b\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}\b/,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, /\b\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
  /\b(?:19|20)\d{2}\b/, /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/i,
  /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\b\d+\s*(?:s|sec|secs|seconds|min|mins|minutes|h|hours|days?) ago\b/i, /\bago\b/i, /\btoday\b/i,
];
const hasDate = (s) => DATE_RES.find((r) => r.test(s));

const words = (s) => s.toLowerCase().replace(/[’']/g, "'").split(/[.!?:;,\n\r()\[\]"“”—–|/]+/).map((seg) => seg.split(/[^a-z0-9'+-]+/).filter(Boolean));
const bigrams = (s) => { const set = new Set(); for (const w of words(s)) for (let i = 0; i < w.length - 1; i++) set.add(w[i] + ' ' + w[i + 1]); return set; };
const BAN_WORDS = ['unseen', 'everywhere', 'omni', 'omnizec', 'shield', 'vault', 'zcash', 'unlinked', 'confidential', 'toolkit', 'launcher'];

function mutated(reg, name, mode) {
  /* mode: 'stated' | 'absent'. Reads each record at runtime and forces it to the requested state. */
  const out = JSON.parse(JSON.stringify(reg));
  const b58 = 'BASE58CHARS'.length && Array.from({ length: 44 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[crypto.randomInt(58)]).join('');
  for (const r of out.records) {
    if (!['address', 'link'].includes(r.kind) || r.id === 'site') continue;
    if (mode === 'stated') {
      r.state = 'stated';
      if (r.kind === 'address') r.value = b58;
      else r.url = 'https://' + r.host[0] + '/test_' + r.id + '_handle';
    } else {
      r.state = r.state === 'stated' ? 'absent' : r.state;
      delete r.value; delete r.url;
    }
  }
  const p = path.join(TMP, name + '.json');
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out));
  return { out, p };
}

/* ---------- 1. source register ---------- */
const reg = JSON.parse(read(ROOT, 'register.json'));
gate('register: shape valid, inert records carry no value or url', () => { const e = validate(reg); assert(!e.length, e.join('; ')); });
gate('register: every record has one of stated|absent|unconfirmed', () => reg.records.every((r) => ['stated', 'absent', 'unconfirmed'].includes(r.state)));
gate('register: chain is Solana with the stated rpc, source and scope', () => {
  const c = reg.records.find((r) => r.id === 'chain');
  assert(c.value === 'Solana' && c.rpc === 'https://solana-rpc.publicnode.com' && c.source === 'client statement' && c.scope === 'batch-level', 'chain record');
});
gate('register: market-source is its own stated record', () => {
  const m = reg.records.find((r) => r.id === 'market-source');
  assert(m.state === 'stated' && m.boosts.includes('token-boosts/top/v1') && m.pairs.includes('/tokens/v1/solana/{addresses}'), 'market record');
});
gate('register: dates exist only in register.json', () => { assert(reg.records.some((r) => r.checked), 'no data dates'); });

/* ---------- 2. dist exists and is fresh ---------- */
gate('dist: index.html, favicon.svg, css, js present', () => ['index.html', 'favicon.svg', 'css/tokens.css', 'css/site.css', 'js/main.js', 'js/market.js'].forEach((f) => assert(fs.existsSync(path.join(DIST, f)), f)));
gate('dist: matches a fresh build of the current register', () => {
  build({ outDir: path.join(TMP, 'fresh') });
  const h = (d) => walk(d).map((f) => path.relative(d, f) + crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')).sort().join('|');
  assert(h(DIST) === h(path.join(TMP, 'fresh')), 'dist is stale, run npm run build');
});
gate('dist: nothing outside dist/ leaked in (no README, whitepaper, LICENSE, register source)', () => {
  const names = walk(DIST).map((f) => path.basename(f).toLowerCase());
  ['readme.md', 'license', 'whitepaper.md', 'register.json'].forEach((n) => assert(!names.includes(n), n));
});

/* ---------- 3. current-state build assertions ---------- */
const html = read(DIST, 'index.html');
const cur = Object.fromEntries(reg.records.map((r) => [r.id, r]));
const slot = (h, id) => (new RegExp('<[^>]*data-record="' + id + '"[^>]*>').exec(h) || [''])[0];

gate('social: X and GitHub icons both render, icon-only, in the header end', () => {
  const end = /<div class="header-end">([\s\S]*?)<\/div>/.exec(html)[1];
  assert(/data-record="x"/.test(end) && /data-record="github"/.test(end), 'missing icon');
  const txt = end.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
  assert(txt === '', 'text label present: ' + txt);
});
gate('social: official X mark and official GitHub Octicon paths', () => {
  const x = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';
  const gh = /<path d="([^"]+)"/.exec(read(ROOT, 'node_modules/@primer/octicons/build/svg/mark-github-16.svg'))[1];
  assert(html.includes(x) && html.includes(gh), 'path mismatch');
});
gate('current state: each social/CA element agrees with its record', () => {
  for (const id of ['x', 'github', 'ca']) {
    const el = slot(html, id);
    assert(new RegExp('data-state="' + cur[id].state + '"').test(el), id + ' state attr');
    if (cur[id].state !== 'stated' && id !== 'ca') assert(!/href=/.test(el), id + ' inert has href');
  }
});

/* ---------- 4. both branches via runtime-read mutation ---------- */
const absent = mutated(reg, 'absent', 'absent');
const stated = mutated(reg, 'stated', 'stated');
const unconf = (() => { const o = JSON.parse(JSON.stringify(reg)); for (const r of o.records) if (['address', 'link'].includes(r.kind) && r.id !== 'site') { r.state = 'unconfirmed'; delete r.value; delete r.url; } const p = path.join(TMP, 'unconf.json'); fs.writeFileSync(p, JSON.stringify(o)); return { out: o, p }; })();
const bA = build({ registerPath: absent.p, outDir: path.join(TMP, 'A') });
const bS = build({ registerPath: stated.p, outDir: path.join(TMP, 'S') });
const bU = build({ registerPath: unconf.p, outDir: path.join(TMP, 'U') });
const hA = read(TMP, 'A/index.html'), hS = read(TMP, 'S/index.html'), hU = read(TMP, 'U/index.html');
const caS = stated.out.records.find((r) => r.id === 'ca').value;

for (const [nm, h] of [['absent', hA], ['unconfirmed', hU]]) {
  gate(`branch ${nm}: CA slot shows label and pending only, no value, no copy control`, () => {
    const s = /<section class="ca"[\s\S]*?<\/section>/.exec(h)[0];
    assert(/pending/.test(s) && !/data-copy|<button|<code|ca-copy/.test(s), 'slot not inert');
  });
  gate(`branch ${nm}: X and GitHub render but inert (no href, aria says pending)`, () => {
    for (const id of ['x', 'github']) { const el = slot(h, id); assert(el && !/href=/.test(el) && /pending/.test(el) && /is-inert/.test(el), id); }
  });
  gate(`branch ${nm}: no address-shaped string anywhere in the output`, () => {
    for (const f of textFiles(path.join(TMP, nm === 'absent' ? 'A' : 'U'))) { const hits = scanAddresses(read(f), nm === 'absent' ? absent.out : unconf.out); assert(!hits.length, path.basename(f) + ': ' + hits[0]); }
  });
}
gate('branch stated: CA appears in full, large slot, with click-to-copy control carrying the value', () => {
  const s = /<section class="ca"[\s\S]*?<\/section>/.exec(hS)[0];
  assert(s.includes('>' + caS + '</code>') && s.includes('data-copy="' + caS + '"') && /<button/.test(s), 'slot');
  assert(/lbl-done/.test(s), 'no copied feedback label');
});
gate('branch stated: X and GitHub become real links, handle derived from the stored url', () => {
  for (const id of ['x', 'github']) {
    const r = stated.out.records.find((q) => q.id === id), el = slot(hS, id);
    assert(el.includes('href="' + r.url + '"') && el.includes('@test_' + id + '_handle'), id);
    assert(/rel="noopener noreferrer"/.test(el), 'rel');
  }
});
gate('branch stated: address scanner passes (CA matches the stated registry) and nothing else is address-shaped', () => {
  for (const f of textFiles(path.join(TMP, 'S'))) { const hits = scanAddresses(read(f), stated.out); assert(!hits.length, path.basename(f) + ': ' + hits[0]); }
});
gate('gate warning: 0x hex is not blanket-rejected, only matched against the registry', () => {
  const hex = '0x' + 'ab12'.repeat(10);
  const regHex = { records: [{ id: 't', state: 'stated', value: hex }] };
  assert(scanAddresses('see ' + hex, regHex).length === 0, 'registered 0x rejected');
  assert(scanAddresses('see ' + hex, { records: [] }).length === 1, 'unregistered 0x accepted');
  assert(scanAddresses('see ' + 'C'.repeat(44), { records: [] }).length === 1, 'unregistered base58 accepted');
});
gate('mutation anchors are state-independent (flip both ways from whatever the record holds)', () => {
  const src = read(ROOT, 'scripts/gates.mjs');
  assert(!/"state":\s*"absent"|replace\(['"]absent/.test(src.split('/* ---------- 1.')[1].replace(/gate\('mutation anchors[\s\S]*$/, '')), 'hardcoded anchor');
  assert(hA !== hS && stated.out.records.find((r) => r.id === 'ca').state === 'stated' && absent.out.records.find((r) => r.id === 'ca').state !== 'stated', 'mutation did not flip');
});

/* ---------- 5. market independence ---------- */
gate('market: market.js reads only the market-source record, never the CA record', () => {
  const m = read(DIST, 'js/market.js');
  assert(/r\.id === 'market-source'/.test(m) && !/['"]ca['"]|#ca|ca-value|data-record/.test(m), 'market touches CA');
  for (const f of ['board.js', 'main.js']) assert(!/['"]ca['"]|#ca\b|ca-value/.test(read(DIST, 'js', f)), f);
});
gate('market: JS and CSS are byte-identical across CA absent and CA stated builds', () => {
  for (const f of ['js/market.js', 'js/board.js', 'js/main.js', 'css/site.css']) assert(read(TMP, 'A', f) === read(TMP, 'S', f), f);
  const mr = (h) => JSON.parse(/id="register-data">([\s\S]*?)<\/script>/.exec(h)[1]).records.find((r) => r.id === 'market-source');
  assert(JSON.stringify(mr(hA)) === JSON.stringify(mr(hS)), 'market record differs');
});
gate('market: endpoints, solana filter, 30-address chunks, top 10 by 24h volume', () => {
  const m = read(DIST, 'js/market.js');
  assert(/chainId === 'solana'/.test(m) && /i \+= 30/.test(m) && /slice\(0, 10\)/.test(m) && /volume\.h24|volume && p\.volume\.h24/.test(m), 'logic');
  assert(/token-boosts\/top\/v1/.test(html) && /tokens\/v1\/solana\/\{addresses\}/.test(html), 'urls come from register');
});
gate('market: 60s poll, pause while hidden, immediate fetch on visible, exponential backoff, last good kept', () => {
  const m = read(DIST, 'js/market.js');
  assert(/POLL_MS = 60000/.test(m) && /document\.hidden/.test(m) && /visibilitychange/.test(m) && /2 \*\* i/.test(m) && /2 \*\* \(fails - 1\)/.test(m) && /onError\(!!good, good\)/.test(m), 'behaviour');
});
gate('market: board shows logo, price, 24h, volume, liquidity, copy-per-address; letter tile fallback; skeleton; marquee', () => {
  const b = read(DIST, 'js/board.js');
  assert(/imageUrl/.test(read(DIST, 'js/market.js')) && /class="letter"/.test(b) && /img\.onerror/.test(b) && /usdPrice/.test(b) && /dataset.copy/.test(b) && /b-logo/.test(b) && /ticker-track|track\.innerHTML/.test(b), 'board');
});

/* ---------- 6. no dates ---------- */
for (const [nm, h] of [['current', html], ['absent', hA], ['stated', hS]]) {
  gate(`no dates (${nm}): visible text, attributes, aria-labels and tooltips`, () => {
    const t = textOf(h), a = attrsOf(h);
    const r = hasDate(t) || hasDate(a);
    assert(!r, 'matched ' + r + ' in ' + ((t.match(r) || a.match(r) || [''])[0]));
  });
}
gate('no dates: no file in dist carries a date, timestamp or clock string', () => {
  for (const f of textFiles(DIST)) {
    if (f.endsWith('tokens.css')) continue; // provenance comment holds only file names and coordinates
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const lit = s.replace(/<script[\s\S]*?<\/script>/g, '');
    const r = [DATE_RES[0], DATE_RES[1], DATE_RES[5], DATE_RES[6], DATE_RES[7]].find((x) => x.test(f.endsWith('.js') ? s : lit));
    assert(!r, path.basename(f) + ' ' + r);
  }
});
gate('no dates: the public register copy in dist has no date fields', () => {
  const j = /id="register-data">([\s\S]*?)<\/script>/.exec(html)[1];
  assert(!/checked/.test(j) && !hasDate(j.replace(/https?:[^"]+/g, '')), 'register copy');
});
gate('no dates: year is not present in footer or LICENSE-free page', () => assert(!/\b(19|20)\d{2}\b/.test(textOf(html)), 'year'));

/* ---------- 7. palette ---------- */
const pal = JSON.parse(read(ROOT, 'src/palette.json'));
const imgCache = {};
const pixel = (file, x, y) => {
  const f = path.join(ROOT, file);
  if (!imgCache[f]) { const b = fs.readFileSync(f); imgCache[f] = f.toLowerCase().endsWith('.png') ? PNG.sync.read(b) : jpeg.decode(b, { useTArray: true }); }
  const im = imgCache[f], i = (y * im.width + x) * 4;
  return '#' + [0, 1, 2].map((k) => im.data[i + k].toString(16).padStart(2, '0')).join('');
};
gate('palette: every swatch is a real pixel at its recorded file and coordinate', () => {
  for (const [k, v] of Object.entries(pal)) { const got = pixel(v.file, v.x, v.y); assert(got === v.hex, k + ' ' + v.hex + ' vs ' + got); }
});
gate('palette: tokens.css holds exactly the palette hexes and a provenance block', () => {
  const t = read(ROOT, 'src/css/tokens.css');
  const found = [...t.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  const want = new Set(Object.values(pal).map((v) => v.hex));
  assert(found.length && found.every((h) => want.has(h)), 'foreign hex in tokens');
  assert(/k-means/.test(t) && /real pixel/i.test(t) && Object.values(pal).every((v) => t.includes(v.hex + '  ' + v.file + ' @ (' + v.x + ',' + v.y + ')')), 'provenance');
});
gate('palette: colour literals live only in tokens.css (plus generated favicon.svg and theme-color meta)', () => {
  const want = new Set(Object.values(pal).map((v) => v.hex));
  for (const f of [...textFiles(path.join(ROOT, 'src')), ...textFiles(DIST), ...textFiles(path.join(ROOT, 'scripts'))]) {
    const b = path.basename(f);
    if (b === 'tokens.css' || b === 'palette.json' || b === 'favicon.svg' || b === 'gates.mjs' || b === 'measure.mjs') continue;
    let s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    if (b === 'index.html') s = s.replace(/<meta name="theme-color" content="#[0-9a-f]{6}">/, '').replace(/\{\{[A-Z_]+\}\}/g, '');
    s = s.replace(/&#\d+;|&#x[0-9a-f]+;/gi, '').replace(/[?&]#[a-z-]+/g, '').replace(/href="#[A-Za-z0-9_-]+"/g, '').replace(/url\(#[^)]+\)/g, '').replace(/#(?:top|angles|market|workspace|ca|live|i-[a-z]+|ticker-track|rows|stat-[a-z]+|status-pill|board-note|register-data|hero-title|angles-title|market-title|workspace-title|tab-[a-z]+|panel-[a-z]+)\b/g, '');
    const m = s.match(/(?<![\w&"'-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![\w-])/g);
    assert(!m, path.relative(ROOT, f) + ' has ' + (m && m[0]));
  }
  const t = /<meta name="theme-color" content="(#[0-9a-f]{6})">/.exec(html)[1];
  assert(want.has(t), 'theme-color not in palette');
});
gate('palette: no rgb()/hsl() literal colours outside tokens.css', () => {
  for (const f of textFiles(DIST)) { if (f.endsWith('tokens.css')) continue; assert(!/\b(?:rgba?|hsla?)\(\s*\d/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')), path.basename(f)); }
});

/* ---------- 8. favicon ---------- */
const fav = read(DIST, 'favicon.svg');
gate('favicon: svg, 32x32, viewBox 0 0 32 32', () => assert(/<svg[^>]*width="32"[^>]*height="32"[^>]*viewBox="0 0 32 32"/.test(fav), 'dims'));
gate('favicon: no double hyphen anywhere, no xml comments', () => assert(!fav.includes('--') && !fav.includes('<!--'), 'double hyphen'));
gate('favicon: every fill is a palette colour; shape is traced from the logo grid (many cells, 3 tones)', () => {
  const want = new Set(Object.values(pal).map((v) => v.hex));
  const fills = [...fav.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  assert(fills.length >= 3 && fills.every((f) => want.has(f)), 'fills');
  assert((fav.match(/M\d+ \d+h/g) || []).length > 80, 'not traced');
});
gate('favicon: linked from index.html as image/svg+xml', () => assert(/rel="icon" type="image\/svg\+xml" href="favicon.svg"/.test(html), 'link'));

/* ---------- 9. css / layout / motion rules ---------- */
const css = textFiles(path.join(DIST, 'css')).map((f) => read(f)).join('\n');
gate('css: no ch units', () => assert(!/\d(?:\.\d+)?ch\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'ch unit'));
gate('css: prefers-reduced-motion kills animation and transition', () => assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important[\s\S]*transition: none !important/.test(css), 'rm'));
gate('js: reveal, spring and parallax honour reduced motion', () => {
  assert(/reduced\(\)/.test(read(DIST, 'js/reveal.js')) && /reduced\(\)/.test(read(DIST, 'js/fx.js')) && /reduced\(\)/.test(read(DIST, 'js/board.js')), 'js rm');
  assert(/spring\(/.test(read(DIST, 'js/reveal.js')) && /stiffness/.test(read(DIST, 'js/motion.js')) && /damping/.test(read(DIST, 'js/motion.js')), 'damped spring');
});
gate('css: reference-measured motion values are present (0.85s ease, 28px dock rise, 2px arrow nudge, 0.25s hovers)', () => assert(/translateY\(28px\)/.test(css) && /\.85s var\(--ease-out\)/.test(css) && /translate\(2px, -2px\)/.test(css) && /var\(--t-mid\)/.test(css), 'values'));
gate('features present: progress bar, live dot pill, spotlight, parallax layers, mesh, skeleton, count-up, flash', () => {
  assert(/class="progress"/.test(html) && /class="dot"/.test(html) && /data-spot/.test(html) && /data-depth/.test(html) && /class="mesh"/.test(html), 'html');
  assert(/shimmer/.test(css) && /@keyframes ping/.test(css) && /flash-up/.test(css) && /tween\(/.test(read(DIST, 'js/board.js')), 'css/js');
});
gate('csp: meta CSP present, no inline script or style attributes in the shipped html', () => {
  assert(/Content-Security-Policy/.test(html), 'csp');
  const body = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '');
  assert(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(body) && !/\sstyle="/.test(body) && !/<style/.test(body), 'inline');
});
gate('a11y: tap targets declared at 44px minimum for header links, tabs, copy, pills', () => {
  for (const sel of ['.social', '.copy', '.tab', '.ca-copy', '.site-nav a', '.enter-link', '.hero-pill']) {
    const m = new RegExp(sel.replace('.', '\\.').replace(' ', '\\s') + '\\s*\\{[^}]*\\}').exec(css);
    assert(m && /(?:min-)?height:\s*44px/.test(m[0]), sel);
  }
});

/* ---------- 10. copy ---------- */
gate('copy: zero shared 2-grams with the reference corpus', () => {
  const ref = bigrams(read(ROOT, 'scripts/ref-corpus.txt'));
  const mine = bigrams(textOf(html) + '\n' + attrsOf(html) + '\n' + read(ROOT, 'README.md') + '\n' + read(ROOT, 'docs/whitepaper.md'));
  const shared = [...mine].filter((g) => ref.has(g));
  assert(!shared.length, 'shared: ' + shared.join(' | '));
});
gate('copy: none of the reference signature words appear', () => {
  const t = (textOf(html) + attrsOf(html) + read(ROOT, 'README.md') + read(ROOT, 'docs/whitepaper.md')).toLowerCase();
  const hit = BAN_WORDS.find((w) => new RegExp('\\b' + w + '\\b').test(t));
  assert(!hit, hit);
});

/* ---------- 11. repo hygiene ---------- */
gate('hygiene: no CLAUDE.md and no .claude directory', () => { const a = walk(ROOT).filter((f) => !f.includes('node_modules') && !f.includes('.git' + path.sep)); assert(!a.some((f) => /claude\.md$/i.test(f) || f.split(path.sep).includes('.claude')), 'found'); });
gate('hygiene: no AI attribution or mention in any project text file', () => {
  for (const f of [...textFiles(ROOT)].filter((f) => !f.includes('node_modules') && !f.includes('.gates-tmp') && !f.includes(path.sep + 'dist' + path.sep) && !/gates\.mjs$/.test(f))) {
    assert(!/\bclaude\b|\banthropic\b|\bchatgpt\b|\bopenai\b|co-authored-by|generated (?:by|with)|\bAI\b|\bLLM\b/i.test(read(f)), path.relative(ROOT, f));
  }
  for (const f of textFiles(DIST)) assert(!/\bclaude\b|\banthropic\b|generated (?:by|with)|\bAI\b/i.test(read(f)), 'dist ' + path.basename(f));
});
gate('repo content: README, whitepaper and LICENSE exist at root, not in dist', () => {
  const l = read(ROOT, 'LICENSE');
  assert(/MIT License/.test(l) && /Copyright \(c\) 2026 Gozec/.test(l), 'license');
  const r = read(ROOT, 'README.md');
  assert(/Solana/.test(r) && /badge/i.test(r) && /Overview/.test(r) && /Features/.test(r) && /Links/.test(r) && /pending/i.test(r), 'readme');
  const w = read(ROOT, 'docs/whitepaper.md');
  assert(/Vision/.test(w) && /Mission/.test(w) && /Tokenomics/.test(w) && /Phase 4/.test(w) && /Team/.test(w), 'whitepaper');
});
gate('hygiene: only brand/ and reference/ read; project writes stay inside this folder', () => {
  const s = read(ROOT, 'tools/prep.py');
  assert(!/\.\.\//.test(s.replace(/#.*$/gm, '')), 'path escape');
});

/* ---------- report ---------- */
fs.rmSync(TMP, { recursive: true, force: true });
let failed = 0;
for (const [n, ok, msg] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '\n       -> ' + msg)); if (!ok) failed++; }
console.log(`\ngates: ${results.length - failed} passed, ${failed} failed, ${results.length} total`);
process.exit(failed ? 1 : 0);

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const WIDTHS = [[360, 800], [390, 844], [430, 932], [1366, 768], [1440, 900]];

const { srv, port } = await serve(process.env.MEASURE_DIR || path.join(ROOT, 'dist'), 0);
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
let bad = 0;
for (const [w, h] of WIDTHS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.row[data-state="ready"],.row[data-state="error"]').length >= 1, { timeout: 40000 }).catch(() => {});
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 1500)); });
  // open every tab panel once so hidden panels are measured too
  const r = await page.evaluate(async () => {
    const out = { w: innerWidth, small: [], overflow: [] };
    const measure = () => {
      const vis = (e) => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && !e.closest('[hidden]'); };
      document.querySelectorAll('a[href], button:not([disabled]), [role="tab"], .social').forEach((e) => {
        if (!vis(e)) return;
        const b = e.getBoundingClientRect();
        if (b.width < 43.5 || b.height < 43.5) out.small.push((e.className || e.tagName) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' "' + (e.textContent || '').trim().slice(0, 18) + '"');
      });
    };
    for (const t of document.querySelectorAll('.tab')) { t.click(); await new Promise((r) => setTimeout(r, 400)); measure(); const root = document.documentElement; if (root.scrollWidth > innerWidth + 1) out.overflow.push('tab ' + t.id + ' ' + root.scrollWidth); }
    document.querySelector('#tab-vision').click();
    out.docW = document.documentElement.scrollWidth;
    const q = (s) => document.querySelector(s);
    const rect = (s) => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
    out.header = rect('.site-header'); out.x = rect('[data-record="x"]'); out.gh = rect('[data-record="github"]');
    const ca = q('.ca-value'); out.caFont = getComputedStyle(ca).fontSize; out.caRect = rect('.ca'); out.caFits = ca.scrollWidth <= ca.clientWidth + 1; out.caText = ca.textContent.trim();
    out.h1 = rect('h1'); const h1 = q('h1'); out.h1Font = getComputedStyle(h1).fontSize; out.h1Clipped = [...h1.querySelectorAll('span')].some((s) => s.getBoundingClientRect().right > innerWidth - 8);
    out.rows = document.querySelectorAll('.row[data-state="ready"]').length; out.rowsErr = document.querySelectorAll('.row[data-state="error"]').length;
    out.pill = q('.pill-text').textContent; out.tiles = document.querySelectorAll('.launcher li').length;
    out.launcherCols = getComputedStyle(q('.launcher')).gridTemplateColumns.split(' ').length;
    out.logos = document.querySelectorAll('.row .logo.has-img').length; out.letters = document.querySelectorAll('.row .logo:not(.has-img)').length;
    out.rowCopy = (() => { const b = q('.row .copy'); if (!b) return null; const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })();
    out.chOverflowEls = [...document.querySelectorAll('main *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 1 && !e.closest('.ticker,.tabs,.hero-art,.site-nav,.world'); }).slice(0, 5).map((e) => (e.className || e.tagName) + ' r=' + Math.round(e.getBoundingClientRect().right));
    return out;
  });
  const problems = [];
  if (r.docW > r.w + 1) problems.push('horizontal scroll ' + r.docW);
  if (r.small.length) problems.push('tap targets <44: ' + [...new Set(r.small)].join('; '));
  if (!r.x || !r.gh || r.x.right > r.w || r.gh.right > r.w || r.x.y > 60 || r.gh.y > 60 || r.x.x < r.w / 2 || r.gh.x < r.w / 2) problems.push('social icons not top-right');
  if (!r.caFits) problems.push('CA text clipped');
  if (r.h1Clipped) problems.push('h1 clipped');
  if (r.chOverflowEls.length) problems.push('overflowing: ' + r.chOverflowEls.join(', '));
  if (r.overflow.length) problems.push(r.overflow.join(', '));
  bad += problems.length;
  console.log(`\n== ${w}px  doc=${r.docW}  header=${r.header.h}px  icons x=(${r.x.x},${r.x.y},${r.x.w}x${r.x.h}) gh=(${r.gh.x},${r.gh.y},${r.gh.w}x${r.gh.h})`);
  console.log(`   CA font=${r.caFont} slot=${r.caRect.w}x${r.caRect.h} text="${r.caText}" fits=${r.caFits}`);
  console.log(`   h1 font=${r.h1Font} box=${r.h1.w}x${r.h1.h}  tiles=${r.tiles} cols=${r.launcherCols}  rows ready=${r.rowsErr ? 'error ' + r.rowsErr : r.rows} pill="${r.pill}" logos=${r.logos}/letters=${r.letters} rowCopy=${r.rowCopy}`);
  console.log('   ' + (problems.length ? 'PROBLEMS: ' + problems.join(' | ') : 'ok: no overflow, all tap targets >=44x44, icons top-right'));
  await page.screenshot({ path: path.join(ROOT, '.gates-tmp-shot-' + w + '.png'), fullPage: false }).catch(() => {});
  await page.close();
}
await browser.close();
srv.close();
for (const [w] of WIDTHS) fs.rmSync(path.join(ROOT, '.gates-tmp-shot-' + w + '.png'), { force: true });
console.log(`\nmeasure: ${bad} problem(s)`);
process.exit(bad ? 1 : 0);

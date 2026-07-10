// ============================================================================
//  PlayTonight — ÉTAPE 1/2 : enregistrement auto de la démo (Playwright)
// ----------------------------------------------------------------------------
//  Ce script ouvre le site, joue la démo à un rythme rapide (style TikTok),
//  s'enregistre lui-même en vidéo (pas besoin d'OBS) et écrit un fichier
//  `timeline.json` qui note l'instant de chaque étape.
//
//  Sortie :  output/raw.webm  +  output/timeline.json
//  Lancement :  npm run record   (ou : npm run make  pour tout enchaîner)
// ============================================================================

import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, 'output');

// ─── Config ─────────────────────────────────────────────────────────────────
const SITE_URL = 'https://play-tonight.vercel.app/';

// Les deux profils Steam PUBLICS à comparer (pseudo, URL complète ou SteamID64).
const STEAM_PROFILE_1 = '76561199553747123';
const STEAM_PROFILE_2 = '76561198007328344';

// Rythme rapide "tac-tac". Augmente les valeurs si tu veux ralentir.
const PACE = {
  slowMo: 0,
  move: 220,      // pause une fois le curseur arrivé
  beat: 450,      // petite respiration entre deux actions
  type: 28,       // ms par caractère tapé
  landing: 1100,  // temps sur l'accueil avant de commencer
  roulette: 3000, // durée de l'animation "Pick for us" (fixée par l'app)
  finalHold: 2600 // temps sur le résultat final
};

const VIEWPORT = { width: 1440, height: 900 };

// ─── Faux curseur visible (pour un rendu naturel dans la vidéo) ──────────────
function injectFakeCursor() {
  function setup() {
    if (document.getElementById('__demoCursor')) return;
    const c = document.createElement('div');
    c.id = '__demoCursor';
    c.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'width:26px', 'height:26px',
      'border-radius:50%', 'background:rgba(99,102,241,0.28)',
      'border:2px solid #818cf8', 'box-shadow:0 0 16px 6px rgba(99,102,241,0.5)',
      'pointer-events:none', 'z-index:2147483647',
      'transform:translate(-100px,-100px)',
      'transition:transform .09s ease-out, width .12s, height .12s'
    ].join(';');
    document.body.appendChild(c);
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    const render = () => { c.style.transform = `translate(${x - 13}px,${y - 13}px)`; };
    render();
    document.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; render(); }, true);
    document.addEventListener('mousedown', () => {
      const r = document.createElement('div');
      r.style.cssText = [
        'position:fixed', `left:${x}px`, `top:${y}px`, 'width:16px', 'height:16px',
        'margin:-8px 0 0 -8px', 'border-radius:50%', 'border:2px solid #818cf8',
        'pointer-events:none', 'z-index:2147483646', 'opacity:0.9',
        'transition:all .5s ease-out'
      ].join(';');
      document.body.appendChild(r);
      requestAnimationFrame(() => {
        r.style.width = '58px'; r.style.height = '58px';
        r.style.margin = '-29px 0 0 -29px'; r.style.opacity = '0';
      });
      setTimeout(() => r.remove(), 520);
    }, true);
  }
  if (document.body) setup(); else document.addEventListener('DOMContentLoaded', setup);
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────
const pause = (page, ms) => page.waitForTimeout(ms);

async function glideTo(page, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error('Élément introuvable pour le mouvement souris.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await pause(page, PACE.move);
}
async function moveAndClick(page, locator) {
  await glideTo(page, locator);
  await locator.click();
}

// ─── Scénario ────────────────────────────────────────────────────────────────
async function run() {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true, slowMo: PACE.slowMo });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: VIEWPORT }
  });
  await context.addInitScript(injectFakeCursor);
  const page = await context.newPage();

  // t0 ≈ début de la vidéo ; les marques sont relatives à cet instant.
  const t0 = Date.now();
  const marks = {};
  const mark = (name) => { marks[name] = Date.now() - t0; console.log(`  · ${name} @ ${marks[name]}ms`); };

  try {
    console.log('▶ Ouverture du site…');
    await page.goto(SITE_URL, { waitUntil: 'networkidle' });
    await page.evaluate(injectFakeCursor).catch(() => {});
    mark('start');
    await pause(page, PACE.landing);

    console.log('▶ Add Friends');
    await moveAndClick(page, page.getByText('Add Friends', { exact: true }));
    const inputs = page.getByPlaceholder('Steam URL or Username');
    await inputs.first().waitFor({ state: 'visible' });
    mark('addFriends');
    await pause(page, PACE.beat);

    console.log('▶ Saisie des deux profils');
    const a = inputs.nth(0);
    await glideTo(page, a); await a.click();
    await a.pressSequentially(STEAM_PROFILE_1, { delay: PACE.type });
    await pause(page, PACE.beat);
    const b = inputs.nth(1);
    await glideTo(page, b); await b.click();
    await b.pressSequentially(STEAM_PROFILE_2, { delay: PACE.type });
    await pause(page, PACE.beat);

    console.log('▶ Scan Games');
    const apiResponse = page.waitForResponse((r) => r.url().includes('/api/games'), { timeout: 90000 });
    await moveAndClick(page, page.getByRole('button', { name: /Scan Games|Scanning/ }));
    mark('scan');
    await apiResponse;
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Pick for us'));
      return btn && !btn.disabled;
    }, { timeout: 90000 });
    await pause(page, 900);
    mark('results');

    console.log('▶ Défilement de la liste des jeux communs');
    const list = page.locator('div.overflow-y-auto.space-y-3').first();
    await glideTo(page, list);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 220); await pause(page, 380); }
    await pause(page, 500);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -220); await pause(page, 260); }
    mark('browse');
    await pause(page, PACE.beat);

    console.log('▶ Pick for us');
    await moveAndClick(page, page.getByRole('button', { name: 'Pick for us' }));
    await pause(page, PACE.roulette);
    await page.mouse.move(80, VIEWPORT.height - 80, { steps: 16 });
    mark('pick');

    await pause(page, PACE.finalHold);
    mark('end');
    console.log('✅ Enregistrement terminé.');
  } catch (err) {
    console.error('❌ Erreur pendant la démo :', err.message);
    mark('end');
  }

  const video = page.video();
  const tmpPath = await video.path();
  await context.close();   // finalise le fichier vidéo
  await browser.close();

  const rawPath = join(OUT, 'raw.webm');
  try { rmSync(rawPath, { force: true }); } catch {}
  copyFileSync(tmpPath, rawPath);
  try { rmSync(tmpPath, { force: true }); } catch {}
  writeFileSync(join(OUT, 'timeline.json'), JSON.stringify(marks, null, 2));

  console.log(`\n📼 Vidéo brute : ${rawPath}`);
  console.log(`⏱  Marques     : ${join(OUT, 'timeline.json')}`);
}

run();

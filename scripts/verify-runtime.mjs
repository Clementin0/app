#!/usr/bin/env node
/**
 * End-to-end runtime check of the production build (dist/) in headless
 * Chromium, emulating a landscape phone with touch input.
 *
 * It plays the real game: menu -> play -> jumps -> death -> rewarded revive
 * -> death -> retry x3, and asserts that the score, the high score in
 * LocalStorage and every ad trigger (banner show/hide, rewarded, interstitial
 * every 3 completed games) fire without runtime errors. Ads run on the
 * built-in MockAdMob (?e2e=1 makes it fast and auto-closing).
 *
 * Usage: npm run build && npm run verify
 * Env:   CHROMIUM_PATH=/path/to/chrome   (optional)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'verify-output');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const candidates = [];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      candidates.push(join(pw, dir, 'chrome-linux', 'chrome'), join(pw, dir, 'chrome-linux64', 'chrome'));
    }
  }
  candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  return candidates.find((p) => existsSync(p));
}

function serve(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = normalize(join(dir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    if (url.pathname.endsWith('/')) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail });
  console.log(`${condition ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
  return !!condition;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/ not found: run `npm run build` first.');
    process.exit(1);
  }
  const executablePath = findChromium();
  if (!executablePath) {
    console.error('No Chromium found. Set CHROMIUM_PATH.');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  const server = await serve(DIST);
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  const H = '__NEON_DASH__';
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
  const stats = () => evaluate((h) => ({ ...window[h].services.ads.stats, completed: window[h].services.ads.completedGames }), H);
  const sceneActive = (key) => waitFor(([h, k]) => window[h]?.activeScenes().includes(k), [H, key]);
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

  /** Taps a Phaser button (dotted path from the scene, e.g. 'hud.pauseButton') at its on-screen position. */
  async function tapButton(sceneKey, path) {
    await waitFor(([h, s, p]) => p.split('.').reduce((o, k) => o?.[k], window[h].scene(s))?.enabled === true, [H, sceneKey, path]);
    const pos = await evaluate(
      ([h, s, p]) => {
        const g = window[h].game;
        const b = p.split('.').reduce((o, k) => o?.[k], window[h].scene(s)).getBounds();
        const rect = g.canvas.getBoundingClientRect();
        return { x: rect.left + b.centerX / g.scale.displayScale.x, y: rect.top + b.centerY / g.scale.displayScale.y };
      },
      [H, sceneKey, path],
    );
    await page.touchscreen.tap(pos.x, pos.y);
  }

  const forceDeath = () => evaluate((h) => window[h].scene('Game').world._die('verify'), H);

  try {
    await page.goto(`http://127.0.0.1:${port}/?e2e=1`);
    await waitFor((h) => window[h]?.ready === true, H, 15000);
    check('Game boots, textures generated', true);
    await sceneActive('Menu');
    check('Main menu shown', true);

    const renderer = await evaluate((h) => (window[h].game.renderer.type === 2 ? 'WebGL' : 'Canvas'), H);
    check('Renderer initialised', true, renderer);

    await waitFor((h) => window[h].services.ads.initialized, H);
    await waitFor(() => document.querySelector('.mock-banner')?.style.display === 'flex');
    check('Menu: banner ad shown', (await stats()).bannerShows >= 1);
    await page.waitForTimeout(600);
    await shot('01-menu');

    // ---------------------------------------------------- game 1 + revive
    await tapButton('Menu', 'playButton');
    await sceneActive('Game');
    // Keep the scripted run deterministic: obstacles cannot end it before the checks.
    await evaluate((h) => (window[h].scene('Game').world.player.invulnerable = 1e9), H);
    await waitFor(() => document.querySelector('.mock-banner')?.style.display === 'none');
    check('Gameplay: banner hidden', (await stats()).bannerHides >= 1);

    let maxHeight = 0;
    for (let i = 0; i < 6; i++) {
      await page.touchscreen.tap(600, 220);
      await page.waitForTimeout(120);
      maxHeight = Math.max(maxHeight, await evaluate((h) => { const w = window[h].scene('Game').world; return w.groundY - w.player.y; }, H));
      await page.waitForTimeout(250);
    }
    check('Tap input makes the player jump', maxHeight > 40, `max height ${Math.round(maxHeight)}px`);
    const score1 = await evaluate((h) => window[h].scene('Game').world.score.score, H);
    await page.waitForTimeout(800);
    const score2 = await evaluate((h) => window[h].scene('Game').world.score.score, H);
    check('Score increases while running', score2 > score1 && score1 >= 0, `${score1} -> ${score2}`);
    await shot('02-gameplay');

    // Pause / resume.
    await tapButton('Game', 'hud.pauseButton');
    await sceneActive('Pause');
    check('Pause button opens the pause menu', true);
    await shot('03-pause');
    await tapButton('Pause', 'resumeButton');
    await waitFor((h) => window[h].scene('Game').phase === 'running', H, 6000);
    check('Resume: countdown then running again', true);

    await forceDeath();
    await sceneActive('GameOver');
    await waitFor(() => document.querySelector('.mock-banner')?.style.display === 'flex');
    check('Game over: banner shown', true);
    const best = await evaluate(() => JSON.parse(localStorage.getItem('neondash.save.v1')).highScore);
    check('High score saved in LocalStorage', best > 0, `highScore=${best}`);
    await page.waitForTimeout(1300);
    await shot('04-gameover');

    await tapButton('GameOver', 'continueButton');
    await waitFor((h) => window[h].scene('Game').phase === 'running', H, 8000);
    const revived = await evaluate((h) => { const w = window[h].scene('Game').world; return { state: w.state, used: w.reviveUsed }; }, H);
    const s1 = await stats();
    check('Rewarded ad watched -> player revived', revived.state === 'running' && revived.used && s1.rewardsEarned === 1, JSON.stringify(revived));
    check('Interstitial not shown on revive', s1.interstitialShows === 0);

    await forceDeath();
    await sceneActive('GameOver');
    const hasContinue = await evaluate((h) => !!window[h].scene('GameOver').continueButton, H);
    check('Second chance only once per run', !hasContinue);

    // -------------------------------------- interstitial every 3 games
    await tapButton('GameOver', 'retryButton');
    await sceneActive('Game');
    let s = await stats();
    check('Completed game #1 -> no interstitial', s.completed === 1 && s.interstitialShows === 0);

    await page.waitForTimeout(400);
    await forceDeath();
    await sceneActive('GameOver');
    await tapButton('GameOver', 'retryButton');
    await sceneActive('Game');
    s = await stats();
    check('Completed game #2 -> no interstitial', s.completed === 2 && s.interstitialShows === 0);

    await page.waitForTimeout(400);
    await forceDeath();
    await sceneActive('GameOver');
    await tapButton('GameOver', 'menuButton');
    await sceneActive('Menu');
    s = await stats();
    check('Completed game #3 -> interstitial shown', s.completed === 3 && s.interstitialShows === 1, JSON.stringify(s));
    const played = await evaluate(() => JSON.parse(localStorage.getItem('neondash.save.v1')).gamesPlayed);
    check('Games played persisted', played === 3, `gamesPlayed=${played}`);

    // Longer unattended run: the world keeps spawning without errors.
    await tapButton('Menu', 'playButton');
    await sceneActive('Game');
    await evaluate((h) => (window[h].scene('Game').world.player.invulnerable = 1e9), H);
    // Headless software rendering is slow: wait on game time, not wall time.
    await waitFor((h) => window[h].scene('Game').world.spawner.history.length >= 3, H, 90000);
    const run = await evaluate((h) => { const w = window[h].scene('Game').world; return { state: w.state, patterns: w.spawner.history.length, entities: w.entities.length }; }, H);
    check('New run from the menu: obstacles keep spawning', run.state === 'running' && run.entities > 0, JSON.stringify(run));
    await shot('05-obstacles');
  } catch (err) {
    check('Unexpected failure', false, err.message.split('\n')[0]);
    await shot('99-failure').catch(() => {});
  }

  check('No runtime errors in the console', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: verify-output/`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

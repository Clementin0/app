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
  const consoleLog = [];
  let step = 'start';
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    consoleLog.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  const H = '__NEON_DASH__';
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
  const stats = () => evaluate((h) => ({ ...window[h].services.ads.stats, completed: window[h].services.ads.completedGames }), H);
  const sceneActive = (key, timeout) => {
    step = `wait for scene ${key}`;
    return waitFor(([h, k]) => window[h]?.activeScenes().includes(k), [H, key], timeout);
  };
  const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });

  /**
   * Taps a Phaser button (dotted path from the scene, e.g. 'hud.pauseButton').
   * Waits until it is enabled, fully faded in (Phaser ignores input on objects
   * whose container has alpha 0) and no longer moving, then taps its center.
   */
  async function tapButton(sceneKey, path) {
    step = `tap ${sceneKey}.${path}`;
    const locate = ([h, s, p]) => {
      const N = window[h];
      const btn = p.split('.').reduce((o, k) => o?.[k], N.scene(s));
      if (!btn || !btn.enabled || !btn.active) return null;
      let alpha = 1;
      for (let o = btn; o; o = o.parentContainer) alpha *= o.alpha;
      if (alpha < 0.98) return null;
      const g = N.game;
      const b = btn.getBounds();
      const rect = g.canvas.getBoundingClientRect();
      return { x: rect.left + b.centerX / g.scale.displayScale.x, y: rect.top + b.centerY / g.scale.displayScale.y };
    };
    let pos = null;
    for (let i = 0; i < 100; i++) {
      const a = await evaluate(locate, [H, sceneKey, path]);
      await page.waitForTimeout(80);
      const b = await evaluate(locate, [H, sceneKey, path]);
      if (a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) {
        pos = b;
        break;
      }
    }
    if (!pos) throw new Error(`button ${sceneKey}.${path} never became tappable`);
    await page.touchscreen.tap(pos.x, pos.y);
  }

  const forceDeath = () => {
    step = 'force death';
    return evaluate((h) => window[h].scene('Game').world._die('verify'), H);
  };
  /** Waits for a fresh run and makes it immune to obstacles, so only scripted deaths happen. */
  const newRun = async () => {
    await sceneActive('Game');
    await evaluate((h) => (window[h].scene('Game').world.player.invulnerable = 1e9), H);
  };

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
    // Keep the scripted run deterministic: obstacles cannot end it before the checks.
    await newRun();
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
    await newRun();
    let s = await stats();
    check('Completed game #1 -> no interstitial', s.completed === 1 && s.interstitialShows === 0);

    await page.waitForTimeout(400);
    await forceDeath();
    await sceneActive('GameOver');
    await tapButton('GameOver', 'retryButton');
    await newRun();
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

    // ------------------------------------------------ settings & i18n
    await tapButton('Menu', 'settingsButton');
    await sceneActive('Settings');
    await tapButton('Settings', 'toggles.vibration');
    await waitFor(() => JSON.parse(localStorage.getItem('neondash.save.v1')).vibration === false);
    check('Settings: vibration toggle saved', true);
    await tapButton('Settings', 'langButtons.en');
    await waitFor((h) => window[h].scene('Menu')?.playButton?.text.text === 'PLAY', H);
    check('Settings: language switched to English', true);
    await shot('06-settings-en');
    await tapButton('Settings', 'langButtons.it');
    await waitFor((h) => window[h].scene('Menu')?.playButton?.text.text === 'GIOCA', H);
    await tapButton('Settings', 'closeButton');
    step = 'settings closed';
    await waitFor((h) => !window[h].activeScenes().includes('Settings'), H);
    check('Settings: back to Italian and closed', true);

    // ------------------------------------------------------------- shop
    const rewardsBefore = (await stats()).rewardsEarned;
    await evaluate((h) => window[h].services.save.addCurrency(200, 0), H);
    await tapButton('Menu', 'shopButton');
    await sceneActive('Shop');
    const coinsBefore = await evaluate((h) => window[h].services.save.snapshot().totalCoins, H);
    await tapButton('Shop', 'cards.1');
    const bought = await evaluate((h) => window[h].services.save.snapshot(), H);
    check('Shop: skin bought with coins and equipped', bought.selectedSkin === 'bubblegum' && bought.totalCoins === coinsBefore - 150, `${coinsBefore} -> ${bought.totalCoins} coins`);
    await tapButton('Shop', 'freeButton');
    await waitFor(([h, n]) => window[h].services.ads.stats.rewardsEarned > n, [H, rewardsBefore], 15000);
    await waitFor(([h, c]) => window[h].services.save.snapshot().totalCoins === c + 50, [H, bought.totalCoins]);
    check('Shop: rewarded video grants +50 coins', true);
    await shot('07-shop');
    await tapButton('Shop', 'backButton');
    await sceneActive('Menu');

    // Longer unattended run: the world keeps spawning without errors.
    await tapButton('Menu', 'playButton');
    await newRun();
    step = 'long run';
    // Headless software rendering is slow: wait on game time, not wall time.
    await waitFor((h) => window[h].scene('Game').world.spawner.history.length >= 3, H, 90000);
    const run = await evaluate((h) => { const w = window[h].scene('Game').world; return { state: w.state, patterns: w.spawner.history.length, entities: w.entities.length }; }, H);
    check('New run from the menu: obstacles keep spawning', run.state === 'running' && run.entities > 0, JSON.stringify(run));
    const audio = await evaluate((h) => { const { sfx, music } = window[h].services; return { ctx: sfx.ctx?.state ?? 'none', scheduling: music.timer !== null, intensity: music.intensity }; }, H);
    check('Audio engine running with in-game music', audio.ctx === 'running' && audio.scheduling && audio.intensity === 1, JSON.stringify(audio));
    const skinKey = await evaluate((h) => window[h].scene('Game').view.player.texture.key, H);
    check('Bought skin used in game', skinKey === 'player_bubblegum', skinKey);
    await shot('05-obstacles');
  } catch (err) {
    check(`Unexpected failure during "${step}"`, false, err.message.split('\n')[0]);
    await shot('99-failure').catch(() => {});
    const state = await evaluate((h) => {
      const N = window[h];
      if (!N) return 'debug hook missing';
      const go = N.scene('GameOver');
      const game = N.scene('Game');
      return {
        activeScenes: N.activeScenes(),
        fps: Math.round(N.game.loop.actualFps),
        game: game?.world ? { phase: game.phase, state: game.world.state, reviveUsed: game.world.reviveUsed, time: +game.world.time.toFixed(2) } : null,
        gameOver: go?.sys.isActive() ? { busy: go.busy, panelAlpha: go.panel?.alpha, retry: go.retryButton?.enabled, cont: go.continueButton?.enabled ?? null } : null,
        ads: { ...N.services.ads.stats, completed: N.services.ads.completedGames, fullscreen: N.services.ads.isFullscreenShowing },
      };
    }, H).catch((e) => `state unavailable: ${e.message}`);
    console.log('--- diagnostics ---');
    console.log(JSON.stringify(state, null, 2));
    console.log(consoleLog.slice(-15).join('\n'));
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

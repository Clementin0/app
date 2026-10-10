#!/usr/bin/env node
/**
 * End-to-end runtime check of the production build (dist/) in headless
 * Chromium, emulating a landscape phone with touch input.
 *
 * It plays the real 3D game with touch gestures: menu -> play -> swipes
 * (lanes, jump, slide) -> tap / hold to shoot -> enemy kill -> boss fight ->
 * death -> rewarded revive -> death -> retry x3, then settings, shop and
 * upgrades. It asserts score, record in LocalStorage, missions, purchases and
 * every ad trigger (banner show/hide, rewarded, interstitial every 3
 * completed games) with no runtime errors. Ads run on the built-in MockAdMob
 * (?e2e=1 makes it fast and auto-closing).
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

  // Raw touch gestures through the DevTools protocol (Playwright has tap only).
  const cdp = await context.newCDPSession(page);
  const CX = 470;
  const CY = 250;
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  async function swipe(dx, dy) {
    step = `swipe ${dx},${dy}`;
    await touch('touchStart', [{ x: CX, y: CY, id: 1 }]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [{ x: CX + (dx * i) / 6, y: CY + (dy * i) / 6, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
  }
  /** Keeps a finger down (auto-fire) until `until` resolves. */
  async function holdFire(until) {
    await touch('touchStart', [{ x: CX, y: CY, id: 2 }]);
    try {
      await until();
    } finally {
      await touch('touchEnd', []);
    }
  }
  const world = (fn, arg) => evaluate(([h, src, a]) => new Function('w', 'a', `return (${src})(w, a)`)(window[h].scene('Game').world, a), [H, fn.toString(), arg]);
  const waitWorld = (fn, arg, timeout = 15000) =>
    waitFor(([h, src, a]) => { const w = window[h].scene('Game')?.world; return !!w && new Function('w', 'a', `return (${src})(w, a)`)(w, a); }, [H, fn.toString(), arg], timeout);
  const save = () => evaluate(() => JSON.parse(localStorage.getItem('neondash.save.v1')));

  const forceDeath = () => {
    step = 'force death';
    return world((w) => w._die('verify'));
  };
  /** Waits for a fresh run and makes it immune to damage, so only scripted deaths happen. */
  const newRun = async () => {
    await sceneActive('Game');
    await world((w) => (w.player.invulnerable = 1e9));
  };

  try {
    await page.goto(`http://127.0.0.1:${port}/?e2e=1`);
    await waitFor((h) => window[h]?.ready === true, H, 15000);
    check('Game boots, textures generated', true);
    await sceneActive('Menu');
    check('Main menu shown', true);

    const renderer = await evaluate((h) => ({ ui: window[h].game.renderer.type === 2 ? 'WebGL' : 'Canvas', three: !!window[h].services.stage?.renderer?.getContext() }), H);
    check('Renderers initialised (Phaser UI + Three.js 3D)', renderer.three, JSON.stringify(renderer));
    step = 'menu demo';
    await waitFor((h) => window[h].scene('Menu').demo.distance > 5, H, 15000);
    check('Menu: 3D demo run is playing', true);

    await waitFor((h) => window[h].services.ads.initialized, H);
    await waitFor(() => document.querySelector('.mock-banner')?.style.display === 'flex');
    check('Menu: banner ad shown', (await stats()).bannerShows >= 1);

    // Daily reward, offered on the first menu of the day.
    await sceneActive('Daily');
    await page.waitForTimeout(500);
    await shot('01-daily');
    const coinsDaily = await evaluate((h) => window[h].services.save.snapshot().totalCoins, H);
    await tapButton('Daily', 'claimButton');
    step = 'daily claimed';
    await waitFor((h) => !window[h].activeScenes().includes('Daily'), H, 8000);
    const daily = await save();
    check('Daily reward claimed once (+50 coins, day 1)', daily.totalCoins === coinsDaily + 50 && daily.daily.streak === 1, `coins ${coinsDaily} -> ${daily.totalCoins}`);
    // Deterministic missions for this check: one is completed by the first kill.
    await evaluate((h) => {
      const { save } = window[h].services;
      save.data.missions = {
        active: [
          { id: 'kills', progress: 0, target: 1, reward: { coins: 25, gems: 0 } },
          { id: 'jumps', progress: 0, target: 40, reward: { coins: 100, gems: 0 } },
          { id: 'metersRun', progress: 0, target: 900, reward: { coins: 200, gems: 0 } },
        ],
        completed: 0,
      };
      save.persist();
    }, H);
    await page.waitForTimeout(600);
    await shot('01-menu');

    // ---------------------------------------------------- game 1 + revive
    await tapButton('Menu', 'playButton');
    await newRun();
    await waitFor(() => document.querySelector('.mock-banner')?.style.display === 'none');
    check('Gameplay: banner hidden', (await stats()).bannerHides >= 1);
    // First run: the interactive tutorial stops time in front of each
    // obstacle until the right gesture is made.
    const hint = (id) => {
      step = `tutorial prompt ${id}`;
      return waitFor(([h, i]) => window[h].scene('Game').tutorial?.hint?.id === i, [H, id], 40000);
    };
    // Headless frames are slow: a jump can be over before the swipe returns,
    // so the peak height and the slide are sampled every frame in the page.
    await evaluate((h) => {
      const sc = window[h].scene('Game');
      const track = { maxY: 0, slid: false };
      sc.events.on('postupdate', () => {
        track.maxY = Math.max(track.maxY, sc.world.player.y);
        track.slid ||= sc.world.player.slide > 0;
      });
      window.__track = track;
    }, H);
    check('First run starts the tutorial', await world((w) => w.safe && w.spawnPaused));
    await hint('lane');
    step = 'tutorial freeze';
    await waitFor((h) => window[h].scene('Game').tutorial.timeScale === 0, H, 20000);
    const frozenAt = await world((w) => w.time);
    await page.waitForTimeout(600);
    check('Tutorial: time stops in front of the wall until the player moves', (await world((w) => w.time)) === frozenAt);
    await shot('02-tutorial');
    await swipe(-140, 0);
    await waitWorld((w) => w.player.lane === 0);
    check('Tutorial: swipe ← changes lane', true);
    await hint('jump');
    await swipe(0, -140);
    await waitFor(() => window.__track.maxY > 0.5);
    check('Tutorial: swipe ↑ jumps', true, `peak ${(await evaluate(() => window.__track.maxY)).toFixed(2)} m`);
    await hint('slide');
    await swipe(0, 140);
    await waitFor(() => window.__track.slid);
    check('Tutorial: swipe ↓ slides', (await world((w) => w.stats.slides)) >= 1);
    await hint('shoot');
    step = 'tutorial shoot';
    await holdFire(() => waitFor((h) => window[h].scene('Game').tutorial === null, H, 40000));
    const tut = await world((w) => ({ kills: w.stats.kills, safe: w.safe, spawning: !w.spawnPaused }));
    check('Tutorial: hold to shoot down the robot, then the real run starts', tut.kills === 1 && !tut.safe && tut.spawning && (await save()).tutorialDone, JSON.stringify(tut));

    step = 'one swipe, one lane';
    await swipe(140, 0);
    await page.waitForTimeout(300);
    check('A long swipe moves exactly one lane', (await world((w) => w.player.lane)) === 1);

    const shots0 = await world((w) => w.stats.shots);
    step = 'tap to shoot';
    await page.touchscreen.tap(CX, CY);
    await waitWorld((w, n) => w.stats.shots > n, shots0);
    check('Tap shoots', true);

    step = 'kill an enemy';
    await world((w) => w._addEntity({ type: 'walker', lane: w.player.lane, dz: 0 }, 32));
    await holdFire(() => waitWorld((w) => w.stats.kills >= 2, null, 20000));
    const kill = await world((w) => ({ kills: w.stats.kills, bonus: w.score.bonus }));
    check('Hold to auto-fire kills an enemy (bonus points)', kill.kills >= 2 && kill.bonus > 0, JSON.stringify(kill));

    const score1 = await world((w) => w.score.score);
    await page.waitForTimeout(800);
    const score2 = await world((w) => w.score.score);
    check('Score increases while running', score2 > score1 && score1 >= 0, `${score1} -> ${score2}`);
    await shot('02-gameplay');

    // Boss at the end of the zone.
    step = 'boss';
    await world((w) => (w.distance = w.zone.start + w.cfg.ZONES.bossAt));
    await waitWorld((w) => w.boss && w.boss.z < 40, null, 30000);
    const bossBar = await evaluate((h) => window[h].scene('Game').hud.bossLabel.visible, H);
    check('Boss appears at the end of the zone', true, `boss bar visible: ${bossBar}`);
    await page.waitForTimeout(500);
    await shot('03-boss');
    await world((w) => (w.boss.hp = 3));
    await holdFire(() => waitWorld((w) => w.zone.index === 1, null, 30000));
    const boss = await world((w) => ({ bosses: w.stats.bosses, coins: w.score.coins, gems: w.score.gems }));
    check('Boss defeated -> reward and next zone', boss.bosses === 1 && boss.coins >= 40 && boss.gems >= 3, JSON.stringify(boss));

    // Perk choice after the boss: the run waits for a card.
    await sceneActive('Perk', 20000);
    const offer = await evaluate((h) => window[h].scene('Perk').options, H);
    check('Perk choice offered after the boss (3 cards, game waiting)', offer.length === 3 && (await evaluate((h) => window[h].scene('Game').phase, H)) === 'perk', offer.join(','));
    await page.waitForTimeout(700);
    await shot('04-perks');
    await tapButton('Perk', 'cards.1');
    step = 'perk chosen';
    await waitFor((h) => window[h].scene('Game').phase === 'running', H, 10000);
    const perks = await world((w) => w.perks);
    check('Chosen perk applied, run resumes', perks[offer[1]] === 1, JSON.stringify(perks));
    await page.waitForTimeout(1200);
    await shot('04-zone2');

    // Pause / resume.
    await tapButton('Game', 'hud.pauseButton');
    await sceneActive('Pause');
    check('Pause button opens the pause menu', true);
    await shot('05-pause');
    await tapButton('Pause', 'resumeButton');
    await waitFor((h) => window[h].scene('Game').phase === 'running', H, 6000);
    check('Resume: countdown then running again', true);

    await forceDeath();
    await sceneActive('GameOver');
    await waitFor(() => document.querySelector('.mock-banner')?.style.display === 'flex');
    check('Game over: banner shown', true);
    let data = await save();
    check('High score saved in LocalStorage', data.highScore > 0, `highScore=${data.highScore}`);
    const jumps = data.missions.active.find((m) => m.id === 'jumps');
    check('Missions: progress saved, completed mission rewarded', data.missions.completed >= 1 && jumps?.progress >= 1 && data.totalCoins >= 25 + boss.coins, `completed=${data.missions.completed} jumps=${jumps?.progress} coins=${data.totalCoins}`);
    await page.waitForTimeout(1300);
    await shot('06-gameover');

    await tapButton('GameOver', 'continueButton');
    await waitFor((h) => window[h].scene('Game').phase === 'running', H, 8000);
    const revived = await world((w) => ({ state: w.state, used: w.reviveUsed, hp: w.player.hp }));
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
    data = await save();
    check('Lifetime kills and bosses saved', data.lifetime.kills >= 1 && data.lifetime.bosses === 1, JSON.stringify(data.lifetime));
    check('Player XP earned and saved', data.level > 1 || data.xp > 0, `level ${data.level}, xp ${data.xp}`);

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
    check('Games played persisted', (await save()).gamesPlayed === 3, `gamesPlayed=${(await save()).gamesPlayed}`);

    // ------------------------------------------------ settings & i18n
    await tapButton('Menu', 'settingsButton');
    await sceneActive('Settings');
    await tapButton('Settings', 'toggles.vibration');
    await waitFor(() => JSON.parse(localStorage.getItem('neondash.save.v1')).vibration === false);
    check('Settings: vibration toggle saved', true);
    await tapButton('Settings', 'qualityButtons.low');
    await waitFor((h) => window[h].services.stage.qualityName === 'low' && JSON.parse(localStorage.getItem('neondash.save.v1')).quality === 'low', H);
    await tapButton('Settings', 'qualityButtons.medium');
    await waitFor((h) => window[h].services.stage.qualityName === 'medium', H);
    check('Settings: 3D quality applied and saved', true);
    await tapButton('Settings', 'langButtons.en');
    await waitFor((h) => window[h].scene('Menu')?.playButton?.text.text === 'PLAY', H);
    check('Settings: language switched to English', true);
    await shot('07-settings-en');
    await tapButton('Settings', 'langButtons.it');
    await waitFor((h) => window[h].scene('Menu')?.playButton?.text.text === 'GIOCA', H);
    await tapButton('Settings', 'closeButton');
    step = 'settings closed';
    await waitFor((h) => !window[h].activeScenes().includes('Settings'), H);
    check('Settings: back to Italian and closed', true);

    // ------------------------------------------------------------- shop
    const rewardsBefore = (await stats()).rewardsEarned;
    await evaluate((h) => window[h].services.save.addCurrency(400, 0), H);
    await tapButton('Menu', 'shopButton');
    await sceneActive('Shop');
    const coinsBefore = await evaluate((h) => window[h].services.save.snapshot().totalCoins, H);
    await tapButton('Shop', 'cards.1');
    step = 'preview skin';
    await waitFor((h) => window[h].services.stage.view?.character?.userData.skin.id === 'bubblegum', H);
    check('Shop: tapping an item previews it on the 3D character', true);
    await tapButton('Shop', 'actionButton');
    let snap = await evaluate((h) => window[h].services.save.snapshot(), H);
    check('Shop: skin bought with coins and equipped', snap.equipped.skin === 'bubblegum' && snap.totalCoins === coinsBefore - 150, `${coinsBefore} -> ${snap.totalCoins} coins`);
    await tapButton('Shop', 'tabButtons.4');
    await tapButton('Shop', 'upgradeRows.0.button');
    snap = await evaluate((h) => window[h].services.save.snapshot(), H);
    check('Shop: weapon upgrade bought', snap.upgrades.damage === 1 && snap.totalCoins === coinsBefore - 300, `damage lv ${snap.upgrades.damage}, ${snap.totalCoins} coins`);
    await tapButton('Shop', 'tabButtons.0');
    await tapButton('Shop', 'freeButton');
    await waitFor(([h, n]) => window[h].services.ads.stats.rewardsEarned > n, [H, rewardsBefore], 15000);
    await waitFor(([h, c]) => window[h].services.save.snapshot().totalCoins === c + 50, [H, snap.totalCoins]);
    check('Shop: rewarded video grants +50 coins', true);
    await page.waitForTimeout(500);
    await shot('08-shop');
    await tapButton('Shop', 'backButton');
    await sceneActive('Menu');

    // ------------------------------------------------------------ modes
    await tapButton('Menu', 'modesButton');
    await sceneActive('Modes');
    await page.waitForTimeout(400);
    await shot('09-modes');
    await tapButton('Modes', 'dailyButton');
    await newRun();
    const run1 = await evaluate((h) => {
      const g = window[h].scene('Game');
      return { mode: g.mode, modifier: g.challenge?.modifier.id, applied: g.world.modifiers, label: g.hud.modeLabel.visible };
    }, H);
    check('Daily challenge: seeded run with today\'s modifier', run1.mode === 'daily' && !!run1.modifier && run1.label, JSON.stringify(run1));
    await page.waitForTimeout(1500);
    await forceDeath();
    await sceneActive('GameOver');
    const ch = (await save()).challenge;
    check('Daily challenge: best of the day saved', ch.day > 0 && ch.best > 0, JSON.stringify(ch));
    await tapButton('GameOver', 'menuButton');
    await sceneActive('Menu');
    await tapButton('Menu', 'modesButton');
    await sceneActive('Modes');
    await tapButton('Modes', 'bossRushButton');
    await newRun();
    step = 'boss rush';
    await waitWorld((w) => !!w.boss, null, 40000);
    const rush = await world((w) => ({ mode: w.mode, distance: Math.round(w.distance), obstacles: w.entities.filter((e) => e.kind === 'obstacle').length }));
    check('Boss rush: a boss right away, no obstacles', rush.mode === 'bossRush' && rush.distance < 200 && rush.obstacles === 0, JSON.stringify(rush));
    await page.waitForTimeout(800);
    await shot('10-bossrush');
    await forceDeath();
    await sceneActive('GameOver');
    await tapButton('GameOver', 'menuButton');
    await sceneActive('Menu');

    // Longer unattended run: the world keeps spawning without errors.
    await tapButton('Menu', 'playButton');
    await newRun();
    step = 'long run';
    // Headless software rendering is slow: wait on game time, not wall time.
    await waitFor((h) => window[h].scene('Game').world.spawner.history.length >= 4, H, 90000);
    const run = await world((w) => ({ state: w.state, patterns: w.spawner.history.length, entities: w.entities.length, damage: w.weaponStats.damage }));
    check('New run from the menu: rows keep spawning', run.state === 'running' && run.entities > 0, JSON.stringify(run));
    check('Damage upgrade applied to the weapon', run.damage > 1, `damage ${run.damage}`);
    const audio = await evaluate((h) => { const { sfx, music } = window[h].services; return { ctx: sfx.ctx?.state ?? 'none', scheduling: music.timer !== null, intensity: music.intensity }; }, H);
    check('Audio engine running with in-game music', audio.ctx === 'running' && audio.scheduling && audio.intensity === 1, JSON.stringify(audio));
    const skin = await evaluate((h) => window[h].scene('Game').view.character.userData.skin.id, H);
    check('Bought skin used in game', skin === 'bubblegum', skin);
    await shot('09-run');
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
        game: game?.world ? { phase: game.phase, state: game.world.state, reviveUsed: game.world.reviveUsed, time: +game.world.time.toFixed(2), lane: game.world.player.lane, zone: game.world.zone.index, boss: !!game.world.boss } : null,
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

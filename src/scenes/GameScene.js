import Phaser from 'phaser';
import { getLevel, starsFor } from '../config/campaign.js';
import { bossKind } from '../config/game3d.config.js';
import { zoneTheme } from '../config/zones.js';
import { loadoutFrom } from '../config/upgrades.js';
import { fmt, fmtMult, t } from '../i18n.js';
import { xpForRun } from '../logic/Progression.js';
import { createRng } from '../logic/rng.js';
import { LaneWorld } from '../logic3d/LaneWorld.js';
import { Missions } from '../logic3d/Missions.js';
import { Tutorial } from '../logic3d/Tutorial.js';
import { AutoQuality, lowerQuality } from '../services/AutoQuality.js';
import { dailyChallenge } from '../services/DailyChallenge.js';
import { MODE_RECORDS } from '../services/SaveData.js';
import { services } from '../services/services.js';
import { GameView } from '../three/GameView.js';
import { goalText } from './CampaignScene.js';
import { Hud } from '../ui/Hud.js';
import { bindLayout } from '../ui/layout.js';
import { COLORS } from '../ui/theme.js';

const SWIPE = 42; // game pixels
const EVENT_COLORS = { goldRush: 0xffd23f, meteors: 0xff6a00, ambush: 0xff3860, storm: 0x9fb4ff, lowGravity: 0xd6a8ff, traffic: 0xffd23f, blackout: 0xb07cff };
// Label, color and subtitle of each v6 mode on the HUD.
const MODE_INTROS = {
  assault: { label: 'modeAssault', color: COLORS.orange, sub: 'modeAssaultDesc' },
  chaos: { label: 'modeChaos', color: 0xb07cff, sub: 'modeChaosDesc' },
  parkour: { label: 'modeParkour', color: 0x39ffd2, sub: 'modeParkourDesc' },
  hardcore: { label: 'modeHardcore', color: COLORS.red, sub: 'oneHeart' },
};
const HOLD_TO_FIRE = 0.2; // seconds
const COUNTDOWN = 3;

const SFX_FOR_EVENT = {
  jump: 'jump',
  slide: 'slide',
  bump: 'bump',
  shoot: 'shoot',
  hit: 'hit',
  kill: 'explode',
  smash: 'explode',
  hurt: 'hurt',
  coin: 'coin',
  gem: 'gem',
  powerup: 'powerup',
  shieldBreak: 'shieldBreak',
  enemyShot: 'enemyShot',
  plasmaDestroyed: 'hit',
  death: 'death',
  bossSpawn: 'alarm',
  bossDefeated: 'newBest',
  bossDrop: 'enemyShot',
  bossSummon: 'alarm',
  eventStart: 'levelUp',
  meteorImpact: 'explode',
  chargerCharge: 'alarm',
  jetpack: 'powerup',
  heal: 'powerup',
  shieldRegen: 'powerup',
  explosion: 'explode',
  zone: 'levelUp',
  turbo: 'turbo',
  ramp: 'launch',
  rocket: 'rocket',
  bossShield: 'shield',
  overdrive: 'overdrive',
  overdriveReady: 'powerup',
  nearMiss: 'whoosh',
  sniperAim: 'lock',
  sniperShot: 'laser',
  fenceZap: 'hurt',
  guardShieldBreak: 'shieldBreak',
  carIncoming: 'horn',
  bossShieldDown: 'shieldBreak',
  bossEnraged: 'alarm',
  mutator: 'mutate',
  trick: 'trick',
  waveStart: 'wave',
};

/**
 * Gameplay: a LaneWorld rendered in 3D, controlled with swipes (lanes,
 * jump, slide) and taps (shoot, hold for auto-fire), with the Phaser HUD
 * on top. Handles pause, death, game over and the rewarded revive.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    // 'endless' (classic), 'daily' (seeded challenge), 'bossRush', 'timeAttack' or 'campaign'.
    this.mode = data?.mode ?? 'endless';
    this.levelId = this.mode === 'campaign' ? (data?.level ?? 1) : null;
    // Scene instances are reused: nothing may leak from the previous run.
    this.level = null;
    this.levelResult = null;
    this.hints = null;
    this.won = false;
    this.timeAttackRecord = false;
    this.modeRecord = false;
    this.countdownTimer = null;
    this.gestures = new Map();
    this.autoQuality = new AutoQuality();
    this.slowMo = 0;
    this.perkDelay = 0;
    this.popupPoint = { x: 0, y: 0, visible: false };
    this.levelsUp = [];
    this.challengeReward = null;
    this.challengeShown = false;
    this.bossRushRecord = false;
  }

  create() {
    const { save, ads, music, stage } = services;
    ads.hideBanner();
    this.cameras.main.fadeIn(250, 7, 2, 26);

    const snap = save.snapshot();
    this.phase = 'running';
    this.committed = { coins: 0, gems: 0, stats: {}, xp: 0 };
    this.completedMissions = [];

    // Mode setup: the daily challenge has a fixed seed and a twist.
    let rng = createRng(Date.now() >>> 0);
    let modifiers = {};
    let courseSeed = null;
    this.challenge = null;
    if (this.mode === 'daily') {
      this.challenge = dailyChallenge(Date.now());
      rng = createRng(this.challenge.seed);
      courseSeed = this.challenge.seed ^ 0x5bd1e995;
      modifiers = this.challenge.modifier.modifiers;
      this.startBest = save.challengeStatus().best;
    } else if (this.mode === 'bossRush') {
      this.startBest = snap.bossRushBest.score;
    } else if (this.mode === 'timeAttack') {
      this.startBest = snap.timeAttackBest.score;
    } else if (this.mode === 'campaign') {
      this.level = getLevel(this.levelId) ?? getLevel(1);
      this.levelId = this.level.id;
      this.startBest = 0;
    } else if (MODE_RECORDS.includes(this.mode)) {
      this.startBest = save.modeBest(this.mode).score;
    } else {
      this.startBest = save.highScore;
    }

    this.world = new LaneWorld({ rng, best: this.startBest, loadout: loadoutFrom(snap), mode: this.mode, modifiers, courseSeed, campaign: this.level ?? null });
    // Classic runs: a gate at the distance record.
    this.recordDistance = this.mode === 'endless' && snap.bestDistance >= 100 ? snap.bestDistance : 0;
    this.recordPassed = false;
    const record = this.recordDistance ? { distance: this.recordDistance, label: `${t('recordLine')} ${fmt(this.recordDistance)} m` } : null;
    this.view = stage.setView(new GameView(stage, this.world, { equipped: snap.equipped, record }));
    this.hud = new Hud(this, { onPause: () => this.pauseGame(), onSkipTutorial: () => this.tutorial?.finish(), onOverdrive: () => this.triggerOverdrive() });

    music.setZone(this.world.zone.index);
    music.start(1);
    music.setIntensity(1);
    music.duck(false);

    // First run: an interactive tutorial before the real thing.
    this.tutorial = snap.tutorialDone || this.mode !== 'endless' ? null : new Tutorial(this.world);
    this.hud.showSkip(!!this.tutorial);
    if (this.mode === 'daily') {
      this.hud.setModeLabel(`${t('modeDaily')} · ${t(`mod_${this.challenge.modifier.id}`)}`, COLORS.yellow);
      this.hud.showMessage(t('modeDaily'), COLORS.yellow, 1800, 52, t(`mod_${this.challenge.modifier.id}`));
    } else if (this.mode === 'bossRush') {
      this.hud.setModeLabel(t('modeBossRush'), COLORS.pink);
      this.hud.showMessage(t('modeBossRush'), COLORS.pink, 1500, 60);
    } else if (this.mode === 'timeAttack') {
      this.hud.setModeLabel(t('modeTimeAttack'), COLORS.green);
      this.hud.showMessage(t('modeTimeAttack'), COLORS.green, 1500, 60, t('modeTimeAttackDesc'));
    } else if (this.mode === 'campaign') {
      const twist = this.level.twist ? ` · ${t(`twist_${this.level.twist}`)}` : '';
      this.hud.setModeLabel(`${t('levelTitle', { n: this.level.id })}${twist}`, COLORS.cyan);
      this.hud.showMessage(t('levelTitle', { n: this.level.id }), zoneTheme(this.level.zone).line, 2000, 60, goalText(this.level));
    } else if (MODE_INTROS[this.mode]) {
      const intro = MODE_INTROS[this.mode];
      this.hud.setModeLabel(t(intro.label), intro.color);
      this.hud.showMessage(t(intro.label), intro.color, 1800, 60, t(intro.sub));
    } else if (!this.tutorial) this._showZoneTitle(0, 0);

    this._bindInput();
    const onResume = () => this._onResume();
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
    bindLayout(this, (w, h) => this.hud.layout(w, h));
  }

  // -------------------------------------------------------------- input

  _bindInput() {
    this.input.on('pointerdown', (pointer, over) => {
      if (over.length) return; // HUD button
      services.sfx.unlock();
      this.gestures.set(pointer.id, { x: pointer.x, y: pointer.y, start: this.time.now, swiped: false, holding: false, dir: null });
    });
    this.input.on('pointermove', (pointer) => {
      const g = this.gestures.get(pointer.id);
      if (g && this.phase === 'running') this._swipe(g, pointer.x, pointer.y);
    });
    const release = (pointer) => {
      const g = this.gestures.get(pointer.id);
      if (!g) return;
      this.gestures.delete(pointer.id);
      // A fast flick may deliver no move events at all: judge it on release.
      if (!g.swiped && !g.holding && this.phase === 'running' && !this._swipe(g, pointer.x, pointer.y)) this.world.fire();
      if (![...this.gestures.values()].some((x) => x.holding)) this.world.setFiring(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard;
    if (!kb) return;
    const on = (keys, fn) => keys.forEach((k) => kb.on(`keydown-${k}`, (e) => !e.repeat && this.phase === 'running' && fn()));
    on(['LEFT', 'A'], () => this.world.moveLeft());
    on(['RIGHT', 'D'], () => this.world.moveRight());
    on(['UP', 'W'], () => this.world.jump());
    on(['DOWN', 'S'], () => this.world.slide());
    for (const k of ['SPACE', 'J', 'K']) {
      kb.on(`keydown-${k}`, () => this.world.setFiring(true));
      kb.on(`keyup-${k}`, () => this.world.setFiring(false));
    }
    on(['E', 'SHIFT'], () => this.triggerOverdrive());
    kb.on('keydown-P', () => this.pauseGame());
    kb.on('keydown-ESC', () => this.pauseGame());
  }

  /**
   * Turns finger travel into a lane change / jump / slide. One touch can
   * chain different directions (e.g. left then up), but a long swipe in the
   * same direction counts once. Returns true if the travel was a swipe.
   */
  _swipe(g, x, y) {
    const dx = x - g.x;
    const dy = y - g.y;
    if (Math.hypot(dx, dy) < SWIPE) return false;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    g.x = x;
    g.y = y;
    g.swiped = true;
    if (dir === g.dir) return true;
    g.dir = dir;
    if (dir === 'left') this.world.moveLeft();
    else if (dir === 'right') this.world.moveRight();
    else if (dir === 'up') this.world.jump();
    else this.world.slide();
    return true;
  }

  _updateHolds() {
    if (this.phase !== 'running') return;
    for (const g of this.gestures.values()) {
      if (!g.swiped && !g.holding && (this.time.now - g.start) / 1000 > HOLD_TO_FIRE) {
        g.holding = true;
        this.world.setFiring(true);
      }
    }
  }

  triggerOverdrive() {
    if (this.phase !== 'running') return;
    this.world.activateOverdrive();
  }

  // ---------------------------------------------------------- lifecycle

  _freeze(frozen) {
    this.view.frozen = frozen;
    if (frozen) {
      this.world.setFiring(false);
      this.gestures.clear();
    }
  }

  pauseGame() {
    if (this.phase !== 'running' && this.phase !== 'countdown') return;
    this._cancelCountdown();
    this.phase = 'paused';
    this._freeze(true);
    services.music.duck(true);
    this.scene.launch('Pause');
    this.scene.pause();
  }

  _onResume() {
    if (this.phase === 'paused') {
      services.music.duck(false);
      this.startCountdown(COUNTDOWN);
    }
  }

  startCountdown(seconds) {
    this._cancelCountdown();
    this.phase = 'countdown';
    this._freeze(true);
    let n = seconds;
    const tick = () => {
      if (n > 0) {
        this.hud.showMessage(String(n), COLORS.yellow, 600, 110);
        services.sfx.play('tick');
        n -= 1;
      } else {
        this.hud.showMessage(t('go'), COLORS.cyan, 500, 90);
        services.sfx.play('go');
        this.phase = 'running';
        this._freeze(false);
        this._cancelCountdown();
      }
    };
    tick();
    this.countdownTimer = this.time.addEvent({ delay: 800, repeat: seconds, callback: tick });
  }

  _cancelCountdown() {
    this.countdownTimer?.remove(false);
    this.countdownTimer = null;
  }

  runStats() {
    const w = this.world;
    return {
      ...w.stats,
      coins: w.score.coins,
      gems: w.score.gems,
      meters: Math.floor(w.distance),
      score: w.score.score,
      bestCombo: w.combo.best,
      zone: w.zone.index,
    };
  }

  /** Persists record, currency, lifetime stats and missions (idempotent per amount). */
  commitProgress() {
    const { save } = services;
    const w = this.world;
    const summary = w.score.summary();
    summary.meters = Math.floor(w.distance);
    // Each mode keeps its own record; the classic high score stays "endless" only.
    if (this.mode === 'daily') {
      // Always submitted (the best of the day keeps rising); the reward is paid once.
      const reward = save.submitChallenge({ score: summary.score, bosses: w.stats.bosses, day: this.challenge.day });
      this.challengeReward ??= reward;
    } else if (this.mode === 'bossRush') this.bossRushRecord = save.submitBossRush({ bosses: w.stats.bosses, score: summary.score }) || this.bossRushRecord;
    else if (this.mode === 'timeAttack') this.timeAttackRecord = save.submitTimeAttack({ score: summary.score, meters: summary.meters }) || this.timeAttackRecord;
    else if (MODE_RECORDS.includes(this.mode)) this.modeRecord = save.submitModeBest(this.mode, { score: summary.score, waves: w.stats.waves, meters: summary.meters }) || this.modeRecord;
    else if (this.mode === 'campaign') {
      // Stars are saved once, when the level is won (a lost run only keeps coins and XP).
      if (this.won && !this.levelResult) {
        const stars = starsFor(this.level, { won: true, coins: summary.coins, hits: w.stats.hits, time: w.time });
        this.levelResult = { ...save.submitLevel(this.level.id, stars), earned: stars };
      }
    } else save.submitScore(summary.score, summary.meters);
    save.addCurrency(summary.coins - this.committed.coins, summary.gems - this.committed.gems);

    const stats = this.runStats();
    // XP for what this run added since the last commit (a revive commits twice).
    const xp = xpForRun(stats);
    const level = save.addXp(xp - this.committed.xp);
    this.levelsUp.push(...level.levelsUp);
    this.committed.xp = xp;
    const missions = new Missions(save.data.missions);
    const done = missions.applyRun(stats, this.committed.stats);
    for (const m of done) save.addCurrency(m.reward.coins, m.reward.gems);
    this.completedMissions.push(...done);
    save.persist();

    this.committed = { coins: summary.coins, gems: summary.gems, stats, xp };
    return summary;
  }

  /** Called once when the run is over for good (retry / menu). */
  finalizeRun() {
    const s = this.world.stats;
    services.save.addLifetime({ kills: s.kills, bosses: s.bosses });
  }

  /** Campaign goal reached: a short celebration, then the results. */
  _onLevelComplete() {
    const { sfx, haptics, music } = services;
    this.won = true;
    this.phase = 'dying';
    this.world.setFiring(false);
    sfx.play('newBest');
    haptics.success();
    music.setIntensity(1);
    this.hud.showMessage(t('levelComplete'), COLORS.green, 1400, 64);
    this.time.delayedCall(1300, () => this.showGameOver());
  }

  _onDeath() {
    this.phase = 'dying';
    this._freeze(false);
    this.world.setFiring(false);
    this.hud.showPrompt(null);
    this.time.delayedCall(1100, () => this.showGameOver());
  }

  showGameOver() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.hud.clearMessage();
    this._freeze(true);
    services.music.duck(true);
    const summary = this.commitProgress();
    const s = services.save.snapshot();
    const bestByMode = { endless: summary.best, bossRush: s.bossRushBest.score, timeAttack: s.timeAttackBest.score, campaign: summary.score };
    for (const m of MODE_RECORDS) bestByMode[m] = s.modeBests[m].score;
    this.scene.launch('GameOver', {
      ...summary,
      best: bestByMode[this.mode] ?? Math.max(summary.score, this.startBest),
      // Boss rush records go by bosses beaten first (as saved), then score.
      isNewBest:
        this.mode === 'bossRush'
          ? this.bossRushRecord
          : this.mode === 'timeAttack'
            ? this.timeAttackRecord
            : MODE_RECORDS.includes(this.mode)
              ? this.modeRecord
              : this.mode === 'campaign'
                ? false
                : summary.score > this.startBest && summary.score > 0,
      waves: this.world.stats.waves,
      mutations: this.world.stats.mutations,
      tricks: this.world.stats.tricks,
      campaign: this.mode === 'campaign' ? { level: this.level.id, won: this.won, result: this.levelResult, hasNext: !!getLevel(this.level.id + 1), goal: goalText(this.level), progress: this.world.goalProgress, target: this.level.goal.value } : null,
      timeUp: this.world.deathCause === 'time',
      previousBest: this.startBest,
      mode: this.mode,
      bosses: this.world.stats.bosses,
      xp: this.committed.xp,
      level: s.level,
      levelXp: s.xp,
      levelsUp: this.levelsUp.splice(0),
      challengeReward: this.challengeReward && !this.challengeShown ? this.challengeReward : null,
      canRevive: !this.won && this.world.canRevive,
      kills: this.world.stats.kills,
      zone: this.world.zone.index + 1,
      missions: this.completedMissions.splice(0),
    });
    this.challengeShown = !!this.challengeReward;
    this.scene.pause();
  }

  // -------------------------------------------------------------- perks

  _offerPerks() {
    const w = this.world;
    if (!w.perkOffer) return;
    this.phase = 'perk';
    this._freeze(true);
    this.hud.clearMessage();
    this.scene.launch('Perk', { options: [...w.perkOffer], levels: { ...w.perks } });
    this.scene.pause();
  }

  /** Called by the perk scene with the chosen card. */
  choosePerk(id) {
    if (this.phase !== 'perk') return;
    this.world.choosePerk(id);
    this.scene.resume();
    this.hud.update(this.world.hud());
    this.startCountdown(2);
  }

  /** Called by the Game Over scene after a rewarded ad granted the reward. */
  reviveFromAd() {
    if (!this.world.revive()) return false;
    this.scene.resume();
    this.view.handleEvents(this.world.drainEvents());
    services.sfx.play('revive');
    services.music.duck(false);
    services.haptics.success();
    this.startCountdown(COUNTDOWN);
    return true;
  }

  handleBack() {
    this.pauseGame();
  }

  // --------------------------------------------------------------- loop

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this._updateHolds();
    if (this.phase === 'running') {
      let scale = this.tutorial ? this.tutorial.update(dt) : 1;
      // Brief slow motion for dramatic moments (boss down).
      if (this.slowMo > 0) {
        this.slowMo = Math.max(0, this.slowMo - dt);
        scale *= 0.35;
      }
      this.world.step(dt * scale);
      this._adaptQuality(delta / 1000);
    }

    const events = this.view.handleEvents(this.world.drainEvents());
    for (const e of events) {
      this.tutorial?.onEvent(e);
      this._onWorldEvent(e);
    }
    if (this.tutorial) this._updateTutorial();
    // After a boss: let the explosion play, then ask for a perk.
    if (this.world.perkOffer && this.phase === 'running') {
      this.perkDelay -= delta / 1000; // real time, whatever the frame rate
      if (this.perkDelay <= 0) this._offerPerks();
    }
    this._hintThreats(delta / 1000);
    if (this.recordDistance && !this.recordPassed && this.world.distance >= this.recordDistance && this.world.state === 'running') {
      this.recordPassed = true;
      services.sfx.play('newBest');
      services.haptics.success();
      this.view.passRecord();
      this.hud.showMessage(t('recordPassed'), COLORS.yellow, 1500, 54);
    }
    this.hud.update(this.world.hud());
  }

  /** First fence / guard of the run coming up: say how to deal with it. */
  _hintThreats(dt) {
    this.hintScan = (this.hintScan ?? 0) - dt;
    if (this.hintScan > 0 || this.phase !== 'running') return;
    this.hintScan = 0.4;
    for (const type of ['fence', 'guard']) {
      if (this.hints?.has(type)) continue;
      if (this.world.entities.some((e) => e.type === type && !e.dead && e.z < 45)) this._hintOnce(type);
    }
  }

  /** The first time an attack shows up in a run, a short hint on how to dodge it. */
  _hintOnce(kind) {
    this.hints ??= new Set();
    if (this.hints.has(kind)) return;
    this.hints.add(kind);
    this.hud.showMessage(t(`hint_${kind}`), kind === 'quake' ? COLORS.orange : 0xff3860, 1300, 40);
  }

  _showZoneTitle(index, delay) {
    const theme = zoneTheme(index);
    this.time.delayedCall(delay, () => this.hud.showMessage(t('zone', { n: index + 1 }), theme.line, 1500, 56, t(theme.nameKey)));
  }

  _updateTutorial() {
    const tut = this.tutorial;
    const { sfx, haptics } = services;
    for (const e of tut.drainEvents()) {
      if (e.type === 'tutorialStep') {
        sfx.play('powerup');
        haptics.light();
        this.hud.showMessage(t('tutNice'), COLORS.green, 500, 54);
      } else if (e.type === 'tutorialRetry') {
        this.hud.showMessage(t('tutRetry'), COLORS.yellow, 1800, 34);
      } else if (e.type === 'tutorialDone') {
        sfx.play('newBest');
        this.hud.showMessage(t('tutDone'), COLORS.cyan, 1300, 50);
      }
    }
    this.hud.showPrompt(tut.hint);
    if (tut.finished) {
      this.tutorial = null;
      services.save.completeTutorial();
      this.hud.showPrompt(null);
      this.hud.showSkip(false);
      this._showZoneTitle(0, 600);
    }
  }

  /** Steps the graphics down when the device can't keep a smooth frame rate. */
  _adaptQuality(frameTime) {
    const { save, stage } = services;
    if (!save.data.qualityAuto || !this.autoQuality.sample(frameTime)) return;
    const lower = lowerQuality(stage.qualityName);
    if (!lower) return;
    stage.setQuality(lower);
    save.setAutoQuality(lower);
  }

  _onWorldEvent(e) {
    const { sfx, haptics, music } = services;
    const sound = SFX_FOR_EVENT[e.type];
    if (sound) sfx.play(sound);
    switch (e.type) {
      case 'kill': {
        haptics.light();
        const pt = this.view.screenPoint(e.x, e.y + 0.6, e.z, this.popupPoint);
        if (pt.visible) this.hud.popup(pt.x, pt.y, e.combo >= 2 ? `+${e.points} ×${e.combo}` : `+${e.points}`, e.combo >= 2 ? '#ffb347' : '#ffd23f', e.combo >= 2 ? 34 : 28);
        break;
      }
      case 'smash':
        haptics.medium();
        if (e.turbo) {
          const pt = this.view.screenPoint(e.x, e.y + 0.6, e.z, this.popupPoint);
          if (pt.visible) this.hud.popup(pt.x, pt.y, `+${e.points}`, '#7ff3ff', 28);
        }
        break;
      case 'hurt':
      case 'shieldBreak':
        haptics.medium();
        break;
      case 'coin':
        this.hud.bump(this.hud.coinIcon);
        break;
      case 'gem':
        this.hud.bump(this.hud.gemIcon);
        break;
      case 'powerup':
        haptics.light();
        // A clock shows its "+4s" by the timer instead.
        if (e.kind !== 'clock') this.hud.showMessage(t(e.kind), COLORS.green, 800, 46);
        break;
      case 'bossSpawn':
        music.setIntensity(2);
        haptics.heavy();
        this.hud.showMessage(t('bossIncoming'), COLORS.pink, 1800, 60, t(bossKind(e.zone).nameKey));
        break;
      case 'bossDefeated':
        this.slowMo = 0.9;
        music.setIntensity(1);
        haptics.success();
        this.hud.showMessage(t('bossDefeated'), COLORS.green, 1600, 60, `+${e.coins}  +${e.gems}`);
        break;
      case 'perkOffer':
        this.perkDelay = 1.4;
        break;
      case 'perk':
        this.hud.showMessage(t(`perk_${e.id}`), COLORS.yellow, 1100, 46, t(`perkDesc_${e.id}`));
        break;
      case 'eventStart':
        haptics.medium();
        // In chaos the mutation card already announced it.
        if (this.world.mutator?.event) break;
        this.hud.showMessage(t(`event_${e.event}`), EVENT_COLORS[e.event] ?? COLORS.yellow, 1800, 54, t(`eventDesc_${e.event}`));
        break;
      case 'waveStart':
        haptics.medium();
        if (e.boss) this.hud.showMessage(t('waveBoss', { n: e.wave }), COLORS.pink, 1500, 56);
        else this.hud.showMessage(t('wave', { n: e.wave }), COLORS.orange, 1400, 60, t('waveEnemies', { n: e.enemies }));
        break;
      case 'waveClear':
        if (e.boss) break; // the boss has its own celebration
        sfx.play(e.perfect ? 'newBest' : 'powerup');
        haptics.success();
        this.hud.showMessage(t('waveClear'), COLORS.green, 1300, 50, e.points ? t('wavePerfect', { n: e.points }) : `+${e.coins}`);
        break;
      case 'mutator':
        haptics.heavy();
        this.cameras.main.shake(180, 0.004);
        this.hud.mutatorCard(t(`mut_${e.id}`), t(`mutDesc_${e.id}`));
        break;
      case 'mutatorEnd':
        this.hud.popup(0.5, 0.3, t('chaosMult', { n: fmtMult(e.mult) }), '#d6a8ff', 34);
        break;
      case 'trick': {
        const p = this.world.player;
        const pt = this.view.screenPoint(p.x, p.y + 2.2, 0.5, this.popupPoint);
        if (pt.visible) this.hud.popup(pt.x, pt.y, `${t(`trick_${e.kind}`)} +${e.points}`, '#7dffd2', 24);
        break;
      }
      case 'eventEnd':
        if (e.event === 'ambush') {
          if (e.success) {
            sfx.play('newBest');
            this.hud.showMessage(t('eventWon'), COLORS.green, 1500, 50, `+${e.reward}`);
          } else this.hud.showMessage(t('eventLost'), COLORS.purple, 1200, 40);
        }
        break;
      case 'jetpack':
        haptics.medium();
        this.hud.showMessage(t('jetpack'), COLORS.cyan, 900, 50);
        break;
      case 'turbo':
        haptics.medium();
        this.hud.showMessage(t('turbo'), COLORS.cyan, 800, 58);
        break;
      case 'overdrive':
        haptics.heavy();
        this.hud.showMessage(t('overdrive'), 0xff8ef0, 900, 60, t('overdriveDesc'));
        music.setIntensity(2);
        break;
      case 'overdriveEnd':
        music.setIntensity(this.world.boss ? 2 : 1);
        break;
      case 'overdriveReady':
        haptics.light();
        this.hud.showMessage(t('overdriveReady'), COLORS.yellow, 800, 36);
        break;
      case 'nearMiss': {
        const pt = this.view.screenPoint(e.x, e.y + 0.8, Math.max(0.5, e.z + 2), this.popupPoint);
        if (pt.visible) this.hud.popup(pt.x, pt.y, `${t('nearMiss')} +${e.points}`, '#7ff3ff', 26);
        break;
      }
      case 'guardShieldBreak':
        haptics.light();
        break;
      case 'sniperAim':
        this._hintOnce('sniper');
        break;
      case 'ramp':
        haptics.light();
        break;
      case 'meteorImpact':
        if (e.hit) haptics.medium();
        break;
      case 'bossShield':
        haptics.medium();
        this.hud.showMessage(t('bossShield'), 0x7ff3ff, 1100, 50, t('bossShieldDesc'));
        break;
      case 'bossEnraged':
        haptics.heavy();
        this.hud.showMessage(t('bossEnraged'), 0xff1f3d, 1300, 54, t('bossEnragedDesc'));
        break;
      case 'bossWave':
        sfx.play(e.kind === 'quake' ? 'quake' : 'laser');
        this._hintOnce(e.kind);
        break;
      case 'enemyShot':
        if (e.heavy) this._hintOnce('heavy');
        break;
      case 'bossFled':
        music.setIntensity(1);
        this.hud.showMessage(t('bossFled'), COLORS.purple, 1300, 46);
        break;
      case 'zone':
        music.setZone(e.index);
        this.cameras.main.flash(400, 255, 255, 255);
        this._showZoneTitle(e.index, 1700);
        break;
      case 'newBest':
        if (this.mode === 'bossRush') break; // that record goes by bosses beaten
        sfx.play('newBest');
        this.hud.showMessage(t('newRecord'), COLORS.green, 1200, 54);
        break;
      case 'death':
        haptics.heavy();
        if (e.cause === 'time') this.hud.showMessage(t('timeUp'), COLORS.red, 1100, 64);
        if (e.cause === 'bossFled') this.hud.showMessage(t('bossFled'), COLORS.purple, 1100, 50);
        this._onDeath();
        break;
      case 'levelComplete':
        this._onLevelComplete();
        break;
      case 'timeBonus':
        this.hud.timeBonus(e.seconds);
        break;
      default:
        break;
    }
  }
}

import { SCORING, WORLD } from '../config/game.config.js';

/**
 * Score of a single run: distance (meters) + coin and gem bonuses.
 * The high score itself is persisted by SaveData; this class only compares.
 */
export class ScoreManager {
  constructor({ scoring = SCORING, pixelsPerMeter = WORLD.pixelsPerMeter, best = 0 } = {}) {
    this.scoring = scoring;
    this.pixelsPerMeter = pixelsPerMeter;
    this.best = Math.max(0, Math.floor(best) || 0);
    this.reset();
  }

  reset() {
    this.distancePx = 0;
    this.coins = 0;
    this.gems = 0;
    this.passedBest = false;
  }

  addDistance(px) {
    if (px > 0 && Number.isFinite(px)) this.distancePx += px;
  }

  addCoin(n = 1) {
    this.coins += n;
  }

  addGem(n = 1) {
    this.gems += n;
  }

  get meters() {
    return Math.floor(this.distancePx / this.pixelsPerMeter);
  }

  get score() {
    const s = this.scoring;
    return this.meters * s.pointsPerMeter + this.coins * s.coinValue + this.gems * s.gemValue;
  }

  /** Returns true exactly once: the frame the current score beats the previous best. */
  checkPassedBest() {
    if (this.passedBest || this.best <= 0) return false;
    if (this.score > this.best) {
      this.passedBest = true;
      return true;
    }
    return false;
  }

  summary() {
    const score = this.score;
    const isNewBest = score > this.best;
    return {
      score,
      best: Math.max(score, this.best),
      previousBest: this.best,
      isNewBest,
      meters: this.meters,
      coins: this.coins,
      gems: this.gems,
    };
  }
}

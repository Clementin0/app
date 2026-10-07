import { describe, expect, it } from 'vitest';
import { createRng } from '../src/logic/rng.js';
import { LaneWorld } from '../src/logic3d/LaneWorld.js';
import { Tutorial, TUTORIAL_STEPS } from '../src/logic3d/Tutorial.js';

const DT = 1 / 60;

/** Runs the tutorial loop like GameScene does; `act(step, world)` plays the gesture. */
function play(act, { maxSeconds = 120 } = {}) {
  const w = new LaneWorld({ rng: createRng(5) });
  const tut = new Tutorial(w);
  const prompts = [];
  for (let t = 0; t < maxSeconds && !tut.finished; t += DT) {
    const scale = tut.update(DT);
    w.step(DT * scale);
    for (const e of w.drainEvents()) tut.onEvent(e);
    const hint = tut.hint;
    if (hint && prompts.at(-1) !== hint.id) prompts.push(hint.id);
    if (hint) act(hint, w, tut);
  }
  return { w, tut, prompts };
}

const correct = (step, w) => {
  if (step.id === 'lane') w.moveLeft();
  else if (step.id === 'jump') w.jump();
  else if (step.id === 'slide') w.slide();
  else w.setFiring(true);
};

describe('Tutorial', () => {
  it('walks through lane change, jump, slide and shooting, then resumes normal play', () => {
    const { w, tut, prompts } = play(correct);
    expect(tut.finished).toBe(true);
    expect(prompts).toEqual(TUTORIAL_STEPS.map((s) => s.id));
    expect(w.state).toBe('running');
    expect(w.stats.kills).toBe(1);
    expect(w.safe).toBe(false);
    expect(w.spawnPaused).toBe(false);
    expect(w.zoneProgress).toBeLessThan(1); // the first zone starts after the tutorial
    // Random rows come back after the tutorial.
    w.setFiring(false);
    for (let i = 0; i < 300; i++) w.step(DT);
    expect(w.spawner.history.length).toBeGreaterThan(0);
  });

  it('stops time and waits as long as the player does nothing', () => {
    const w = new LaneWorld({ rng: createRng(5) });
    const tut = new Tutorial(w);
    let frozenFor = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const scale = tut.update(DT);
      w.step(DT * scale);
      for (const e of w.drainEvents()) tut.onEvent(e);
      if (scale === 0) frozenFor += DT;
    }
    expect(tut.step.id).toBe('lane');
    expect(tut.hint?.id).toBe('lane');
    expect(frozenFor).toBeGreaterThan(50);
    expect(w.state).toBe('running');
  });

  it('accepts a slam when the player jumped first on the slide step', () => {
    const { tut } = play((step, w) => {
      if (step.id === 'slide') {
        w.jump(); // wrong gesture while time is stopped...
        w.slide(); // ...then the right one
      } else correct(step, w);
    });
    expect(tut.finished).toBe(true);
  });

  it('cannot hurt the player, and repeats the robot until it is shot down', () => {
    let taps = 0;
    const { w, tut } = play((step, world) => {
      if (step.id !== 'shoot') return correct(step, world);
      // First robot: a single tap is not enough, it reaches the player.
      if (taps++ === 0) world.fire();
      else if (taps > 30) world.setFiring(true);
    });
    expect(tut.finished).toBe(true);
    expect(w.player.hp).toBe(w.maxHp);
    expect(w.stats.kills).toBe(1);
  });

  it('can be skipped at any time', () => {
    const w = new LaneWorld({ rng: createRng(5) });
    const tut = new Tutorial(w);
    for (let i = 0; i < 200; i++) w.step(DT * tut.update(DT));
    tut.finish();
    expect(tut.finished).toBe(true);
    expect(tut.update(DT)).toBe(1);
    expect(w.safe).toBe(false);
    expect(w.spawnPaused).toBe(false);
  });
});

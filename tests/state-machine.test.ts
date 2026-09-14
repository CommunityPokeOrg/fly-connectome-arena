import { describe, expect, it } from 'vitest';
import { ArenaStateMachine } from '../src/game/state-machine.ts';

const tallies = { score: 1200, waves: 5, kills: 18, survival: 92.5 };

function complete(machine: ArenaStateMachine): void {
  machine.start();
  machine.beginVictory(tallies, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  for (let index = 0; index < 24; index += 1) machine.update(0.25);
}

describe('arena victory state machine', () => {
  it('walks playing → spectate → elimination → victory', () => {
    const states: string[] = [];
    const machine = new ArenaStateMachine({ onState: (state) => states.push(state) });
    complete(machine);
    expect(states).toEqual(['playing', 'spectate', 'elimination', 'victory']);
    expect(machine.state).toBe('victory');
    expect(machine.tallies).toEqual(tallies);
  });

  it('skip resolves all eliminations with identical final tallies', () => {
    const timed = new ArenaStateMachine();
    complete(timed);
    const skippedTargets: string[] = [];
    const skipped = new ArenaStateMachine({
      eliminate: (target) => skippedTargets.push(target.id),
    });
    skipped.start();
    skipped.beginVictory(tallies, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    skipped.skip();
    expect(skipped.state).toBe('victory');
    expect(skipped.eliminated).toBe(3);
    expect(skipped.tallies).toEqual(timed.tallies);
    expect(skippedTargets).toEqual(['a', 'b', 'c']);
  });

  it('shows a last-survivor beat when no enemies remain', () => {
    const machine = new ArenaStateMachine();
    machine.start();
    machine.beginVictory(tallies, []);
    expect(machine.state).toBe('spectate');
    machine.update(1.5);
    expect(machine.state).toBe('elimination');
    expect(machine.caption).toBe('LAST SURVIVOR');
    machine.update(2.01);
    expect(machine.state).toBe('victory');
  });

  it('cannot transition to gameover during the victory sequence', () => {
    const machine = new ArenaStateMachine();
    machine.start();
    machine.beginVictory(tallies, [{ id: 'a' }]);
    machine.gameover();
    expect(machine.state).toBe('spectate');
    machine.skip();
    expect(machine.state).toBe('victory');
  });
});

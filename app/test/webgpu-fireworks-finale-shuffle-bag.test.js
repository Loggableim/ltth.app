const { FinaleShuffleBag } = require('../plugins/webgpu-fireworks/lib/finale-shuffle-bag');

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('FinaleShuffleBag', () => {
  test('draws every current style exactly once in deterministic shuffled rounds', () => {
    const bag = new FinaleShuffleBag(
      () => ['alpha', 'beta', 'gamma'],
      sequenceRandom([0, 0])
    );

    expect([bag.draw(), bag.draw(), bag.draw()]).toEqual(['beta', 'gamma', 'alpha']);
    expect([bag.draw(), bag.draw(), bag.draw()]).toEqual(['beta', 'gamma', 'alpha']);
  });

  test('does not repeat across a bag boundary when another style is available', () => {
    const bag = new FinaleShuffleBag(
      () => ['alpha', 'beta', 'gamma'],
      sequenceRandom([0, 0, 0.999999, 0.999999])
    );

    expect([bag.draw(), bag.draw(), bag.draw(), bag.draw()])
      .toEqual(['beta', 'gamma', 'alpha', 'beta']);
  });

  test('sanitizes provider values to unique non-empty string IDs', () => {
    const bag = new FinaleShuffleBag(
      () => ['', ' alpha ', 'alpha', null, undefined, 42, 'beta', '  '],
      () => 0.999999
    );

    expect([bag.draw(), bag.draw()]).toEqual(['alpha', 'beta']);
  });

  test('allows a one-member provider to repeat and returns null for no members', () => {
    let members = ['solo'];
    const bag = new FinaleShuffleBag(() => members, () => 0.5);

    expect([bag.draw(), bag.draw()]).toEqual(['solo', 'solo']);
    members = [];
    expect(bag.draw()).toBeNull();
  });

  test('rebuilds immediately from exact membership when styles are added or removed', () => {
    let members = ['alpha', 'beta', 'gamma'];
    const bag = new FinaleShuffleBag(() => members, () => 0.999999);

    expect(bag.draw()).toBe('alpha');
    members = ['beta', 'gamma', 'delta'];

    expect([bag.draw(), bag.draw(), bag.draw()]).toEqual(['beta', 'delta', 'gamma']);
    expect([bag.draw(), bag.draw(), bag.draw()]).not.toContain('alpha');
  });

  test('avoids repeating the last draw when a membership refresh keeps that style eligible', () => {
    let members = ['alpha', 'beta', 'gamma'];
    const bag = new FinaleShuffleBag(() => members, () => 0.999999);

    expect(bag.draw()).toBe('alpha');
    members = ['alpha', 'beta', 'delta'];

    const refreshedRound = [bag.draw(), bag.draw(), bag.draw()];
    expect(refreshedRound[0]).toBe('beta');
    expect(new Set(refreshedRound)).toEqual(new Set(members));
  });

  test('does not rebuild a round when provider ordering changes without membership changes', () => {
    let members = ['alpha', 'beta', 'gamma'];
    const bag = new FinaleShuffleBag(() => members, () => 0.999999);

    expect(bag.draw()).toBe('alpha');
    members = ['gamma', 'alpha', 'beta'];
    expect([bag.draw(), bag.draw()]).toEqual(['beta', 'gamma']);
  });

  test('keeps bag state runtime-local to each new instance', () => {
    const provider = () => ['alpha', 'beta', 'gamma'];
    const first = new FinaleShuffleBag(provider, () => 0.999999);

    expect([first.draw(), first.draw()]).toEqual(['alpha', 'beta']);

    const restarted = new FinaleShuffleBag(provider, () => 0.999999);
    expect(restarted.draw()).toBe('alpha');
    expect(first.draw()).toBe('gamma');
  });
});

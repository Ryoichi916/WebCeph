import expect from 'expect';

import { ANB } from './skeletal';

it('ANB interpretation', () => {
  const [class1] = ANB.interpret!(3, 0, 4, 2);
  expect(class1.category).toBe('skeletalPattern');
  expect(class1.indication).toBe('class1');

  const [class2] = ANB.interpret!(5, 0, 4, 2);
  expect(class2.category).toBe('skeletalPattern');
  expect(class2.indication).toBe('class2');

  /**
   * An ANB of 1° sits *inside* a declared 0–4 band, so it reads Class I.
   * This case previously expected 'tendency_for_class3', which the
   * interpretation deliberately no longer produces: the old code returned a
   * tendency for any `0 < value < 2` whatever the declared norm, so Steiner's
   * 2.0 ± 2.0 graded a reading a quarter of a standard deviation below his own
   * mean as a Class III tendency while Downs and Wits called the same film
   * Class I. Steiner's tendency language belongs to his "acceptable
   * compromises" treatment target, not to a reading of this angle.
   */
  const [insideBand] = ANB.interpret!(1, 0, 4, 2);
  expect(insideBand.category).toBe('skeletalPattern');
  expect(insideBand.indication).toBe('class1');

  const [class3] = ANB.interpret!(-2, 0, 4, 2);
  expect(class3.category).toBe('skeletalPattern');
  expect(class3.indication).toBe('class3');
});

/**
 * A declared lower bound of exactly 0 must survive into the classification.
 * The fallback used to read `min || 2`, and Steiner's declared `min: 0` is
 * falsy — so the band applied was 2–4 while the table printed 0–4, and an ANB
 * of 0.0° was graded Class III by a band nobody could see.
 */
it('ANB respects a declared lower bound of zero', () => {
  const [atLowerBound] = ANB.interpret!(0, 0, 4, 2);
  expect(atLowerBound.indication).toBe('class1');
  expect(atLowerBound.min).toBe(0);
  expect(atLowerBound.max).toBe(4);

  // and the band it reports is the band it classified against
  const [below] = ANB.interpret!(-0.5, 0, 4, 2);
  expect(below.indication).toBe('class3');
});

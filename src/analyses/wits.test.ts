import expect from 'expect';

import wits from './wits';
import { witsAppraisal } from 'analyses/landmarks/distances/skeletal';

/**
 * wits.ts's `patientNote` branches on the patient's recorded sex (Jacobson
 * published separate male/female means) and, separately, on whether the Wits
 * row itself actually reached the table (it needs a calibrated film, like any
 * other millimetre reading) -- a sentence that still said "the Wits appraisal
 * above" when the row was absent (no calibration) would describe a row that
 * is not there. Both branches were only ever verified by hand in a live
 * session; this exercises `patientNote` directly, as the pure function it is.
 */
describe('Wits & vertical', () => {
  const { patientNote } = wits.provenance;
  const computedWithWits = new Set([witsAppraisal.symbol]);
  const computedWithoutWits = new Set<string>();

  it('grades against the pooled mean when no sex is on record', () => {
    const note = patientNote!(undefined, computedWithWits);
    expect(note).toExist();
    expect(note!.indexOf('pooled 0')).toNotBe(-1);
  });

  it("grades against Jacobson's male mean when the patient's sex is male", () => {
    const note = patientNote!({ sex: 'male' }, computedWithWits);
    expect(note).toExist();
    expect(note!.indexOf('male mean')).toNotBe(-1);
    expect(note!.indexOf('−1.0')).toNotBe(-1);
  });

  it("grades against Jacobson's female mean when the patient's sex is female", () => {
    const note = patientNote!({ sex: 'female' }, computedWithWits);
    expect(note).toExist();
    expect(note!.indexOf('female mean')).toNotBe(-1);
    expect(note!.indexOf('0.0')).toNotBe(-1);
  });

  it('says nothing when the Wits row itself did not reach the table (uncalibrated film)', () => {
    expect(patientNote!({ sex: 'male' }, computedWithoutWits)).toBe(undefined);
    expect(patientNote!(undefined, computedWithoutWits)).toBe(undefined);
  });

  it('still describes the sex split when the caller does not track computed symbols at all', () => {
    // computedSymbols is optional; omitting it must not be mistaken for "the
    // row is absent" (which would suppress the note for every caller that
    // predates tracking computed symbols).
    const note = patientNote!({ sex: 'male' }, undefined);
    expect(note).toExist();
  });
});

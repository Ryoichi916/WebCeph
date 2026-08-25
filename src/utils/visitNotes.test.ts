import expect from 'expect';

import {
  emptyVisitNoteFields, trimVisitNoteFields, isVisitNoteEmpty,
  sameVisitNoteFields, changedVisitNoteFields, filledVisitNoteFields,
} from './visitNotes';

/**
 * A harsh-judge audit found that every field-content `.trim()` in this
 * module stripped a clinician's intentional U+3000 (ideographic space) --
 * the standard Japanese paragraph-indent convention -- because JS's
 * `String.prototype.trim()` treats it as ordinary whitespace. These lock in
 * the fix (`trimField`, module-private) across every function that reads or
 * compares a field's stored content, not just the one the audit's live
 * repro happened to catch.
 */
describe('Visit notes: U+3000 (ideographic space) preservation', () => {
  const withIdeographicIndent = () => ({
    ...emptyVisitNoteFields(),
    note: '　患者は前歯部の突出を主訴に来院した。　',
  });

  it('trimVisitNoteFields strips ordinary edge whitespace but keeps an intentional ideographic indent', () => {
    const trimmed = trimVisitNoteFields({
      ...emptyVisitNoteFields(),
      chiefComplaint: '  spaces trimmed  ',
      note: '　患者は前歯部の突出を主訴に来院した。　',
    });
    expect(trimmed.chiefComplaint).toBe('spaces trimmed');
    expect(trimmed.note).toBe('　患者は前歯部の突出を主訴に来院した。　');
  });

  it('does not report a field holding only an ideographic-indented sentence as empty', () => {
    expect(isVisitNoteEmpty(withIdeographicIndent())).toBe(false);
  });

  it('reports a field of only ordinary whitespace as empty (unaffected by the fix)', () => {
    expect(isVisitNoteEmpty({ ...emptyVisitNoteFields(), note: '   \n  ' })).toBe(true);
  });

  it('treats two versions as the same note when they agree once ordinary edge whitespace is ignored, ideographic indent included', () => {
    const a = withIdeographicIndent();
    const b = { ...a, note: `  ${a.note}  ` }; // extra ASCII padding around the same content
    expect(sameVisitNoteFields(a, b)).toBe(true);
  });

  it('treats an edit that only adds or removes an ideographic indent as a real, reportable change', () => {
    const before = { ...emptyVisitNoteFields(), plan: '経過観察' };
    const after = { ...emptyVisitNoteFields(), plan: '　経過観察　' };
    expect(sameVisitNoteFields(before, after)).toBe(false);
    const changed = changedVisitNoteFields(before, after);
    expect(changed.length).toBe(1);
    expect(changed[0].key).toBe('plan');
  });

  it('filledVisitNoteFields reports the ideographic-indented value verbatim', () => {
    const filled = filledVisitNoteFields(withIdeographicIndent());
    expect(filled.length).toBe(1);
    expect(filled[0].option.key).toBe('note');
    expect(filled[0].value).toBe('　患者は前歯部の突出を主訴に来院した。　');
  });
});

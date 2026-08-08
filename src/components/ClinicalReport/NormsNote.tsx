import * as React from 'react';

import { formatProvenanceSource } from 'components/AnalysisResultsViewer';

const classes = require('./style.scss');

export interface NormsNoteProps {
  /** The analysis' norms provenance, or undefined when it states none. */
  provenance?: NormsProvenance;
  /**
   * The patient the norms were read against, so the note can say what *this*
   * document did with the record — "corrected to 28 y" or "no date of birth on
   * file, printed uncorrected" (see `NormsProvenance.patientNote`).
   */
  context?: AnalysisContext;
}

/**
 * Whose norms an analysis section is graded against, printed under its results
 * table.
 *
 * A printed cephalometric table is read — and filed, and sent on to a
 * colleague — as a statement about the patient, and a deviation column is only
 * a statement about the patient once the reader knows which sample the mean
 * came from. Björk's 396° is 603 Swedish males; Downs' 87.8° is twenty North
 * American adolescents; Jacobson's Wits is 21 South African adults. Those are
 * not interchangeable populations and the paper has to say so beside each
 * table, not once in a preface the reader may not have.
 *
 * The "not matched to this patient" sentence is stated once for the whole
 * document (see `index.tsx`) rather than repeated under all nine tables, where
 * it would become wallpaper.
 *
 * An analysis with no stated provenance prints nothing at all: an invented
 * citation would be worse than a missing one.
 */
const NormsNote = ({ provenance, context }: NormsNoteProps) => {
  if (provenance === undefined) {
    return null;
  }
  const { alsoFrom, note } = provenance;
  const patientNote = typeof provenance.patientNote === 'function'
    ? provenance.patientNote(context)
    : undefined;
  return (
    <p className={classes.norms}>
      <span className={classes.norms_label}>Norms</span>
      <span className={classes.norms_source}>
        {formatProvenanceSource(provenance)}
      </span>
      {alsoFrom !== undefined && alsoFrom.length > 0 ? (
        <span className={classes.norms_also}>
          Also: {alsoFrom.join('; ')}
        </span>
      ) : null}
      {note !== undefined ? (
        <span className={classes.norms_note}>{note}</span>
      ) : null}
      {/* What this reading did with this patient's record — the sentence that
          separates a norm corrected to their age from one that was not. */}
      {patientNote !== undefined ? (
        <span className={classes.norms_applied}>{patientNote}</span>
      ) : null}
    </p>
  );
};

export default NormsNote;

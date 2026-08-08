/**
 * How a set of categorized results is laid out as table rows — shared by the
 * Summary dialog and by every table of the printed clinical report, so one
 * measurement cannot be typeset two different ways on the two surfaces that
 * show it.
 *
 * The problem it solves: a single measurement can support more than one
 * clinical finding. Downs' facial angle is interpreted twice by design (see
 * `facialAngle`) — once as the skeletal profile, once as the prominence of the
 * chin — so it appeared in two of the analysis' finding groups.
 *
 * Both surfaces used to print it twice: in full under the first finding, and
 * again under the second as a row whose entire content was a cross-reference —
 * the report printed "91.3°" with *"norm and deviation under “Skeletal
 * profile”"* set across the NORM and DEVIATION columns, and the dialog printed
 * the same row with an empty VALUE cell and the number folded into the note.
 * A table row that says "see above" is not a measurement, and two different
 * layouts for one row is worse than either.
 *
 * So a measurement is tabulated exactly **once**, under the first finding it
 * supports, with its own norm and deviation — and the other findings drawn from
 * it are named in that group's FINDING cell, each with its own conclusion chip
 * and with the measurement it was read from, so nothing is attributed to a row
 * it did not come from.
 */

type ResultComponent =
  CategorizedAnalysisResult<Category>['relevantComponents'][0];

/**
 * A finding graded from measurements that are tabulated under an earlier
 * finding. Printed in that finding's cell rather than as rows of its own.
 */
export interface AlsoFinding {
  category: Category;
  indication: Indication<Category>;
  /** The measurements it was read from — always rows of the group it sits in. */
  symbols: string[];
}

/** One group of table rows: a finding, its measurements, and its passengers. */
export interface FindingGroup {
  category: Category;
  indication: Indication<Category>;
  /** Only the measurements this group is the first to report. */
  components: ResultComponent[];
  /** Findings read from those same measurements by a later category. */
  also: AlsoFinding[];
}

/**
 * Groups an analysis' results into printable rows, de-duplicating shared
 * measurements as described above. Order is preserved; a group left with no
 * measurements of its own is dropped from the table and survives as an
 * `also` entry on the group that owns its measurements.
 */
export const groupFindings = (
  results: Array<CategorizedAnalysisResult<Category>>,
): FindingGroup[] => {
  // Which group is the first to report each measurement. That group tabulates
  // it; every later group references it from its finding cell.
  const ownerOf: { [symbol: string]: number | undefined } = {};
  results.forEach(({ relevantComponents }, i) => {
    relevantComponents.forEach(({ symbol }) => {
      if (ownerOf[symbol] === undefined) {
        ownerOf[symbol] = i;
      }
    });
  });

  const groups: FindingGroup[] = results.map(
    ({ category, indication, relevantComponents }, i): FindingGroup => ({
      category,
      indication,
      components: relevantComponents.filter((c) => ownerOf[c.symbol] === i),
      also: [],
    }),
  );

  results.forEach(({ category, indication, relevantComponents }, i) => {
    // Grouped by owner so a finding read from two borrowed measurements is
    // named once, listing both.
    const byOwner: { [owner: string]: string[] | undefined } = {};
    relevantComponents.forEach(({ symbol }) => {
      const owner = ownerOf[symbol];
      if (owner === undefined || owner === i) {
        return;
      }
      const key = String(owner);
      const list = byOwner[key];
      if (list === undefined) {
        byOwner[key] = [symbol];
      } else {
        list.push(symbol);
      }
    });
    Object.keys(byOwner).forEach((key) => {
      const symbols = byOwner[key];
      if (symbols !== undefined) {
        groups[Number(key)].also.push({ category, indication, symbols });
      }
    });
  });

  return groups.filter((g) => g.components.length > 0);
};

/**
 * The attribution of a borrowed finding, naming the measurement it was graded
 * from: "from Or-Po,N-Pog". Shared so the dialog and the paper word it
 * identically.
 *
 * It is set **inline, in the finding's own heading**, not as a caption above it:
 * a 9px grey caption 1px above an 11px bold heading read as a stray fragment,
 * and the finding under it — "Chin prominence · Normal" — sat level with the
 * *next* measurement's row (NAPog, amber and asterisked), so the one thing
 * standing between the reader and a misattribution was the smallest type in the
 * table.
 */
export const alsoFindingLabel = (symbols: string[]): string => (
  // Non-breaking after "from": the attribution is set in a narrow finding
  // column, and "from" alone on a line above the measurement it introduces is
  // not an attribution anybody reads as one.
  `from\u00A0${symbols.join(', ')}`
);

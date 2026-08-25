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
 *
 * The module also owns the two rules that decide how a finding *looks* and where
 * it *sits* — its chip tone (`chipToneFor`) and its position in a headline list
 * (`orderFindings`) — for the same reason: three surfaces print those headlines
 * (the Summary dialog, the report's contents page and the records dashboard's
 * findings panel), and three copies of one rule is how they silently diverge.
 * `AnalysisResultsViewer/index` re-exports the tone helpers, so every existing
 * importer keeps its import.
 */

import { NEUTRAL_CATEGORY } from 'analyses/helpers';

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

// ---------------------------------------------------------------- finding tone
//
// Whether a conclusion is a clinically *normal* one, and the chip tone that
// follows from it. Lives here rather than in the dialog that used to own it
// because `orderFindings` below ranks on it, and this module must stay free of
// React.

/**
 * Whether a finding's conclusion is a clinically *normal* one. Drives the chip
 * colour on every surface that prints a finding — the Summary dialog, the
 * report's tables and its findings overview, the records dashboard — so that one
 * conclusion cannot appear in three tints on three pages of one document.
 */
export const isNormalIndication = (indication: Indication<Category>): boolean => (
  indication === 'normal' ||
  indication === 'class1' ||
  indication === 'within_norm'
);

/**
 * Chip tone for a finding. Driven by the **indication**, never by the worst
 * severity in the group: the report used to tint the chip by the group's worst
 * star count, so "Growth pattern — Horizontal" printed amber under Björk and
 * red under Jarabak, one above the other on the same page, from the same
 * tracing. Severity still shows — on the value and deviation of the individual
 * row that carries it, where it belongs.
 */
export type ChipTone = 'success' | 'neutral' | 'warn';

export const chipToneFor = (indication: Indication<Category>): ChipTone => {
  if (isNormalIndication(indication)) {
    return 'success';
  }
  // A measurement this app states no norm for is not abnormal; it is ungraded.
  if (indication === 'not_graded') {
    return 'neutral';
  }
  return 'warn';
};

/** One headline finding: a category and the conclusion drawn for it. */
export interface HeadlineFinding {
  category: Category;
  indication: Indication<Category>;
}

/**
 * A canonical slot per category — "keep this order whatever the ranking says".
 * See `orderFindings`.
 */
export interface FindingOrder { [category: string]: number | undefined; }

/**
 * An analysis' findings ordered for a headline: what is abnormal first, ties in
 * the analysis' own order.
 *
 * The neutral bucket is not a finding (it is the measured-values list, printed
 * in full in the table below wherever this list appears), and the rank follows
 * the **indication** rather than the worst severity inside the group, so the
 * same conclusion is ranked and tinted identically on every surface.
 *
 * `pinned` exists for the one surface that prints these lists *repeatedly, side
 * by side*: the records dashboard shows one block per film, and a ranking
 * recomputed per film moved "Skeletal profile" from slot 4 to slot 1 to slot 3
 * down a three-film chart, so nothing could be compared across the blocks. It
 * passes the first film's order here and every later block keeps it; categories
 * absent from it fall in behind, ranked the usual way. Passing nothing gives the
 * plain worst-first order the printed report's contents page wants.
 */
export const orderFindings = (
  results: Array<CategorizedAnalysisResult<Category>>,
  pinned?: FindingOrder,
): HeadlineFinding[] => {
  const findings: HeadlineFinding[] = results
    .filter((r) => r.category !== NEUTRAL_CATEGORY)
    .map(({ category, indication }) => ({ category, indication }));
  const rank = (f: HeadlineFinding) => (
    chipToneFor(f.indication) === 'warn' ? 0 : 1
  );
  const slot = (f: HeadlineFinding) => (
    pinned !== undefined ? pinned[f.category as string] : undefined
  );
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const sa = slot(a.f);
      const sb = slot(b.f);
      if (sa !== undefined && sb !== undefined) {
        return sa - sb;
      }
      // A pinned category keeps its slot ahead of one the pinning never saw:
      // the alternative is a new finding pushing every aligned row down by one.
      if (sa !== undefined) {
        return -1;
      }
      if (sb !== undefined) {
        return 1;
      }
      return (rank(a.f) - rank(b.f)) || (a.i - b.i);
    })
    .map(({ f }) => f);
};

// --------------------------------------------------------------- divergence
//
// A group's chip is one indication resolved (see `resolveIndication`) across
// every component that reports the category — but "resolved" is not
// "unanimous". Downs' "Lower incisor inclination" is graded from L1-OP
// (labial off a canted occlusal plane) and IMPA (lingual): on a film where
// the two disagree by a hair of standard deviation, the chip reads "Labial"
// while IMPA — tabulated two rows below it — reads the opposite, and nothing
// on screen said the group's own rows had split. The printed report
// re-interprets each row against its own landmark for exactly this reason
// (see `AnalysisResultsViewer/index#buildReportRows`); this finds the same
// split for the dialog's finding cell, so the chip a clinician reads first is
// never silently contradicted by the numbers under it.

/** One dissenting reading inside a group whose own rows do not agree. */
export interface GroupDissent {
  indication: Indication<Category>;
  /** The measurements that read this way, not the group's resolved one. */
  symbols: string[];
}

/** What a group's own components say about it, when they do not all agree. */
export interface GroupDivergence {
  /** The measurements whose own reading matches the group's resolved chip. */
  drivingSymbols: string[];
  /** Every other reading the group's own rows support, and who supports it. */
  dissenting: GroupDissent[];
}

/**
 * Finds a split inside one group: components whose own landmark states a
 * reading of this category, grouped by what they actually read, compared
 * against the group's resolved indication. Returns `null` when every
 * component that states an opinion agrees with it (the common case), or when
 * fewer than two components state one at all — nothing to split.
 *
 * Deliberately narrower than `resolveIndication`: a component with no
 * `interpret` of its own, or one that does not cover this category, casts no
 * vote here either, exactly as it casts none in the resolution itself.
 */
export const findGroupDivergence = (
  category: Category,
  indication: Indication<Category>,
  components: ResultComponent[],
  landmarksBySymbol: { [symbol: string]: CephLandmark | undefined },
): GroupDivergence | null => {
  const ownIndicationOf: { [symbol: string]: Indication<Category> } = {};
  components.forEach(({ symbol, value, mean, min, max }) => {
    const landmark = landmarksBySymbol[symbol];
    if (landmark === undefined || typeof landmark.interpret !== 'function') {
      return;
    }
    const own = landmark.interpret(value, min, max, mean)
      .filter((r) => r.category === category);
    if (own.length > 0) {
      ownIndicationOf[symbol] = own[0].indication;
    }
  });
  const symbols = Object.keys(ownIndicationOf);
  if (symbols.length < 2) {
    return null;
  }
  if (symbols.every((s) => ownIndicationOf[s] === indication)) {
    return null;
  }
  const drivingSymbols = symbols.filter((s) => ownIndicationOf[s] === indication);
  const dissentBy: { [ind: string]: string[] } = {};
  symbols.forEach((s) => {
    const ind = ownIndicationOf[s];
    if (ind === indication) {
      return;
    }
    const key = ind as string;
    (dissentBy[key] = dissentBy[key] || []).push(s);
  });
  const dissenting = Object.keys(dissentBy).map((ind) => ({
    indication: ind as Indication<Category>,
    symbols: dissentBy[ind],
  }));
  return { drivingSymbols, dissenting };
};

/** The canonical slots a list of findings defines, for `orderFindings#pinned`. */
export const findingOrderOf = (findings: HeadlineFinding[]): FindingOrder => {
  const order: FindingOrder = {};
  findings.forEach(({ category }, i) => {
    if (order[category as string] === undefined) {
      order[category as string] = i;
    }
  });
  return order;
};

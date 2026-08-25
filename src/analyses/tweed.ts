import {
  FMIA, FMPA, IMPA, yAxis,
} from 'analyses/landmarks/angles/skeletal';
import { tweedTriangleSum } from 'analyses/landmarks/other/skeletal';

import {
  defaultInterpretAnalysis, hasNorm, NO_NORM, TARGET_RANGE,
} from 'analyses/helpers';

/**
 * Tweed's diagnostic triangle — FMA (FMPA), IMPA and FMIA, the three angles the
 * Frankfort horizontal, the mandibular plane and the lower incisor axis form
 * with each other — read with the Y axis, the fourth reading taken off the same
 * Frankfort horizontal.
 *
 * All are computed from landmarks this app already places (Po, Or, Go, Me,
 * S, Gn and the lower incisor axis).
 *
 * **The triangle closes to 180° by construction.** The three angles are not
 * measured independently here: FMA is Po→Or against Go→Me, IMPA is Me→Go
 * against the incisor's apex→edge axis, FMIA is Po→Or against that same axis —
 * three readings off the same three directed lines, so their total is 180°
 * exactly at every tracing state, not merely near it. The closure is *printed*
 * (see `tweedTriangleSum`) rather than left implicit, because on paper the
 * three are measured separately and their landing on 180 is the check that the
 * tracing is sound; and because they close, they cannot vary independently —
 * which is why they are presented as **one finding** (see `interpret` below)
 * rather than as three unrelated rows scattered across the table.
 *
 * The triangle's three angles carry Tweed's norms — his targets of FMA 25°,
 * IMPA 90° and FMIA 65°, each with the conventional ± 5° clinical latitude —
 * **declared as published ranges, not as mean ± 1 SD bands** (see `RANGE`).
 * Tweed stated target values and acceptable ranges; he did not publish a
 * standard deviation of 5° for any of the three, and this app's rule for such
 * norms (Björk's gonial halves, Jarabak's ratio) is that no surface may
 * manufacture one by halving the range: the tables mark these rows *range*,
 * grade them in or out of it, and print no stars against an SD nobody stated.
 * Unlike Björk's and Jarabak's ranges, Tweed's 25/90/65 **are** the figures a
 * clinician treats toward, not merely the midpoint of a bound — so they are
 * declared with `TARGET_RANGE`, not plain `RANGE`, and the norm cell keeps the
 * target visible beside the range ("25.0 · range 20–30") instead of hiding it
 * in the provenance prose, where the deviation-beyond-bound column left it.
 * They are interpreted: FMPA grades the mandibular rotation, while
 * FMIA and IMPA — read together, as Tweed intended — grade the inclination of
 * the lower incisor. Both conclusions are named *on* the triangle's group, with
 * the measurements they were read from, so the finding a clinician acts on
 * (Tweed planned treatment on FMIA — uprighting the lower incisor until FMIA
 * reaches its target — with FMA telling him how far that target must move) sits
 * beside the numbers that support it.
 *
 * The **Y axis** is not Tweed's measurement and is not printed as though it
 * were: it carries Downs' 59.4° ± 3.8, attributed to him in `alsoFrom` exactly
 * as `wits.ts` attributes its borrowed FMA to Tweed and its ratio to Jarabak.
 * It used to sit here with "no published norm" against it — while the Downs
 * section, two menu items away, graded the identical S-Gn-to-Frankfort angle
 * against that very figure. One app cannot both state a norm for a quantity and
 * deny that one exists for it; naming the borrowed author fixes that in the
 * direction that keeps the reading.
 *
 * The **occlusal plane to Frankfort** row has been dropped. It was the other
 * ungraded row here, and on a five-row table the two of them were 40 % of the
 * content; but the reason it goes rather than borrowing a norm too is that
 * Downs' +9.3° cant belongs to *his* occlusal plane — molar cusps to the
 * incisal bisector — and this row measured the functional molar-to-premolar
 * plane, a different line by about 3°. Downs' section reports the cant on
 * Downs' construction, which is where it belongs.
 *
 * Tweed's own treatment rule (that FMIA should be brought to 65° when FMPA is
 * high and 68° when it is low) is a *plan*, not a measurement, so it is not
 * printed as a finding: this module reports what the tracing supports and
 * leaves the prescription to the clinician.
 */
const components: AnalysisComponent[] = [
  // The triangle, in the order its sum line reads: FMA + IMPA + FMIA = 180°.
  // Declared as published *ranges* (target ± the conventional 5° latitude),
  // because Tweed stated targets and ranges, never a standard deviation — see
  // the module doc above. `mean` keeps the target for the interpreters and
  // `TARGET_RANGE` keeps it printed for the clinician.
  {
    landmark: FMPA,
    mean: 25,
    max: 30,
    min: 20,
    ...TARGET_RANGE,
  },
  {
    landmark: IMPA,
    mean: 90,
    max: 95,
    min: 85,
    ...TARGET_RANGE,
  },
  {
    landmark: FMIA,
    mean: 65,
    max: 70,
    min: 60,
    ...TARGET_RANGE,
  },
  {
    // The closure row — 180° identically (see `tweedTriangleSum`). An identity
    // has no published norm, and inventing "180 ± 0" would dress a geometric
    // fact as a sample statistic; the columns print an em dash instead.
    landmark: tweedTriangleSum,
    ...NO_NORM,
  },
  {
    // Y axis (S-Gn to Frankfort horizontal), graded against Downs' figure —
    // the same construction and the same norm his own section uses.
    landmark: yAxis,
    mean: 59.4,
    max: 63.2,
    min: 55.6,
    normSource: 'Downs 1948',
  },
];

/** The triangle's rows, in the order the sum line reads them. */
const TRIANGLE_SYMBOLS = [
  FMPA.symbol, IMPA.symbol, FMIA.symbol, tweedTriangleSum.symbol,
];

/**
 * Tweed's interpretation: the default per-angle reading, with the triangle
 * pulled together into one leading group.
 *
 * `defaultInterpretAnalysis` on its own filed FMIA and IMPA under "Lower
 * incisor inclination", FMPA under "Mandibular rotation" and the closure row
 * under "Measured values" — the diagnostic triangle, which Tweed defined as one
 * figure whose angles sum to 180°, arrived as three unrelated groups with its
 * fourth row stranded at the bottom of the table. Here the three angles and
 * their closure are emitted first, as one `tweedTriangle` group; the per-angle
 * conclusions keep their own groups after it, which the shared table layout
 * (see `AnalysisResultsViewer/grouping`) renders as labelled conclusions *on*
 * the triangle — "Mandibular rotation — from FMPA", "Lower incisor
 * inclination — from IMPA, FMIA" — since the triangle is the first group to
 * tabulate those measurements.
 *
 * The group's own chip states the one thing true of the triangle as a whole:
 * within Tweed's norms when every graded angle of it is, outside them
 * otherwise. The specific conclusions stay with the per-angle findings.
 *
 * **The group only exists while the whole triangle is measured.** With an
 * angle of the three missing (a removed incisor landmark leaves only FMPA)
 * there is no triangle to certify, and a chip that read "Within norm" off one
 * angle of three was a verdict on a figure two-thirds unmeasured. In that
 * state the default grouping stands: the angles that are computed keep their
 * own honest per-angle findings, and no collective claim is printed at all.
 */
const interpret: InterpretAnalysis<Category> = (values, objects, context) => {
  const results = defaultInterpretAnalysis(components)(values, objects, context);

  // The first-reported row of each measurement, which is the row the tables
  // will tabulate (see `groupFindings`).
  type ResultRow = CategorizedAnalysisResult<Category>['relevantComponents'][0];
  const rowOf: { [symbol: string]: ResultRow | undefined } = {};
  results.forEach(({ relevantComponents }) => {
    relevantComponents.forEach((row) => {
      if (rowOf[row.symbol] === undefined) {
        rowOf[row.symbol] = row;
      }
    });
  });

  const triangleRows = TRIANGLE_SYMBOLS
    .map((symbol) => rowOf[symbol])
    .filter((row): row is ResultRow => row !== undefined);
  const gradedRows = triangleRows.filter(
    ({ mean, min, max }) => hasNorm(mean, min, max),
  );
  // The triangle is pulled together only when all three of its angles are
  // measured (the graded rows are exactly the three angles — the closure row
  // carries no norm). Anything less is not a triangle: on a film with the
  // lower incisor removed only FMPA computes, and a group chip would then
  // certify "Within norm" from one angle of three. The default grouping
  // stands instead, which keeps every computed angle's own per-angle finding
  // and asserts nothing about the figure as a whole.
  if (gradedRows.length < 3) {
    return results;
  }

  const indication: Indication<'tweedTriangle'> = gradedRows.every(
    ({ value, min, max }) => value >= min && value <= max,
  ) ? 'within_norm' : 'outside_norm';

  // The closure row moves into the triangle group; everything else keeps its
  // group so the per-angle conclusions survive as named findings on the
  // triangle. A group left empty by the move is dropped, never printed hollow.
  const rest = results
    .map((result) => ({
      ...result,
      relevantComponents: result.relevantComponents.filter(
        ({ symbol }) => symbol !== tweedTriangleSum.symbol,
      ),
    }))
    .filter(({ relevantComponents }) => relevantComponents.length > 0);

  return [
    {
      category: 'tweedTriangle' as Category,
      indication,
      severity: 'none' as Severity,
      relevantComponents: triangleRows,
    },
    ...rest,
  ];
};

const analysis: Analysis<'ceph_lateral'> = {
  id: 'tweed',
  components,
  provenance: {
    author: 'Tweed',
    year: 1954,
    population:
      'North American white orthodontic patients with stable, successfully ' +
      'treated results',
    alsoFrom: [
      'Downs 1948 — Y axis to Frankfort horizontal, 59.4° ± 3.8',
    ],
    note:
      'Tweed\'s triangle is a treatment prescription as much as a norm: the ' +
      'three angles are defined to sum to 180°, so they cannot vary ' +
      'independently — the closure row above is that identity, computed from ' +
      'this tracing, not a normed measurement — and his FMIA target moves ' +
      'with FMPA (65° on a high angle, 68° on a low one) rather than staying ' +
      'at a single figure. His norms are targets with a conventional ' +
      'clinical latitude — FMA 25°, IMPA 90°, FMIA 65°, each read ± 5° — ' +
      'not means with a published standard deviation, so the three are ' +
      'printed as ranges (20–30, 85–95, 60–70) and graded in or out of ' +
      'them. The Y axis is Downs\' measurement ' +
      'and Downs\' norm, borrowed here because it is read off the same ' +
      'Frankfort horizontal; the occlusal-plane cant is not printed in this ' +
      'section at all, since the only published norm for it is Downs\' and ' +
      'it belongs to his construction of the plane, not to the functional one.',
  },
  interpret,
};

export default analysis;

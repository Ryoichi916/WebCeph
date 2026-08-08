import LATERAL_ANALYSES from 'analyses/lateral';

/**
 * Display name per analysis id, for the stepper's header and the records
 * dashboard's per-image chips.
 *
 * Seeded from `LATERAL_ANALYSES` — the same source the toolbar menu, the
 * Summary dialog and the clinical report read — because a hand-keyed copy of
 * this map had already drifted from it: `softTissues` was spelled "Soft
 * Tissues" here and "Soft Tissue" there, so one analysis was named two
 * different things on two surfaces of the same screen (the stepper header read
 * "Soft Tissues" while the toolbar button and the Summary badge beside it read
 * "Soft Tissue").
 *
 * The entries below the seed are the ids that are not lateral analyses in their
 * own right: `basic` and `common` (composed building blocks) and the legacy
 * `analysis.id` spellings that older saved projects still carry in their
 * per-image `analysisId`.
 */
const analysesMap: { [id: string]: string | undefined } = {
  ...LATERAL_ANALYSES.reduce(
    (names, { id, name }) => Object.assign(names, { [id]: name }),
    {} as { [id: string]: string | undefined },
  ),
  basic: 'Basic',
  common: 'Common',
  ricketts_lateral: 'Ricketts',
  soft_tissues_lateral: 'Soft tissues',
};

export const getNameForAnalysis = (id: string) => {
  return analysesMap[id] || id;
};

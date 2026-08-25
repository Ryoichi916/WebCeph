import { LandmarkPredictor, PredictionInput, PredictedLandmark } from './types';

/**
 * Identifies this predictor to callers that need to tell placeholder output
 * apart from a real detection (see `store/middleware/autoPlot`, which warns
 * the clinician when this id plots on anything but the bundled sample film).
 */
export const PLACEHOLDER_PREDICTOR_ID = 'demo-heuristic';

/** Stable FNV-1a hash so each unknown symbol maps to the same spot across runs. */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const frac = (n: number): number => n - Math.floor(n);

/**
 * Landmark positions for the bundled sample lateral cephalogram (the wceph
 * fixture film inlined in `utils/sampleCeph.ts`, patient facing right),
 * expressed as fractions of the image width/height.
 *
 * Every coordinate below was calibrated point-by-point against that film's own
 * anatomy, read off gridded high-zoom crops of the radiograph: S in the pit of
 * the sella turcica, Po on the upper edge of the ear-rod ring the cephalostat
 * left on the film, Or on the orbital floor, ANS/PNS on the two ends of the
 * bony palate (whose double cortical line is plainly visible), Go at the
 * gonial angle, Me at the lowest point of the symphysis, the incisal edges on
 * the actual (mixed-dentition) incisors, and the soft-tissue chain on the
 * skin profile from forehead to submental. The subject is a child — large
 * unerupted tooth germs sit in both jaws — so lengths read shorter than adult
 * norms, and that is the film's truth, not an error. Frankfort (Po-Or) runs
 * within ~2° of the film's horizontal, which is the strongest single check
 * that the porion and orbitale reads are right.
 *
 * These fractions are honest ONLY for the bundled sample film. On any other
 * image the demo predictor still emits them, scaled to the image — which is
 * what makes it a demo, not a landmark detector: the pipeline (place, edit,
 * measure) is real, the *detection* is not. `Auto-plot` stays labelled a demo
 * for exactly this reason, and a real predictor drops in via
 * `getActivePredictor`.
 *
 * The film's own ruler reads 10 mm ≈ 114 px at full resolution (1578×2089):
 * the calibration a demo walkthrough should enter.
 */
const TEMPLATE: { [symbol: string]: [number, number] } = {
  // Cranial base
  'S': [0.190, 0.452],
  'N': [0.607, 0.390],
  'Po': [0.129, 0.541],
  'Or': [0.545, 0.529],
  'Ba': [0.165, 0.562],
  'Ar': [0.190, 0.524],
  'Pt': [0.444, 0.548],
  // Maxilla
  'ANS': [0.614, 0.588],
  'PNS': [0.373, 0.597],
  'A': [0.605, 0.615],
  // Mandible
  'B': [0.639, 0.748],
  'Pog': [0.653, 0.807],
  'Gn': [0.630, 0.841],
  'Me': [0.590, 0.856],
  'Go': [0.269, 0.773],
  'PM': [0.647, 0.776],
  'D': [0.618, 0.792],
  // Ricketts' condylar and ramus construction points
  'Dc': [0.219, 0.541],
  'R1-mandible': [0.393, 0.656],
  'R2-mandible': [0.222, 0.656],
  'R3-mandible': [0.304, 0.589],
  'R4-mandible': [0.310, 0.783],
  // Dentition (mixed — the film is a child)
  'U1 Apex': [0.586, 0.591],
  'U1 Incisal Edge': [0.644, 0.677],
  'L1 Apex': [0.605, 0.732],
  'L1 Incisal Edge': [0.625, 0.668],
  'U4': [0.527, 0.680],
  'L4': [0.527, 0.688],
  'U6': [0.475, 0.685],
  'L6': [0.475, 0.694],
  // Soft tissue profile
  'G': [0.620, 0.352],
  'N\'': [0.630, 0.394],
  'Pn': [0.741, 0.522],
  'Sn': [0.695, 0.579],
  'Sls': [0.688, 0.598],
  'Ls': [0.709, 0.621],
  'Sts': [0.701, 0.649],
  'Sti': [0.695, 0.667],
  'Li': [0.709, 0.690],
  'Ils': [0.681, 0.730],
  'Pog\'': [0.701, 0.782],
  'Me\'': [0.637, 0.866],
};

/**
 * A deterministic, dependency-free placeholder predictor. Known cephalometric
 * symbols are placed using the anatomical template above; unknown symbols fall
 * back to a stable hash spread over the mid-face region so the pipeline still
 * works for custom points. Replace via `getActivePredictor` with a real
 * (e.g. onnxruntime-web) backend.
 */
const demoPredictor: LandmarkPredictor = {
  id: PLACEHOLDER_PREDICTOR_ID,
  isReady: () => true,
  predict: ({ width, height, symbols }: PredictionInput): Promise<PredictedLandmark[]> => {
    const results: PredictedLandmark[] = symbols.map((symbol) => {
      const template = TEMPLATE[symbol];
      if (template !== undefined) {
        return { symbol, x: width * template[0], y: height * template[1] };
      }
      const h = hash(symbol);
      const fx = 0.38 + 0.24 * frac(h / 9973);
      const fy = 0.38 + 0.24 * frac((h / 9941) * 1.6180339887);
      return { symbol, x: width * fx, y: height * fy };
    });
    return Promise.resolve(results);
  },
};

export default demoPredictor;

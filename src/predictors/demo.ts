import { LandmarkPredictor, PredictionInput, PredictedLandmark } from './types';

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
 * Anatomically plausible landmark positions for a standard lateral cephalogram
 * (patient facing right), expressed as fractions of the image width/height.
 *
 * The template is calibrated against the bundled sample cephalogram (see
 * utils/sampleCeph.ts) and yields clinically believable values for the common
 * analyses (e.g. SNA ~ 85°, ANB ~ 1.6°, FMA ~ 24°, IMPA ~ 83°, gonial angle
 * ~ 129°), instead of a random point cloud.
 *
 * The case is deliberately a horizontal grower: Gn sits far enough forward
 * that the Y axis-FH angle lands ~2.2 SD below the Downs norm, so the demo
 * exercises the full severity scale of the results table (the ** / red tier),
 * not just single-star deviations.
 */
const TEMPLATE: { [symbol: string]: [number, number] } = {
  // Cranial base
  'S':   [0.310, 0.283],
  'N':   [0.640, 0.295],
  'Po':  [0.295, 0.380],
  'Or':  [0.585, 0.405],
  'Ba':  [0.276, 0.448],
  'Ar':  [0.284, 0.393],
  'Pt':  [0.435, 0.398],
  // Maxilla
  'ANS': [0.630, 0.430],
  'PNS': [0.455, 0.440],
  'A':   [0.613, 0.462],
  // Mandible
  'B':   [0.581, 0.596],
  'Pog': [0.607, 0.647],
  'Gn':  [0.610, 0.668],
  'Me':  [0.556, 0.694],
  'Go':  [0.318, 0.578],
  'PM':  [0.601, 0.617],
  'R1-mandible': [0.356, 0.500],
  'R2-mandible': [0.303, 0.500],
  'R3-mandible': [0.330, 0.428],
  'R4-mandible': [0.334, 0.615],
  // Dentition — incisor axes calibrated on the demo film so the dental
  // analysis reads clinically (U1-SN ~106°, IMPA ~92°, interincisal ~134°,
  // all within their normal bands for this low-mandibular-plane case).
  'U1 Apex':         [0.578, 0.438],
  'U1 Incisal Edge': [0.600, 0.514],
  'L1 Apex':         [0.545, 0.605],
  'L1 Incisal Edge': [0.607, 0.523],
  // Premolar cusps sit slightly lower than the molar cusps so the functional
  // occlusal plane tilts ~6° down-anteriorly, giving a Wits appraisal ~+1.3 mm
  // (within the 0 ± 2 mm norm) for this demo case.
  'U4':  [0.556, 0.512],
  'L4':  [0.554, 0.526],
  'U6':  [0.510, 0.508],
  'L6':  [0.508, 0.522],
  // Soft tissue profile
  'G':    [0.664, 0.245],
  'N\'':  [0.668, 0.298],
  'Pn':   [0.727, 0.416],
  'Sn':   [0.668, 0.458],
  'Sls':  [0.678, 0.478],
  'Ls':   [0.690, 0.498],
  'Sts':  [0.679, 0.522],
  'Sti':  [0.679, 0.540],
  'Li':   [0.688, 0.558],
  'Ils':  [0.659, 0.586],
  'Pog\'': [0.664, 0.630],
  'Me\'':  [0.610, 0.700],
};

/**
 * A deterministic, dependency-free placeholder predictor. Known cephalometric
 * symbols are placed using the anatomical template above; unknown symbols fall
 * back to a stable hash spread over the mid-face region so the pipeline still
 * works for custom points. Replace via `getActivePredictor` with a real
 * (e.g. onnxruntime-web) backend.
 */
const demoPredictor: LandmarkPredictor = {
  id: 'demo-heuristic',
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

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
 * The template is calibrated against the sample lateral cephalogram used
 * throughout development: S sits on the sella turcica, Po on the external
 * auditory meatus, Go on the gonial angle, Me on menton. It yields clinically
 * believable values for the common analyses (SNA ~ 85°, ANB ~ 1.6°, FMA ~ 24°,
 * IMPA ~ 92°, saddle ~ 115°, articular ~ 134°, gonial ~ 139°) instead of a
 * random point cloud.
 *
 * The case is deliberately a horizontal grower — Björk's sum ~ 388° (below the
 * 396 ± 6 norm), the Y axis-FH angle ~ 55° (below the Downs norm) and a
 * posterior/anterior facial-height ratio well above Jarabak's 62–65 band all
 * agree on it — so the demo shows one consistent picture across the nine
 * analyses rather than a contradiction between them.
 *
 * Two placements were wrong until this revision and are worth recording,
 * because both produced numbers no clinician would accept:
 *
 *  - **Articulare** sat 15 px from porion — 1.6 mm at the demo's own scale —
 *    when it belongs 10–20 mm postero-inferior to it. The saddle angle read
 *    98.9°, a value not seen in humans, and the articular angle 160.1°. The sum
 *    of the three posterior angles is fixed by N, S, Go and Me, so it was
 *    unaffected, and that is precisely why the fault survived: the
 *    growth-pattern reading looked right while its three components did not.
 *    Ar now sits ~12 mm postero-inferior to porion, on the posterior border of
 *    the condylar neck, and basion has followed it so the clivus S→Ar→Ba runs
 *    down and back instead of folding forward.
 *
 *    The three angles now read 115° / 134° / 139° — a low saddle and a wide
 *    gonial angle, each about 1.5 SD off its norm, all three values that occur
 *    in patients. They are not centred on their norms, and cannot be while the
 *    rest of the tracing stays on the film's own anatomy: sella, gonion and
 *    menton are where this skull actually puts them, and with those four points
 *    fixed the three angles are forced to sum to ~388°. Moving gonion to centre
 *    them would have taken it 16 mm off the mandibular angle it is traced on —
 *    trading a visible, checkable tracing for flattering numbers, which is the
 *    wrong trade in this app.
 *
 *  - **Gnathion** sat directly below pogonion instead of at the pogonion–menton
 *    midpoint this app's own step description asks for, opening a 10° gap
 *    between Go-Gn/SN and Go-Me/SN — two lines that differ by a few degrees on
 *    a real tracing. Steiner therefore read a 14° counter-clockwise mandibular
 *    rotation off the same mandible that Downs, Tweed and Ricketts all called
 *    normal. Gn is now the midpoint, and pogonion has been brought down onto
 *    the symphysis outline, which halves the gap to ~4.9° (Go-Gn/SN 23.0°
 *    against SN-MP 27.8°) and drops Steiner's reading to the same
 *    one-star band the others sit in.
 */
const TEMPLATE: { [symbol: string]: [number, number] } = {
  // Cranial base
  'S':   [0.310, 0.283],
  'N':   [0.640, 0.295],
  'Po':  [0.295, 0.380],
  'Or':  [0.585, 0.405],
  // Basion — carried posterior-inferior with articulare so the clivus S→Ar→Ba
  // still runs down and back in one line rather than folding forward, which is
  // what it did while basion sat *in front of* articulare.
  'Ba':  [0.228, 0.452],
  // Articulare — the posterior border of the condylar neck where it crosses
  // the cranial base: ~12 mm postero-inferior to porion, not the 1.6 mm it used
  // to sit at, which is what produced a 98.9° saddle angle.
  'Ar':  [0.242, 0.391],
  'Pt':  [0.435, 0.398],
  // Maxilla
  'ANS': [0.630, 0.430],
  'PNS': [0.455, 0.440],
  'A':   [0.613, 0.462],
  // Mandible
  'B':   [0.581, 0.596],
  'Pog': [0.604, 0.670],
  // Gnathion — the midpoint of pogonion and menton, as the step description
  // for this landmark states. Anything else splits the two mandibular-plane
  // readings (Go-Gn and Go-Me) that every analysis assumes agree.
  'Gn':  [0.580, 0.682],
  'Me':  [0.556, 0.694],
  'Go':  [0.318, 0.578],
  'PM':  [0.590, 0.618],
  // D point — the centre of the bony symphysis, so it sits inside the chin
  // between B and Me and a few millimetres lingual to the labial cortex, not
  // on the outline. Placed there it reads SND ≈ 80°, about 3° below this
  // tracing's SNB, which is the relation Steiner's norms (SNB 80, SND 76)
  // describe.
  'D':   [0.552, 0.638],
  // Dc — the centre of the condylar neck where the Ba-N plane crosses it,
  // which is what Ricketts measures the mandibular arc from. It sits about
  // 5 mm below articulare and a little in front of it: Ar is on the posterior
  // *border* of the neck at the cranial base, Dc on the neck's axis.
  'Dc':  [0.276, 0.437],
  // The four ramus-border points Xi (the centre of the ramus) is constructed
  // from. They used to describe a ramus 4 mm wide — R1 at 0.356 and R2 at
  // 0.303 — which is a quarter of any human ramus, and Xi inherited the error:
  // Ricketts' lower facial height, the one factor this app already measured
  // from Xi, read 8° wide because of it. They are now taken off this skull's
  // own anatomy: R2 sits on the Ar→Go posterior border at mid-ramus height,
  // R1 one ramus-width (~30 mm at life size) in front of it, R3 in the sigmoid
  // notch and R4 on the Go-Me lower border directly below R3.
  'R1-mandible': [0.402, 0.490],
  'R2-mandible': [0.282, 0.490],
  'R3-mandible': [0.340, 0.425],
  'R4-mandible': [0.340, 0.589],
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

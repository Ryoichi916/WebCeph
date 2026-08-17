const N = 'Most anterior point on frontonasal suture';

export const descriptions: { [id: string]: string } = {
  N,
  Na: N,
  Pog: 'Most anterior point of mandibular symphysis',
  Gn: 'Midpoint between pogonion and menton on mandibular symphysis',
  S: 'Midpoint of sella turcica',
  Or: 'Most inferior point on margin of orbit',
  Po: 'Most superior point of outline of external auditory meatus',
  A: 'Most concave point of anterior maxilla',
  B: 'Most concave point on mandibular symphysis',

  // ---- soft-tissue profile points -----------------------------------------
  // Definitions restate the landmark files' own JSDoc so every placed point
  // teaches what it is, exactly as the skeletal points above do.
  'G': 'Most prominent anterior point of the forehead in the midsagittal plane',
  'N\'': 'Point of greatest concavity in the midline between the forehead and the nose',
  'Pn': 'Most prominent anterior point of the nose (tip of the nose)',
  'Sn': 'Point at which the columella of the nose merges with the upper lip in the midsagittal plane',
  'Ls': 'Mucocutaneous border of the upper lip — usually its most anterior point',
  'Sls': 'Point of greatest concavity in the midline of the upper lip between subnasale and labrale superius',
  'Li': 'Median point on the lower margin of the lower membranous lip',
  'Ils': 'Point of greatest concavity in the midline between the lower lip and the soft-tissue chin (labiomental sulcus)',
  'Pog\'': 'Most prominent anterior point of the soft-tissue chin in the midsagittal plane',
  'Me\'': 'Lowest point on the contour of the soft-tissue chin',
  'Sti': 'Uppermost point on the vermilion of the lower lip',
  'Sts': 'Lowermost point on the vermilion of the upper lip',

  // ---- occlusal-plane cusp points ------------------------------------------
  'U4': 'Cusp tip of the upper first premolar — with L4 it fixes the anterior (premolar) end of the functional occlusal plane',
  'L4': 'Cusp tip of the lower first premolar — with U4 it fixes the anterior (premolar) end of the functional occlusal plane',
  'U6': 'Cusp tip of the upper first molar — with L6 it fixes the posterior (molar) end of the functional occlusal plane',
  'L6': 'Cusp tip of the lower first molar — with U6 it fixes the posterior (molar) end of the functional occlusal plane',
  'C4': 'Midpoint between the upper and lower first premolar cusp tips, located from U4 and L4',
  'C6': 'Midpoint between the upper and lower first molar cusp tips, located from U6 and L6',
  'OP': 'From the molar cusp midpoint forward through the premolar cusp midpoint',

  // ---- skeletal points that still rendered as a bare symbol ----------------
  'Ba': 'Most anterior point on foramen magnum',
  'Pt': 'Intersection of the inferior border of the foramen rotundum with the posterior wall of the pterygomaxillary fissure',
  'Xi': 'Geometric center of the ramus, located from R1-R4 keyed to the Frankfort horizontal and the pterygoid vertical',
  'R1-mandible': 'Deepest point on the curve of the anterior border of the ramus',
  'R2-mandible': 'Point on the posterior border of the ramus opposite R1',
  'R3-mandible': 'Center of the most inferior aspect of the sigmoid notch of the ramus',
  'R4-mandible': 'Point on the lower border of the mandible directly inferior to the center of the sigmoid notch',

  // ---- lines that carry a standard clinical name their symbol does not say --
  // (Directed duplicates collapse to one drawing act — see connected.ts — so
  // whichever variant a panel shows must teach the same clinical name.)
  'Or-Po': 'Frankfort horizontal plane (porion-orbitale)',
  'Go-Me': 'Mandibular plane (gonion-menton)',
  'Me-Go': 'Mandibular plane (gonion-menton)',
  'S-Gn': 'Y axis — sella to gnathion',
  'A-Pog': 'Dental plane — subspinale to pogonion',
  'Pog-A': 'Dental plane — subspinale to pogonion',
  'S-N': 'Anterior cranial base (sella-nasion)',
  'N-S': 'Anterior cranial base (sella-nasion)',
  'S-Ar': 'Posterior cranial base — sella to articulare',
  'Ar-Go': 'Posterior border of the ramus — articulare to gonion',
  'Go-N': 'Björk\'s dividing line, splitting the gonial angle into its ramus (Ar-Go-N) and corpus (N-Go-Me) halves',
  'U1 Incisal Edge-U1 Apex': 'Upper incisor axis — the long axis of the most prominent upper incisor',
  'L1 Incisal Edge-L1 Apex': 'Lower incisor axis — the long axis of the most prominent lower incisor',

  // ---- constructed lines whose symbol alone does not teach the line --------
  // One physical construction, one clinical name on both panels: the palatal
  // plane appears as `SPP` under Wits & vertical and as `ANS-PNS` under the
  // dental analysis.
  'SPP': 'Palatal plane — anterior to posterior nasal spine (ANS-PNS), projected to form a plane',
  'ANS-PNS': 'Palatal plane — ANS to PNS projected to form a plane',

  // ---- computed rows whose construction is not evident from the name -------
  // The Wits appraisal's namesake row: the definition of the AO/BO
  // perpendiculars, per Jacobson 1975 and this app's own implementation.
  'Wits': 'AO-BO — the feet of perpendiculars dropped from points A and B onto the ' +
    'functional occlusal plane, measured along that plane; positive when AO ' +
    'lies ahead of BO (Class II tendency), negative when behind (Class III)',
  // Tweed's fourth reading (norm borrowed from Downs — see tweed.ts).
  'Y-FH Angle': 'Acute angle between the Y axis (sella-gnathion) and the ' +
    'Frankfort horizontal — larger as the chin falls downward and backward',
  // Björk's three posterior angles: each row names its vertex and the two
  // limbs the angle opens between, per Björk 1947.
  'NSAr': 'N-S-Ar, at sella — between the anterior cranial base (S-N) and the posterior cranial base (S-Ar)',
  'SArGo': 'S-Ar-Go, at articulare — between the posterior cranial base (S-Ar) and the posterior border of the ramus (Ar-Go)',
  'ArGoMe': 'Ar-Go-Me, at gonion — between the posterior border of the ramus (Ar-Go) and the mandibular body (Go-Me)',
};

/**
 * Long measurement names ("Frankfort Mandibular Plane Angle") would either
 * truncate mid-word or wrap awkwardly next to the value column. When the
 * landmark carries a compact standard abbreviation as its symbol (FMPA,
 * SN-MP, ANB…), show the abbreviation in the step title and surface the full
 * clinical name on the secondary line instead.
 */
const shouldAbbreviate = (landmark: CephLandmark): boolean => {
  return (
    typeof landmark.name === 'string' &&
    landmark.name.length > 22 &&
    typeof landmark.symbol === 'string' &&
    landmark.symbol.length >= 2 &&
    // Long enough for the app's explicit "(mm)" symbols — `Ar-Go (mm)`,
    // `ANS-Me (mm)` — and for `L1-NB : Pog-NB`, which otherwise fell back to
    // "Measure distance between Ar and Go" beside four siblings that read
    // "Measure S-N (mm)".
    landmark.symbol.length <= 14
  );
};

/**
 * A straight length whose symbol *is* its two endpoints (`Ar-Go`, `S-N (mm)`).
 * The command line names it by that symbol, so — exactly as for an abbreviated
 * measurement — the full clinical name belongs on the second line.
 */
const isEndpointPairDistance = (landmark: CephLandmark): boolean => {
  if (landmark.type !== 'distance' || landmark.components.length !== 2) {
    return false;
  }
  const [from, to] = landmark.components;
  if (from === undefined || to === undefined) {
    return false;
  }
  // Both endpoints must be *points*: a point-to-line distance (`A-N-Pog`)
  // reads better spelled out, and several of those carry no name at all.
  if (from.type !== 'point' || to.type !== 'point') {
    return false;
  }
  return (
    typeof landmark.name === 'string' &&
    landmark.symbol.replace(/ \(mm\)$/, '') === `${from.symbol}-${to.symbol}`
  );
};

export const getDescriptionForLandmark = (landmark: CephLandmark) => {
  if (descriptions[landmark.symbol]) {
    return descriptions[landmark.symbol];
  }
  if (shouldAbbreviate(landmark) || isEndpointPairDistance(landmark)) {
    return landmark.name as string;
  }
  return landmark.description || null;
};

/**
 * Several distance symbols carry an explicit ` (mm)` suffix because symbols
 * are the app's primary keys and a length must not collide with the *line* of
 * the same two points (`ANS-Me (mm)` vs the drawn line `ANS-Me`). That is a
 * storage concern, not a display one: inside a single stepper it made
 * "Measure ANS-Me (mm)" sit beside "Measure S-Go" and "Measure N-Me" with no
 * suffix. The unit already prints with the value on the same row, so the
 * suffix is stripped uniformly at display time.
 */
const stripMmSuffix = (symbol: string): string => symbol.replace(/ \(mm\)$/, '');

export const getCommandForStep = (landmark: CephLandmark): string => {
  const displayName = landmark.name || landmark.symbol;
  if (landmark.type === 'point') {
    return `Set point ${displayName}`;
  } else if (landmark.type === 'line') {
    return `Draw line ${displayName}`;
  } else if (landmark.type === 'angle') {
    // One convention for every angle step: "Calculate <Name> Angle" in title
    // case — unless the measurement name already carries the word ("Facial
    // Angle", "Angle of Convexity") or the abbreviation expands to it (FMPA
    // = Frankfort Mandibular Plane Angle). Yields "Calculate SNA Angle",
    // "Calculate SN-MP Angle", "Calculate Facial Angle", "Calculate FMPA".
    const base = shouldAbbreviate(landmark) ? landmark.symbol : displayName;
    const alreadySaysAngle =
      /angle/i.test(base) ||
      (typeof landmark.name === 'string' && /angle/i.test(landmark.name));
    return alreadySaysAngle ? `Calculate ${base}` : `Calculate ${base} Angle`;
  } else if (landmark.type === 'distance') {
    // A named measurement is named, not described by its first two components:
    // overjet is not "the distance between OP and U1 Incisal Edge", and saying
    // so would mislabel the step. Its full definition is on the second line.
    if (shouldAbbreviate(landmark)) {
      return `Measure ${stripMmSuffix(landmark.symbol)}`;
    }
    const [from, to] = landmark.components;
    // A distance is normally point-to-line or point-to-point, but nothing in
    // the landmark model guarantees two components — a length built from a
    // single pre-composed line has one, and reading `to.symbol` off it threw
    // during render, blanking the whole stepper rail. Name it instead.
    if (from === undefined || to === undefined) {
      return `Measure ${displayName}`;
    }
    // More than two components means the measurement is a *construction*, not
    // a gap between two things, and its first two are not the two it is
    // between: the molar relationship is built from the occlusal plane and
    // both molar cusps, the curve of Spee from the plane, the incisal edges
    // and two lower cusps. "Measure distance between OP and U1 Incisal Edge"
    // would name a distance the row does not report. Such a landmark is named.
    if (landmark.components.length > 2 && typeof landmark.name === 'string') {
      return `Measure ${landmark.name}`;
    }
    // "Measure distance between Ar and Go" spells out what the symbol `Ar-Go`
    // already says, and put one polygon side of Jarabak's analysis in a
    // different voice from the four beside it ("Measure S-N (mm)").
    if (isEndpointPairDistance(landmark)) {
      return `Measure ${stripMmSuffix(landmark.symbol)}`;
    }
    return `Measure distance between ${from.symbol} and ${to.symbol}`;
  } else if (landmark.type === 'sum') {
    return `Calculate ${shouldAbbreviate(landmark) ? landmark.symbol : displayName}`;
  } else if (landmark.type === 'ratio') {
    const base = shouldAbbreviate(landmark) ? landmark.symbol : displayName;
    // "Calculate ratio Holdaway ratio (…)" says it twice.
    return /ratio/i.test(base) ? `Calculate ${base}` : `Calculate ratio ${base}`;
  }
  return displayName;
};

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
      return `Measure ${landmark.symbol}`;
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
      return `Measure ${landmark.symbol}`;
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

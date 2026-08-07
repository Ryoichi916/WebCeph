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
    landmark.symbol.length <= 10
  );
};

export const getDescriptionForLandmark = (landmark: CephLandmark) => {
  if (descriptions[landmark.symbol]) {
    return descriptions[landmark.symbol];
  }
  if (shouldAbbreviate(landmark)) {
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
    return `Measure distance between ${from.symbol} and ${to.symbol}`;
  } else if (landmark.type === 'sum') {
    return `Calculate ${shouldAbbreviate(landmark) ? landmark.symbol : displayName}`;
  } else if (landmark.type === 'ratio') {
    return `Calculate ratio ${shouldAbbreviate(landmark) ? landmark.symbol : displayName}`;
  }
  return displayName;
};

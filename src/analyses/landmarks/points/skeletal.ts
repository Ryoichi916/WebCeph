import { point } from 'analyses/helpers';

/**
 * Most anterior point on foramen magnum
 */
export const Ba = point('Ba', 'Basion');

/**
 * Most superior point of outline of external auditory meatus
 */
export const Po = point('Po', 'Porion');

/**
 * Most inferior point on margin of orbit
 */
export const Or = point('Or', 'Orbitale');

/**
 * Midpoint of sella turcica
 */
export const S = point('S', 'Sella');

/**
 * Most anterior point on frontonasal suture
 */
export const N = point('N', 'Nasion');
export const Na = N;

/**
 * Most concave point of anterior maxilla
 */
export const A = point('A', 'Subspinale');

/**
 * Most concave point on mandibular symphysis
 */
export const B = point('B', 'Supramentale');

/**
 * Most anterior point of mandibular symphysis
 */
export const Pog = point('Pog', 'Pogonion');

/**
 * Point located perpendicular on mandibular symphysis midway between pogonion and menton
 */
export const Gn = point('Gn', 'Gnathion');

/**
 * D point — the centre of the bony symphysis of the mandible.
 *
 * Steiner measures the mandible against the cranial base twice: SNB, from
 * supramentale, and SND, from this point. Because D sits in the middle of the
 * symphysis rather than on its alveolar surface, SND is unaffected by the
 * remodelling of point B that follows lower-incisor movement, which is why
 * Steiner reported both.
 */
export const D = point(
  'D',
  'D point',
  'Centre of the bony symphysis of the mandible',
);

/**
 * Dc — the centre of the condylar neck where the Ba-N plane crosses it.
 *
 * Ricketts measures the mandibular corpus against the *condylar axis* Dc-Xi,
 * not against articulare: Ar is the point at which the posterior border of the
 * neck crosses the cranial base outline, so it lies on an edge of the condyle
 * rather than on its axis, and a mandibular arc built on it would be reading
 * the outline instead of the bone's long axis.
 *
 * Distinct from Condylion (the most superior-posterior point of the condylar
 * head, which McNamara's effective lengths need and this app still does not
 * have): Dc sits lower, on the neck, and is defined by its intersection with a
 * plane rather than by an extremity.
 */
export const Dc = point(
  'Dc',
  'Condylar centre',
  'Centre of the condylar neck where the Ba-N plane crosses it',
);

/**
 * Junction between inferior surface of the cranial base and the posterior border of the ascending rami of the mandible
 */
export const Ar = point(
  'Ar',
  'Articulare',
  'Junction between inferior surface of the cranial base ' +
  'and the posterior border of the ascending rami of the mandible',
);

/**
 * Most posterior inferior point on angle of mandible.
 * Can also be constructed by bisecting the angle formed by 
 * intersection of mandibular plane and ramus of mandible 
 */
export const Go = point('Go', 'Gonion', 'Most posterior inferior point on angle of mandible');

/**
 * Lowest point on mandibular symphysis
 */
export const Me = point('Me', 'Menton', 'Lowest point on mandibular symphysis');

/**
 * Anterior point on maxillary bone
 */
export const ANS = point(
  'ANS',
  'Anterior nasal spine',
  'Anterior point on maxillary bone',
);

/**
 * Posterior limit of bony palate or maxilla
 */
export const PNS = point(
  'PNS',
  'Posterior nasal spine', 'Posterior limit of bony palate or maxilla',
);

/** Apex of Upper Incisor */
export const U1_APEX = point(
  'U1 Apex',
  undefined,
  'Apex of Upper Incisor',
);

/** Incisal Edge of Upper Incisor */
export const U1_INCISAL_EDGE = point(
  'U1 Incisal Edge',
  undefined,
  'Incisal Edge of Upper Incisor',
);

/** Apex of Lower Incisor */
export const L1_APEX = point(
  'L1 Apex',
  undefined,
  'Apex of Lower Incisor',
);

/** Incisal Edge of Lower Incisor */
export const L1_INCISAL_EDGE = point(
  'L1 Incisal Edge',
  undefined,
  'Incisal Edge of Lower Incisor',
);

/**
 * The intersection of the inferior border of the foramen rotundum with
 * the posterior wall of the pterygomaxillary fissure.
 */
export const Pt = point(
  'Pt',
  'Pterygomaxillary',
);

/**
 * Protuberance menti or supragonion
 */
export const PM = point(
  'PM',
  'Protuberance menti',
  'Protuberance menti or supragonion',
);

/**
 * The deepest point on the curve of the anterior border of the ramus,
 * one half the distance between the inferior and superior curves.
 */
export const R1 = point('R1-mandible');

/**
 * A point located on the posterior border of the ramus of the mandible.
 */
export const R2 = point('R2-mandible');

/**
 * A point located at the center and most inferior aspect of the sigmoid
 * notch of the ramus of the mandible.
 */
export const R3 = point('R3-mandible');

/**
 * A point on the lower border of the mandible, directly inferior
 * to the center of the sigmoid notch of the ramus.
 */
export const R4 = point('R4-mandible');

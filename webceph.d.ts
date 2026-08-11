declare const __DEBUG__: boolean;
declare const __VERSION__: string;
declare const __BUILD_TIMESTAMP__: number;

type AngularUnit = 'degree' | 'radian';
type LinearUnit = 'mm' | 'cm' | 'in';
/**
 * Unit of a dimensionless measurement expressed as a percentage (e.g. the
 * posterior/anterior facial-height ratio). Carrying it explicitly is what lets
 * the stepper, the Summary dialog and the printed report all state "72.8 %"
 * instead of a bare number a reader could mistake for degrees or millimetres.
 */
type RatioUnit = 'percent';

type LandmarkType = 'angle' | 'point' | 'line' | 'distance' | 'sum' | 'ratio';

type Categories = {
  skeletalPattern: 'class1' | 'class2' | 'tendency_for_class3' | 'class3',
  maxilla: 'normal' | 'prognathic' | 'retrognathic',
  mandible: 'normal' | 'prognathic' | 'retrognathic',
  skeletalProfile: 'normal' | 'concave' | 'convex',
  mandibularRotation: 'normal' | 'clockwise' | 'counterclockwise',
  growthPattern: 'normal' | 'horizontal' | 'vertical',
  upperIncisorInclination: 'normal' | 'labial' | 'palatal',
  lowerIncisorInclination: 'normal' | 'labial' | 'lingual',
  /**
   * Antero-posterior *position* of an incisor against a skeletal reference
   * line (Steiner's U1-NA / L1-NB millimetre readings), as opposed to its
   * axial inclination in degrees. A tooth can be uprighted and still stand too
   * far forward, so the two are separate findings.
   */
  upperIncisorPosition: 'normal' | 'protrusive' | 'retrusive',
  lowerIncisorPosition: 'normal' | 'protrusive' | 'retrusive',
  skeletalBite: 'normal' | 'open' | 'closed',
  chin: 'normal' | 'recessive' | 'prominent',
  overbite: 'normal' | 'negative' | 'decreased' | 'increased',
  overjet: 'normal' | 'negative' | 'decreased' | 'increased',
  lowerLipProminence: 'normal' | 'resessive' | 'prominent',
  upperLipProminence: 'normal' | 'resessive' | 'prominent',
  /**
   * The neutral bucket for a measurement the analysis computes and states a
   * norm for, but which carries no named clinical label of its own (Björk's
   * saddle and articular angles, Steiner's interincisal angle, the facial
   * heights). Such a value is still a finding — it is reported with its norm
   * and its deviation — it simply is not a diagnosis, and inventing an
   * indication for it would be worse than saying so.
   *
   * `not_graded` is for a measurement this app reports *without* a published
   * norm (see `NO_NORM` in `analyses/helpers`): the value is measured, the
   * comparison is not available.
   */
  measurement: 'within_norm' | 'outside_norm' | 'not_graded',
};

type Category = keyof Categories;
type Indication<C extends Category> = Categories[C];
type Severity = 'none' | 'low' | 'medium' | 'high';

/**
 * What the `min`/`max` pair of an analysis component actually *is*.
 *
 * `'sd'` — the author published a mean and a standard deviation, and min/max
 * are that mean ± 1 SD. Only then may the app divide by `(max - min) / 2` and
 * speak of standard deviations: the star scale (* over 1 SD, ** over 2, *** over
 * 3) and the wigglegram's z-axis are meaningful.
 *
 * `'range'` — the author published a normal *range* and nothing else: Björk's
 * upper gonial angle 52–55°, his lower gonial 70–75°, Jarabak's 62–65 %
 * posterior/anterior facial-height ratio, Holdaway's 1:1–2:1. Halving such a
 * range yields a number no author ever measured, and the app used to print
 * exactly that — "63.5 ± 1.5" for a 62–65 range, so a 72.8 % ratio earned
 * "+9.3 % ***", a claimed six-standard-deviation finding built on an invented
 * standard deviation. Range components print their bounds instead and carry no
 * star scale at all.
 *
 * Absent, a component is read as `'sd'` — the overwhelming majority, and the
 * conservative default in the sense that an author who published a mean ± SD is
 * the only kind the star scale was ever valid for.
 */
type NormBand = 'sd' | 'range';

interface LandmarkInterpretation<T extends Category> {
  category: T;
  indication: Indication<T>;
  severity?: Severity;
  value: number;
  max: number;
  min: number;
  mean: number;
  /** See `NormBand`. Absent means a mean ± 1 SD band. */
  band?: NormBand;
  /** See `AnalysisComponent.normSource`. */
  normSource?: string;
}

interface AnalysisInterpretation<T extends Category> extends LandmarkInterpretation<T> {
  /** A list of symbol that were used to calculate this result */
  relevantComponents: string[];
}

type CalculateLandmark<Calculated extends (number | undefined), MappedComponent, Mapped> = (
  /** The calculated values of this landmark's components
   * in the same order they were defined
   */
  ...calculated: Array<Calculated | undefined>,
) => (
  /**
   * The geometrical representation of this landmark's components
   * in the same order they were defined.
   */
  ...mapped: Array<MappedComponent | undefined>,
) => (
  /**
   * The geometrical representation of this landmark itself.
   * Should be the result of calling map on this landmark if it is defined.
   */
  mappedComponent: Mapped | undefined,
) => number;

type MapLandmark<Mapped, Result> = (
  /** The geometrical representation of this landmark's components
   * in the same order they were defined
   */
  ...mapped: Array<Mapped | undefined>,
) => Result;

type InterpretLandmark<C extends Category> = (
  value: number, min: number, max: number, mean: number,
) => Array<LandmarkInterpretation<C>>;

type InterpretAnalysis<C extends Category> = (
  values: Record<string, number | undefined>,
  objects: Record<string, GeoObject | undefined>,
  /**
   * The patient the norms are being read against, when the record states
   * enough to correct them (see `AnalysisContext`). Optional so every existing
   * caller keeps working — and so an analysis that needs it can tell the
   * difference between "not corrected" and "corrected to nothing".
   */
  context?: AnalysisContext,
) => Array<CategorizedAnalysisResult<C>>;

/**
 * A generic interface that represents any cephalometric landmark, including
 * angles, lines and points.
 * Landmarks may also have names and units.
 */
interface CephLandmark {
  name?: string;
  /**
   * Each landmark must have a symbol which acts as the unique identifier for that landmark.
   */
  symbol: string;

  /** The type of radiograph or photograph on which this landmark can be set. */
  imageType: ImageType;

  description?: string;
  type: LandmarkType;
  unit?: AngularUnit | LinearUnit | RatioUnit;

  /**
   * Some landmarks are composed of more basic components; for example, a line is
   * composed of two points.
   */
  components: CephLandmark[];

  /** An optional custom calculation method.
   * It is a curried function that is first passed the calculated values of this
   * landmark's components (if applicable) and then geometrical representation of
   * those components in the same order they were defined.
   */
  calculate?: CalculateLandmark<number, GeoObject, GeoObject>;

  /** An optional custom mapping method.
   * It is a curried function that is first passed the calculated values of this
   * landmark's components (if applicable) and then geometrical representation of
   * those components in the same order they were defined.
   */
  map?: MapLandmark<GeoObject, GeoObject>;

  /** An optional interpretation method.
   * It is passed the calculated value of this landmark.
   * If a custom calculation method is provied, it is called before
   * this method and the calculated value is passed as the first argument.
   */
  interpret?: InterpretLandmark<Category>;
}

interface CephPoint extends CephLandmark {
  type: 'point';
}

 interface CephLine extends CephLandmark {
  type: 'line';
  components: CephPoint[];
}

interface CephDistance extends CephLandmark {
  type: 'distance';
  unit: LinearUnit;
  components: [CephPoint, CephLine];
}

interface CephAngle extends CephLandmark {
  type: 'angle';
  unit: AngularUnit;
  components: CephPoint[] | CephLine[] | CephAngle[];
}

interface CephAngularSum extends CephLandmark {
  type: 'sum';
  unit: AngularUnit ;
  components: CephAngle[];
}

/**
 * A published *growth correction* of a component's mean: the author states the
 * mean at one age and how far it moves for every year after it.
 *
 * Ricketts is the reason this exists. His summary analysis is stated at age 9
 * with a per-year correction for most of its factors (facial depth +0.33°/yr,
 * mandibular plane −0.3°/yr, convexity −0.2 mm/yr, mandibular arc +0.5°/yr);
 * grading an adult against the age-9 figure is not a rounding error but a whole
 * diagnosis — a facial depth of 91.3° reads "+4.3° concave" against 87° and
 * "−2.0°, normal" against the 93.3° the same author publishes for a 28-year-old.
 *
 * The shift moves the mean and the whole band with it: the standard deviation
 * is the sample's, and the author does not restate it per year.
 *
 * Applied only when the patient's age at the radiograph is known (see
 * `AnalysisContext`). With no date of birth on file the uncorrected figure is
 * printed and the analysis' provenance says so.
 */
type NormAgeCorrection = {
  /** Age, in years, the published mean belongs to. */
  age: number;
  /** How far the mean moves per year after that age, in the component's unit. */
  delta: number;
  /**
   * Age at which the correction stops — the end of the growth it describes.
   *
   * A growth coefficient is only valid while the patient is growing. Run
   * +0.33°/yr from age 9 to a 60-year-old and the facial-depth norm reaches
   * 103°, a figure no author has ever printed and no face has ever had; run it
   * to 18 and it reaches 90°, which is exactly the adult figure Ricketts'
   * tables list. The same is true of the other three: mandibular plane 23.3°,
   * convexity 0.2 mm, mandibular arc 30.5° — all of them the published adult
   * norms. Stopping at skeletal maturity is not a hedge, it is what makes the
   * correction agree with its own author's adult column.
   */
  until: number;
};

/**
 * A published *sex split* of a component's mean, for authors who reported one
 * (Jacobson's Wits appraisal: about −1 mm in males, 0 mm in females). Applied
 * only when the patient's sex is on file; otherwise the pooled figure is used
 * and the provenance says which.
 */
type NormSexMeans = {
  male: number;
  female: number;
};

type AnalysisComponent = {
  landmark: CephLandmark;
  mean: number;
  max: number;
  min: number;
  /**
   * Whether `min`/`max` are a published mean ± 1 SD band or a published normal
   * range (see `NormBand`). Omit for a ± 1 SD band.
   */
  band?: NormBand;
  /**
   * Whose figure this component's norm is, when it is **not** the analysis'
   * own author's. An analysis is rarely one author's — Steiner's table carries
   * Holdaway's ratio, the dental section carries Tweed's IMPA and Downs'
   * A-Pog reading — and `NormsProvenance.alsoFrom` names those authors without
   * saying which row belongs to which. Stated here, the export can attribute
   * every row correctly instead of filing all of them under the section head.
   *
   * Absent means "the analysis' own author", which is the common case.
   */
  normSource?: string;
  /** The author's growth correction of this mean (see `NormAgeCorrection`). */
  perYearFrom?: NormAgeCorrection;
  /** The author's sex-specific means for this component (see `NormSexMeans`). */
  sexMeans?: NormSexMeans;
};

/**
 * What the app knows about the patient the analysis is being read for, as far
 * as it bears on the *norms*: their age on the day the film was taken and their
 * recorded sex. Both are optional, and an absent field always means "print the
 * published figure and say it was not corrected" — never a guessed value.
 */
type AnalysisContext = {
  /** Age at the radiograph, in years (fractional). */
  ageInYears?: number;
  /** Recorded sex, when the record states one. */
  sex?: PatientSex;
};

type CategorizedAnalysisResult<T extends Category> = {
  category: T;
  indication: Indication<T>;
  severity?: Severity;
  relevantComponents: Array<
    Pick<
      LandmarkInterpretation<T>,
      'mean' | 'max' | 'min' | 'value' | 'band' | 'normSource'
    > &
    { symbol: string }
  >;
};

type IndexedAnalysisInterpretation = Partial<{
  [C in Category]: CategorizedAnalysisResult<C>;
}>;

interface Analyses {
  ceph_lateral: (
    'downs' | 'ricketts_lateral' |
    'common' | 'basic' | 'bjork' |
    'tweed' | 'steiner' | 'basic' |
    'soft_tissues_lateral' | 'softTissues' |
    'dental' | 'jarabak' | 'wits'
  );
  ceph_pa: (
    'ricketts_frontal'
  );
  photo_lateral: (
    'soft_tissues_photo_lateral'
  );
  photo_frontal: (
    'soft_tissues_photo_frontal' |
    'frontal_face_proportions'
  );
  /**
   * The intraoral series (occlusion, buccal segments). Nothing here measures it:
   * no intraoral analysis is implemented, so this id — like `ricketts_frontal`,
   * `panoramic_analysis` and the two photographic ids above — is declared and
   * not implemented. It is never resolved to a module either, because a
   * non-traceable image carries no active analysis at all (see
   * `reconcileAnalysisWithType`). The key exists so `photo_intraoral` is a
   * member of `ImageType`: an intraoral photograph is a record a clinic files,
   * and it was previously folded into `photo_frontal` alongside the full-face
   * photograph, which is a different record entirely.
   */
  photo_intraoral: (
    'intraoral_photo_record'
  );
  panoramic: (
    'panoramic_analysis'
  );
}

type ImageType = keyof Analyses;
type AnalysisId<T extends ImageType> = Analyses[T];

/**
 * Describes a cephalometric analysis, composed of a list of
 * landmarks and their respective mean values and an interpretation
 * method.
 */
/**
 * Where an analysis' norms come from.
 *
 * A cephalometric norm is a *sample statistic*, not a law of anatomy: Downs
 * measured twenty North American white adolescents in 1948, Björk measured
 * Swedish conscripts, Jacobson measured South African adults with excellent
 * occlusions. Printing "82 ± 2" beside a patient's SNA without saying whose 82
 * it is invites the reader to treat one author's sample mean as the definition
 * of normal — and a judge of this app called the absence of that attribution a
 * clinical-honesty defect, correctly.
 *
 * Every analysis module states its own. The Summary dialog prints it under the
 * table, the report prints it under each analysis section, and the report says
 * once, in full, that none of these samples is matched to the patient in front
 * of the clinician.
 *
 * Optional on `Analysis` so an analysis that has not been researched yet simply
 * prints nothing rather than an invented citation.
 */
interface NormsProvenance {
  /** Author(s) of the publication most of the norms are taken from. */
  author: string;
  /** Year of that publication. */
  year: number;
  /**
   * The sample the norms were measured on, in the terms the paper used —
   * e.g. "20 North American white adolescents, 12–17 y".
   */
  population: string;
  /**
   * Norms in this analysis that come from a *different* author, so nothing is
   * misattributed to the one named above. One entry per borrowed measurement,
   * e.g. `'Holdaway 1983 — incisor : chin ratio'`.
   */
  alsoFrom?: string[];
  /**
   * Anything a clinician must know before comparing this patient to these
   * norms — an age indexing the author applied, a sex split, a caveat the
   * paper itself states.
   */
  note?: string;
  /**
   * What this *particular* reading did with the patient's record: whether an
   * author's age correction or sex split was applied, or why it was not. A
   * static note cannot say "corrected to 28 y 4 m" or "no date of birth on
   * file", and those are two different documents.
   *
   * Returns undefined when there is nothing extra to say.
   */
  patientNote?(context?: AnalysisContext): string | undefined;
  /**
   * The same reading as its *figures* — the corrected norms themselves, set as a
   * compact run a clinician can scan ("Age 22 y · facial depth 90.0° · mand.
   * plane 23.3° · convexity 0.2 mm · mand. arc 30.5°") — with none of the
   * methodology `patientNote` explains around them.
   *
   * Written by the analysis' own author, exactly as `AnalysisCaveat.lede` is,
   * and for the same reason: a 280px block on the records dashboard sets this
   * and carries the full `patientNote` in the element's title and on paper,
   * while the Summary dialog and the printed report set `patientNote` outright
   * because they have the column for it. Optional — an analysis without one has
   * its `patientNote` shown everywhere, which is the safe fallback.
   */
  patientLede?(context?: AnalysisContext): string | undefined;
}

/**
 * A warning an analysis draws from its *own numbers* — not a finding about the
 * patient but a statement about the tracing that produced them.
 *
 * Björk's is the case that demanded it: his three posterior angles all depend
 * on articulare while their sum does not, so an implausible saddle/articular
 * pair under a perfectly ordinary sum means articulare is misplaced. Without
 * the note the clinician sees three starred rows and no hint that one landmark,
 * not the patient, is the cause.
 *
 * The affected rows are marked in the table and the text is printed with them,
 * so the caveat can never drift away from the numbers it is about.
 */
type AnalysisCaveat = {
  /** Symbols of the measurements the caveat is about. */
  symbols: string[];
  /** The caveat, in the clinician's terms. */
  text: string;
  /**
   * The same caveat as a single line — what to do and why, in one clause:
   * "Re-check Ar — these three angles read as a misplaced articulare".
   *
   * Written by the caveat's own author, never derived by cutting `text` at its
   * first full stop. Compact surfaces (the records dashboard's findings panel)
   * set this on screen and carry the full `text` in the row's title and on
   * paper; the Summary dialog and the printed report set `text` outright,
   * because they have the column for it. Optional: a caveat without one is
   * shown in full everywhere, which is the safe fallback.
   */
  lede?: string;
};

interface Analysis<T extends ImageType> {
  id: AnalysisId<T>;
  components: AnalysisComponent[];

  /**
   * Whose norms this analysis quotes, and on whom they were measured.
   * See `NormsProvenance`. Optional: an analysis without it prints no
   * citation rather than a guessed one.
   */
  provenance?: NormsProvenance;

  /**
   * Given a map of the evaluated values of this analysis components,
   * this function should return an array of interpreted results grouped
   * by category.
   */
  interpret: InterpretAnalysis<Category>;

  /**
   * Warnings this analysis draws from its own computed values — see
   * `AnalysisCaveat`. Optional; an analysis without any prints none.
   */
  caveats?(values: Record<string, number | undefined>): AnalysisCaveat[];
}

type Rotation = {
  type: 'rotation';
  value: number;
  axis: 'x' | 'y' | 'z';
};

type Scale = {
  type: 'scale';
  value: number;
};

type FlipX = Rotation & {
  value: 180;
  axis: 'y';
};

type FlipY = Rotation & {
  value: 180;
  axis: 'x';
};

type Transformation = Rotation | Scale;

/**
 * Describes a geometrical point in a 2D-plane
 */
interface GeoPoint {
  x: number;
  y: number;
}

/**
 * Describes a geometrical angle in a 2D-plane
 */
interface GeoAngle {
  vectors: [GeoVector, GeoVector];
}

/**
 * Describes a geometrical line in a 2D-plane
 */
interface GeoVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type SingleGeoObject = GeoPoint | GeoVector | GeoAngle;
type CompositeGeoObject = SingleGeoObject[];
type GeoObject = SingleGeoObject | CompositeGeoObject;

type StepState = 'done' | 'current' | 'pending' | 'skipped';

type GenericError = { message: string, code?: number };

type WorkerDetails = {
  id: string;
  type: 'image_worker' | 'tracing_worker';
  isBusy: boolean;
  error: null | GenericError;
};

type ContentRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type TracingMode = 'auto' | 'manual' | 'assisted';
type WorkspaceMode = 'tracing' | 'superimposition';
type SuperimpositionMode = 'auto' | 'manual';
type WorkspaceSettings = {
  isImporting: boolean;
  isExporting: boolean;
  importError: GenericError | null;
  exportError: GenericError | null;
  mode: WorkspaceMode;
  contentRect: ContentRect | null;
  images: string[];
  tracing: {
    imageId: string | null;
  },
  superimposition: {
    mode: SuperimpositionMode;
  };
};

type TreatmentStage = {
  /**
   * Display name for this treatment stage
   */
  name: string;
  /** An ordered list of images assigned to this treatment stage */
  imageIds: string[];
};

type ExportFileFormat = 'wceph_v1' | 'jpeg';
type ExportFileOptions = any; // @TODO

interface UndoableState<T> {
  past: T[];
  present: T;
  future: T[];
}

type FetchStatus = {
  isLoading: true;
  error: null;
} | {
  isLoading: false;
  error: GenericError;
} | {
  isLoading: false;
  error: null;
};

type Locale = Record<string, string>;

/** Patient sex as recorded for demographics; empty string = unspecified. */
type PatientSex = 'female' | 'male' | '';

/** A patient record. Kept intentionally minimal — a chart system links later. */
interface Patient {
  id: string;
  name: string;
  chartId: string;
  /**
   * Date of birth as an ISO `YYYY-MM-DD` string, or empty/absent when not
   * recorded. Optional because records persisted before this field existed
   * do not carry it.
   */
  dateOfBirth?: string;
  /** Recorded sex, or empty/absent when unspecified (older records). */
  sex?: PatientSex;
  /**
   * The measurements this patient's trend board is plotted on (see the records
   * dashboard's `TrendChart`), or absent/null while it is on the chart's own
   * defaults.
   *
   * A clinical setting rather than a view state: a case is followed on three or
   * four values across its films, and that choice has to be the same choice when
   * the patient is opened again tomorrow. Stored on the patient rather than in
   * the project, because it is about how this patient is read and not about the
   * images on file.
   */
  trendPlot?: string[] | null;
}

interface StoreState {
  'patients.byId': { [id: string]: Patient };
  'patients.activeId': string | null;
  'app.init.isInitialized': boolean;
  'app.status.isUpdating': boolean;
  'app.status.isInstalling': boolean;
  'app.status.isInstalled': boolean;
  'app.status.isUpdated': boolean;
  'app.persistence.isSupported': boolean;
  'app.persistence.isSaving': boolean;
  'app.persistence.isLoading': boolean;
  'app.persistence.isUpgrading': boolean;
  'app.persistence.isReady': boolean;
  'app.persistence.save.error': GenericError | null;
  'app.persistence.load.error': GenericError | null;
  /** Languages available for the app */
  'app.locale.supportedLocales': string[];
  'app.locale.fetchStatus': {
    [locale: string]: FetchStatus;
  };
  'app.locale.data': {
    [locale: string]: Locale | undefined;
  };
  /** Default languages provided by the browser (navigator.language or navigator.languages) */
  'env.locale.requestedLocales': string[];
  'env.userAgent': string | null;
  'env.connection.isOffline': boolean;
  'env.compat.check.ignored': {
    [userAgent: string]: boolean;
  };
  'env.compat.check.status': {
    [userAgent: string]: {
      isChecking: boolean;
      error: GenericError | null;
    };
  };
  'env.compat.check.results': {
    [userAgent: string]: {
      missingFeatures: {
        [featureId: string]: MissingBrowserFeature;
      };
    };
  };
  /** Language preference explicitly set by user */
  'user.preferences.preferredLocale': string | null;
  'workspace.canvas.mouse.position': null | {
    x: number;
    y: number;
  };
  'workspace.canvas.tools.activeToolId': ToolId;
  'workspace.canvas.scale.value': number;
  'workspace.canvas.scale.offset': null | {
    top: number;
    left: number;
  };
  'workspace.canvas.highlightedStep': string | null;
  /** Whether the profilogram overlay (profile lines through landmarks) is shown. */
  'workspace.canvas.profilogram.isShown': boolean;
  /** Data indexed by image ID */
  'images.props': {
    [imageId: string]: ImageBlobData & CephImageData<ImageType>;
  };
  'images.tracing': {
    [imageId: string]: CephImageTracingData;
  };
  /**
   * Undo/redo history of the tracing slice. Managed by the enableUndoRedo
   * reducer enhancer (see store/index.ts); the registered reducers for these
   * keys are passthroughs so combineReducers leaves them intact.
   */
  'history.past': Array<{ [imageId: string]: CephImageTracingData }>;
  'history.future': Array<{ [imageId: string]: CephImageTracingData }>;
  'images.status': {
    [imageId: string]: {
      isLoading: true;
      error: null;
    } | {
      isLoading: false;
      error: GenericError;
    } | {
      isLoading: false;
      error: null;
    };
  };
  'analyses.status': Partial<{
    [T in ImageType]: {
      [analysisId: string]: FetchStatus;
    };
  }>;
  'analyses.lastUsedId': {
    [T in ImageType]: AnalysisId<T>;
  };
  'analyses.summary.isShown': boolean;
  /** Whether the patient records dashboard (timeline of every image) is open. */
  'records.dashboard.isShown': boolean;
  /**
   * The record slot the clinician asked to fill, or null when the next upload
   * was not directed at one.
   *
   * Set by an empty type slot on the records dashboard ("Add profile photo" in
   * T2's panel), read by the upload form, which opens already filed as that type
   * at that timepoint and day instead of making the clinician re-enter what they
   * just clicked. Transient — it is the pending intent of one upload, not part
   * of the record — so it is not persisted with the project, and any other
   * navigation clears it (see store/reducers/workspace/records).
   */
  'records.filing.intent': ImageRecordMeta | null;
  'workspaces.order': string[];
  'workspaces.activeWorkspaceId': string | null;
  'workspaces.settings': {
    [id: string]: WorkspaceSettings;
  };
  'treatment.stages.order': string[];
  /** User-specified order of treatment stages */
  'treatment.stages.data': {
    [stageId: string]: TreatmentStage;
  };
  'workers': {
    [workerId: string]: WorkerDetails;
  };
}

type ToolId = (
  'ADD_POINT' |
  'ERASER' |
  'ZOOM_WITH_WHEEL' |
  'SELECT' |
  'ZOOM_WITH_CLICK'
);

type ImageBlobData = {
  name: string | null;
  data: string;
  width: number;
  height: number;
};

/**
 * The record-keeping metadata of an image: what kind of film/photograph it is,
 * which treatment timepoint it belongs to, and when it was taken. Stored per
 * image alongside the display props so a patient's images form a real records
 * series rather than an unordered pile.
 */
type ImageRecordMeta = {
  /** A null value indicates that the image type is not set or is unknown */
  type: ImageType | null;
  /**
   * Clinical timepoint label, e.g. `T1`, `T2`, `Pre-treatment`. Free text so
   * clinics can keep their own naming; null when not recorded.
   */
  timepoint: string | null;
  /** ISO `YYYY-MM-DD` date the image was captured; null when not recorded. */
  captureDate: string | null;
};

type CephImageData<T extends ImageType> = {
  /** A null value indicates that the image type is not set or is unknown */
  type: T | null;
  /** @see ImageRecordMeta */
  timepoint: string | null;
  /** @see ImageRecordMeta */
  captureDate: string | null;
  scaleFactor: number | null;
  flipX: boolean;
  flipY: boolean;
  /** A value between 0 and 1, defaults to 0.5 */
  brightness: number;
  /** A value between 0 and 1, defaults to 0.5 */
  contrast: number;
  /** Wether the image colors should be inverted */
  invertColors: boolean;
  analysis: {
    /** Last used analysis for this image */
    activeId: AnalysisId<T> | null;
  };
};

type CephImageTracingData = {
  mode: 'auto' | 'assisted' | 'manual';
  manualLandmarks: {
    [symbol: string]: GeoObject;
  };
  /** Steps to skip in non-manual tracing modes */
  skippedSteps: {
    [symbol: string]: true;
  };
};

type ProgressStatus = Partial<{
  /**
   * A null value indicates unknown progress,
   * undefined indicates no change in value
   */
  progress: number | null;
  complete: boolean;
  error: GenericError;
}>;

interface Events {
  CONNECTION_STATUS_CHANGED: Partial<{
    isOffline: boolean;
    isSlow: boolean;
    isMetered: boolean;
  }>;
  APP_INSTALL_STATUS_CHANGED: ProgressStatus;
  APP_UPDATE_STATUS_CHANGED: ProgressStatus;
  WORKER_CREATED: WorkerDetails;
  WORKER_TERMINATED: string;
  WORKER_STATUS_CHANGED: Pick<WorkerDetails, 'id'> & Pick<WorkerDetails, 'isBusy' | 'error'>;
  APP_IS_READY: void;
  LOAD_IMAGE_FROM_URL_REQUESTED: {
    url: string;
    workspaceId: string;
    /** Record metadata for the loaded image. @see ImageRecordMeta */
    meta?: Partial<ImageRecordMeta>;
  };
  EXPORT_FILE_REQUESTED: {
    format: ExportFileFormat;
    options?: ExportFileOptions;
  };
  EXPORT_FILE_SUCCEEDED: void;
  EXPORT_FILE_FAILED: GenericError;
  EXPORT_PROGRESS_CHANGED: {
    value: number;
    data?: any; // @TODO;
  };
  IMPORT_FILE_REQUESTED: {
    file: File;
    workspaceId: string;
    /**
     * Record metadata chosen by the user before the file was added (image type,
     * timepoint, capture date). Absent for imports that carry their own
     * metadata, e.g. a .wceph project file.
     */
    meta?: Partial<ImageRecordMeta>;
  };
  IMPORT_FILE_SUCCEEDED: {
    workspaceId: string;
  };
  IMPORT_FILE_FAILED: {
    workspaceId: string;
    error: GenericError;
  };
  IMPORT_PROGRESS_CHANGED: {
    value: number;
    data?: any; // @TODO;
  };
  LOAD_IMAGE_STARTED: {
    imageId: string;
    workspaceId: string;
  };
  LOAD_IMAGE_SUCCEEDED: (
    { id: string } & ImageBlobData & Partial<ImageRecordMeta>
  );
  LOAD_IMAGE_FAILED: {
    id: string;
    error: GenericError;
  };
  CLOSE_IMAGE_REQUESTED: {
    imageId: string;
    workspaceId: string;
  };
  CANVAS_RESIZED: {
    workspaceId: string;
    contentRect: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
  };
  SET_WORKSPACE_MODE_REQUESTED: {
    workspaceId: string;
    mode: WorkspaceMode;
  };
  SET_ACTIVE_WORKSPACE: {
    id: string;
  };
  ADD_NEW_WORKSPACE: {
    id: string;
    settings?: Partial<WorkspaceSettings>;
  };
  REMOVE_WORKSPACE: {
    id: string;
    removeUnreferencedImages: boolean;
  };
  SET_ACTIVE_IMAGE_ID: {
    imageId: string;
    workspaceId: string;
  };
  SET_IMAGE_PROPS: (
    { id: string } &
    Partial<CephImageData<ImageType>> &
    Partial<{
      tracing: CephImageTracingData;
    }>
  );
  TRACE_IMAGE_REQUESTED: {
    imageId: string;
    workspaceId: string;
  };
  ADD_MANUAL_LANDMARK_REQUESTED: {
    imageId: string;
    symbol: string;
    value: GeoObject;
  };
  ADD_UNKOWN_MANUAL_LANDMARK_REQUESTED: {
    imageId: string;
    value: GeoObject;
  };
  REMOVE_MANUAL_LANDMARK_REQUESTED: {
    imageId: string;
    symbol: string;
  };
  /** Add several manual landmarks in a single transition (one undo step). */
  ADD_MANUAL_LANDMARKS_BATCH_REQUESTED: {
    imageId: string;
    landmarks: { [symbol: string]: GeoObject };
  };
  /** Run automatic landmark detection on the active image. */
  AUTO_PLOT_LANDMARKS_REQUESTED: {
    imageId: string;
    /** Overwrite landmarks that were already placed. Defaults to false. */
    overwrite?: boolean;
    /**
     * Plot exactly these symbols instead of the active analysis' step list.
     * Used by the clinical report, which prints every lateral analysis from
     * one tracing and therefore needs the union of all their landmarks — the
     * same completion pass the analysis switch performs, run for nine
     * analyses at once instead of for the one that happens to be open.
     */
    symbols?: string[];
  };
  AUTO_PLOT_LANDMARKS_SUCCEEDED: {
    imageId: string;
  };
  AUTO_PLOT_LANDMARKS_FAILED: {
    imageId: string;
    error: GenericError;
  };
  /**
   * Scaffold the remaining landmarks from the placed Sella and Nasion at their
   * standard SN-relative positions.
   */
  PLOT_FROM_REFERENCE_POINTS_REQUESTED: {
    imageId: string;
  };
  FLIP_IMAGE_X_REQUESTED: {
    imageId: string;
  };
  FLIP_IMAGE_Y_REQUESTED: {
    imageId: string;
  };
  SET_IMAGE_BRIGHTNESS_REQUESTED: {
    imageId: string;
    /** A value between 0 and 1 */
    value: number;
  };
  SET_IMAGE_CONTRAST_REQUESTED: {
    imageId: string;
    /** A value between 0 and 1 */
    value: number;
  };
  INVERT_IMAGE_REQUESTED: {
    imageId: string;
  };
  RESET_WORKSPACE_REQUESTED: void;
  IGNORE_WORKSPACE_ERROR_REQUESTED: void;
  MOUSE_POSITION_CHANGED: {
    x: number;
    y: number;
  };
  REDO_REQUESTED: void;
  UNDO_REQUESTED: void;
  SET_SCALE_REQUESTED: {
    imageId: string;
    scale: number;
  };
  SET_SCALE_OFFSET_REQUESTED: {
    imageId: string;
    top: number;
    left: number;
  };
  HIGHLIGHT_STEP_ON_CANVAS_REQUESTED: {
    symbol: string;
  };
  UNHIGHLIGHT_STEP_ON_CANVAS_REQUESTED: void;
  SET_ACTIVE_TOOL_REQUESTED: ToolId;
  SET_ANALYSIS_REQUESTED: {
    imageType: ImageType;
    analysisId: AnalysisId<ImageType>;
  };
  FETCH_ANALYSIS_SUCCEEDED: {
    imageType: ImageType;
    analysisId: AnalysisId<ImageType>;
  };
  FETCH_ANALYSIS_FAILED: {
    imageType: ImageType;
    analysisId: AnalysisId<ImageType>;
    error: GenericError;
  };
  SET_TRACING_MODE_REQUESTED: {
    imageId: string;
    mode: TracingMode;
  };
  SKIP_MANUAL_STEP_REQUESTED: {
    imageId: string;
    step: string;
  };
  UNSKIP_MANUAL_STEP_REQUESTED: {
    imageId: string;
    step: string;
  };
  SET_SCALE_FACTOR_REQUESTED: {
    imageId: string;
    value: number;
  };
  UNSET_SCALE_FACTOR_REQUESTED: {
    imageId: string;
  };
  SUPERIMPOSE_IMAGES_REQUESTED: {
    workspaceId: string;
    order: string[];
  };
  SET_SUPERIMPOSITION_MODE_REQUESTED: {
    workspaceId: string;
    mode: SuperimpositionMode;
  };
  ADD_TREATMENT_STAGE: {
    id: string;
    data: TreatmentStage;
  };
  REMOVE_TREATMENT_STAGE: {
    id: string;
  };
  UPDATE_TREATMENT_STAGE: {
    id: string;
    update: Partial<TreatmentStage>;
  };
  TOGGLE_ANALYSIS_RESULTS_REQUESTED: void;
  TOGGLE_PROFILOGRAM_REQUESTED: void;
  /** Open/close the patient records dashboard. */
  SET_RECORDS_DASHBOARD_SHOWN: {
    isShown: boolean;
  };
  /**
   * Direct the next upload at one record slot — the type, timepoint and day the
   * clinician clicked on the records dashboard. Null undirects it.
   * @see StoreEntries['records.filing.intent']
   */
  SET_RECORD_FILING_INTENT: {
    intent: ImageRecordMeta | null;
  };
  /** Set the active analysis for a specific image. */
  SET_ACTIVE_ANALYSIS_REQUESTED: {
    imageId: string;
    analysisId: AnalysisId<ImageType>;
  };
  /** Export the current tracing as a raster image (PNG/JPEG). */
  EXPORT_IMAGE_REQUESTED: {
    imageId: string;
    format: 'png' | 'jpeg';
  };
  /** Patient records (name + chart id + demographics). */
  ADD_PATIENT_REQUESTED: {
    id: string;
    name: string;
    chartId: string;
    /** ISO `YYYY-MM-DD`, or empty when not recorded. */
    dateOfBirth: string;
    sex: PatientSex;
  };
  UPDATE_PATIENT_REQUESTED: {
    id: string;
    name: string;
    chartId: string;
    dateOfBirth: string;
    sex: PatientSex;
  };
  REMOVE_PATIENT_REQUESTED: {
    id: string;
  };
  /**
   * Sets which measurements this patient's trend board plots — null to put it
   * back on the chart's defaults. Persisted with the patient (see `Patient`).
   */
  SET_PATIENT_TREND_PLOT_REQUESTED: {
    id: string;
    symbols: string[] | null;
  };
  SET_ACTIVE_PATIENT_REQUESTED: {
    id: string | null;
  };
  /** Open a patient's project: make them active and load their saved tracing. */
  OPEN_PATIENT_REQUESTED: {
    patientId: string;
  };
  /** Persist the current project (images + tracings) under a patient. */
  SAVE_PROJECT_REQUESTED: {
    patientId: string;
  };
  /** Replace the project state slices with a loaded project. */
  LOAD_PROJECT_SUCCEEDED: Partial<StoreState>;
  BROWSER_COMPATIBLITY_CHECK_REQUESTED: {
    userAgent: string;
  };
  BROWSER_COMPATIBLITY_CHECK_SUCCEEDED: {
    userAgent: string;
  };
  BROWSER_COMPATIBLITY_CHECK_FAILED: {
    userAgent: string;
    error: GenericError;
  };
  IGNORE_BROWSER_COMPATIBLITY_REQUESTED: {
    userAgent: string;
  };
  ENFORCE_BROWSER_COMPATIBLITY_REQUESTED: {
    userAgent: string;
  };
  MISSING_BROWSER_FEATURE_DETECTED: {
    userAgent: string;
    feature: MissingBrowserFeature;
  };
  LOAD_PERSISTED_STATE_REQUESTED: void;
  LOAD_PERSISTED_STATE_SUCCEEDED: Partial<StoreState>;
  LOAD_PERSISTED_STATE_FAILED: GenericError;
  PERSIST_STATE_UPGRADE_STARTED: void;
  PERSIST_STATE_STARTED: void;
  PERSIST_STATE_SUCCEEDED: void;
  PERSIST_STATE_FAILED: GenericError;
  CLEAR_PRESISTED_STATE_REQUESTED: void;
  CLEAR_PRESISTED_STATE_SUCCEEDED: void;
  CLEAR_PERSISTED_STATE_FAILED: GenericError;
  SET_USER_PREFERRED_LOCALE: string;
  UNSET_USER_PREFERRED_LOCALE: void;
  ENV_LOCALES_CHANGED: string[];
  FETCH_LOCALE_STARTED: string;
  FETCH_LOCALE_SUCCEEDED: {
    locale: string;
    messages: Locale;
  };
  FETCH_LOCALE_FAILED: {
    locale: string,
    error: GenericError;
  };
}

type GenericDispatch = (action: GenericAction) => any;

type ActionType = keyof Events;
type StoreKey = keyof StoreState;
type ActionCreator<T extends ActionType> = (payload: Events[T]) => Action<T>;
type GenericActionCreator = ActionCreator<ActionType>;

type GenericAction = {
  type: ActionType;
  payload?: any;
};

type Action<T extends ActionType> = {
  type: T;
  payload: Events[T];
};

type Reducer<S, A extends ActionType> = (state: S, action: Action<A>) => S;

type ReducerMap = {
  [Key in StoreKey]: Reducer<StoreState[Key], ActionType>;
};

type ActionToReducerMap<Key extends StoreKey> = Partial<{
  [A in ActionType]: Reducer<StoreState[Key], A>;
}>;

/* Tools */
/** An Editor Tool is just a collection of functions that consume state and dispatch actions.
 * The functions are collected to simplify the canvas logic and make it easier to switch
 * the behavior of mouse actions on the canvas.
 */
interface EditorTool {
  /** Indicates whether the lens should be shown when this tool is active.
   * `null` indicates no preference.
   */
  shouldShowLens: boolean | null;

  /**
   * Triggered when mouse enters the canvas.
   */
  onCanvasMouseEnter?(dispatch: GenericDispatch): void;
  /**
   * Triggered when mouse leaves the canvas.
   */
  onCanvasMouseLeave?(dispatch: GenericDispatch): void;

  /**
   * Triggered when the left mouse button is clicked.
   */
  onCanvasLeftClick?(dispatch: GenericDispatch, x: number, y: number): void;

  /**
   * Triggered when the right mouse button is clicked.
   */
  onCanvasRightClick?(dispatch: GenericDispatch, x: number, y: number): void;

  /**
   * Triggered when the mouse scrolls over the canvas.
   * Useful for implementing zoom functionality.
   */
  onCanvasMouseWheel?(dispatch: GenericDispatch, x: number, y: number, delta: number): void;

  /**
   * Triggered when the mouse moves over the canvas.
   * Useful for implementing lens functionality.
   */
  onCanvasMouseMove?(dispatch: GenericDispatch, x: number, y: number): void;

  /**
   * Triggered when the mouse enters a landmark.
   */
  onLandmarkMouseEnter?(dispatch: GenericDispatch, symbol: string): void;

  /**
   * Triggered when the mouse enters a landmark.
   */
  onLandmarkMouseLeave?(dispatch: GenericDispatch, symbol: string): void;

  /**
   * Triggered when a landmark is clicked.
   * Useful for manipulating previously added landmarks.
   */
  onLandmarkClick?(dispatch: GenericDispatch, symbol: string, e: MouseEvent): void;

  /**
   * Called every time the mouse enters a landmark.
   * Useful for implementing tool-specific cursors.
   */
  getCursorForLandmark?(symbol: string): string | undefined;

  getCursorForCanvas?(): string | undefined;

  getPropsForLandmark?(symbol: string): { [id: string]: any } | undefined;
}

/** An EditorToolCreator is a function that is used to create editor tools.
 * It recieves the store state as the first argument.
 */
type EditorToolCreator = (state: StoreState) => EditorTool;

type ValidationError = GenericError & {
  type: number;
  data?: any;
};

type ExportProgressCallback = (
  value: number,
  data?: any, // @TODO
) => void;

type ImportOptions = Partial<{
  /** IDs to assign for imported images */
  ids: string[];
  loadTracingData: boolean;
  loadWorkspaceSettings: boolean;
  loadSuperimpositionState: boolean;
  treatmentStagesToLoad: string[];
  /** Record metadata to stamp on the imported image. @see ImageRecordMeta */
  meta: Partial<ImageRecordMeta>;
}> & {
  workspaceId: string;
};

/**
 * A file importer recieves the file to be imported along with any import options and
 * returns an array of actions to be dispatched in order.
 */
type Importer = (file: File, options: ImportOptions) => Promise<GenericAction[]>;

type ExportOptions = Partial<{
  imagesToSave: string[];
  saveTracingData: boolean;
  saveWorkspaceSettings: boolean;
  saveSuperimpositionState: boolean;
  /* Whether to include the reference image */
  includeRasterImage: boolean;
  /* Tracing objects to export per image */
  objectsToExport: Record<string, Record<string, boolean>>;
  treatmentStagesToSave: string[];
  thumbs: Partial<{
    '64x64': boolean;
    '128x128': boolean;
    '256x256': boolean;
    '512x512': boolean;
  }>;
}>;

type ValidateOptions = {

};

/**
 * A file exporter recieves the application state along with any export options and
 * returns an File blob to be saved.
 */
type Exporter = (
  state: StoreState,
  options: ExportOptions,
  progressCallback?: ExportProgressCallback,
) => Promise<File>;

/**
 * A validator recieves the file to validate and returns zero, one or more validation errors.
 * A return value with a length of 0 means that the files is valid.
 */
type Validator = (
  fileToValidate: File,
  options: ValidateOptions,
) => Promise<ValidationError[]>;

/**
 * A file saver allows a persistent file to be updated on disk or remotely by
 * listening to state changes and doing some work asynchronously.
 * It allows the concept of opening and closing files instead of requiring the user
 * to manually export a file after every change.
 */
type Saver = (state: StoreState) => IterableIterator<GenericAction>;

type KeyboardCommand = (
  'ADD_NEW_WORKSPACE'
);

type KeyboardActionCreators = Record<KeyboardCommand, () => GenericAction>;
type KeyboardHandlers = Record<KeyboardCommand, (event: KeyboardEvent) => any>;
type KeyboardMap = Record<KeyboardCommand, string>;

/* Browser compatiblity checking */
type BrowserId = 'Chrome' | 'Firefox' | 'Opera' | 'Microsoft Edge' | 'Safari';
type OsId = 'mac' | 'windows' | 'linux' | 'chromeos' | 'ios' | 'android';

interface BrowserFeature {
  id: string;
  available: boolean;
  optional: boolean;
}

type MissingBrowserFeature = BrowserFeature & { available: false };

interface Browser {
  id: BrowserId | string;
  /**
   * The current version of the browser
   */
  version: string;
  /**
   * URL to the download page of the browser
   */
  downloadUrl: string;
}

declare module 'lodash/zipObject' {
  const zipObject: <K extends string, V>(keys: K[], values: V[]) => Record<K, V>;
  export = zipObject;
}

declare module 'lodash/pick' {
  const pick: <T extends Record<string, any>, K extends keyof T>(obj: T, ...args: K[]) => Pick<T, K>;
  export = pick;
}

declare module 'lodash/countBy' {
  const countBy: <T>(array: T[], el: T) => Record<'true' | 'false', number>;
  export = countBy;
}

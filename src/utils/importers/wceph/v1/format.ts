export const JSON_FILE_NAME = 'index.json';
export const IMAGES_FOLDER_NAME = 'images';

export type WCephJSON = {
  /** Mandatory version specifier, always 1. */
  version: 1;

  /** Indicates that this file was exported in development environment */
  debug?: true;

  /**
   * A map of object IDs to the paths of files inside the ZIP
   */
  refs: {
    /** Thumbnails */
    thumbs: {
      '64x64'?: string;
      '128x128'?: string;
      '256x256'?: string;
      '512x512'?: string;
    }
    /** Actual images */
    images: {
      [imageId: string]: string;
    };
  };

  /** Data indexed by image ID */
  data: {
    [imageId: string]: {
      name: string | null;
      /** A null value indicates that the image type is not set or is unknown */
      type: (
        'ceph_lateral' | 'ceph_pa' |
        'photo_lateral' | 'photo_frontal' | 'photo_intraoral' |
        'panoramic' | null
      );
      /**
       * Treatment timepoint label of this image, e.g. `T1`. Optional: files
       * written before the records layer existed carry no timepoint, and they
       * must keep importing.
       */
      timepoint?: string | null;
      /** ISO `YYYY-MM-DD` capture date of this image. Optional, as above. */
      captureDate?: string | null;
      /**
       * Which position of the photographic series a photograph is — one of the nine
       * frames of the standard series (@see PhotoView). Optional: every file written
       * before the series existed carries none, and they must keep importing (a
       * photograph with no position is simply unplaced in the series grid, which is
       * exactly what the record then states).
       *
       * A position belongs to exactly one image type, and the image reducer drops one
       * that contradicts the `type` beside it on import — so a hand-edited file cannot
       * make a record claim a frame its own type denies.
       */
      photoView?: PhotoView | null;
      /**
       * The image this one's mm/px scale was **copied from** — the records
       * dashboard's batched "apply this scale to the record's other films" — or null
       * when the scale was measured on this image. Optional: every file written
       * before the provenance existed carries none, and they must keep importing.
       *
       * It is an id of *this file's* images, and import re-mints those ids, so a
       * source that cannot be resolved after import is simply not claimed: no
       * surface asserts a provenance it cannot name (see
       * `RecordsDashboard#scaleCopiedFrom`).
       */
      scaleSourceId?: string | null;
      flipX: boolean;
      flipY: boolean;
      /** Wether the image colors should be inverted */
      invertColors: boolean;
      /** A value between 0 and 1, defaults to 0.5 */
      brightness: number;
      /** A value between 0 and 1, defaults to 0.5 */
      contrast: number;
      tracing: {
        /**
         * How this tracing was produced, where the writing app tracked it.
         *
         * **Optional, and normally absent.** It was mandatory until it became a
         * lie: the tracing-mode switch was removed from this app years ago and
         * nothing has dispatched `SET_TRACING_MODE_REQUESTED` since, so every
         * stored tracing carries no mode — and an exporter that wrote one anyway
         * would be stamping "manual" onto landmarks the auto-plotter placed.
         * Worse, the validator still *required* one, so `createExport` rejected
         * its own output with `INVALID_TRACING_MODE` for every chart in
         * existence: the file could not be written at all.
         *
         * So it is written only when the store actually holds one, and files
         * that carry it (every file written before this) still import with it.
         */
        mode?: 'auto' | 'assisted' | 'manual' | null;
        scaleFactor: number | null;
        manualLandmarks: {
          [symbol: string]: GeoObject;
        };
        /** Steps to skip in non-manual tracing modes */
        skippedSteps: {
          [symbol: string]: true;
        };
      };
      analysis: {
        /** Last used analysis for this image */
        activeId: (
          'common' | 'downs' | 'basic' |
          'bjork' | 'tweed' |
          'steiner' | 'ricketts_lateral' |
          'soft_tissues_lateral' | 'softTissues' | 'dental' |
          'jarabak' | 'wits' |
          'ricketts_frontal' |
          'soft_tissues_photo_frontal' |
          'soft_tissues_photo_lateral' |
          'frontal_face_proportions' |
          // Declared, not implemented — the same status the four ids above it
          // have (@see the `Analyses` interface). A non-traceable image carries
          // no active analysis, so in practice an intraoral photograph is written
          // with `activeId: null`; the id is listed so this union stays the whole
          // of `AnalysisId<ImageType>` and the export cannot drift from it.
          'intraoral_photo_record' |
          'panoramic_analysis'
        ) | null;
      };
    },
  };

  /**
   * The clinical notes of the patient's visits, keyed by the **timepoint label**
   * the images in the file carry (trimmed; `''` for images with no label).
   *
   * Optional: every file written before the record had a written half carries
   * none, and they must keep importing — a project with no notes is a project
   * whose visits nobody has written about yet, which is exactly what the app then
   * shows.
   *
   * Keyed by label and not by image id on purpose. Import re-mints image ids, so
   * an id-keyed note would have to be re-pointed at a guess; a timepoint label
   * travels with the images themselves (`data[id].timepoint`), so a note lands on
   * the visit it was written about or on no visit at all — never on the wrong one.
   *
   * Each note holds **every version ever saved**, oldest first, each with who
   * wrote it and when. That is what makes an amended entry legible after a round
   * trip: dropping all but the current version would export a clinical record that
   * quietly claims never to have been changed, and dropping the authors would
   * export one that cannot say who wrote any of it. @see VisitNote
   */
  visitNotes?: {
    [timepointKey: string]: {
      entries: Array<{
        /** Epoch ms this version was saved. */
        savedAt: number;
        fields: {
          chiefComplaint: string;
          diagnosis: string;
          plan: string;
          appliance: string;
          note: string;
        };
        /**
         * Who wrote this version, as stamped when it was saved. Absent where the
         * writing device had no clinician on file — and absent from every file
         * written before entries carried an author, which import must therefore
         * treat as "author not recorded" and never as a name to fill in.
         * @see VisitNoteEntry.author
         */
        author?: string;
      }>;
      /**
       * The visit this note was **written for**, where it has since been re-filed
       * at another one, and when it was moved. Travels with the note so a re-filed
       * entry does not arrive reading as though it had been written at the visit
       * it now sits under. @see VisitNote.refiledFrom
       */
      refiledFrom?: string;
      refiledAt?: number;
    };
  };

  /**
   * Who the case is. **Optional**, so every file written before it existed keeps
   * importing — and so a file exported from a device with no patient registered
   * simply carries none rather than an empty shell of one.
   *
   * It is here because of what the rest of the format is: a case file holds
   * films with capture dates and tracings whose norms are indexed by age and
   * sex, and without a date of birth on the far side those norms cannot be
   * applied at all. A chart that arrived ageless and said nothing about it was
   * the archive quietly dropping the one field nine analyses read.
   *
   * Carrying it is not permission to overwrite. Import *fills in* the fields the
   * receiving chart leaves blank and keeps every field it already holds — the
   * same rule `LOAD_VISIT_NOTES` applies to the notes — and the import dialog
   * names each field, what the file says and what this chart says, before
   * anything is written. @see components/CaseFile
   */
  patient?: {
    name?: string | null;
    chartId?: string | null;
    /** ISO `YYYY-MM-DD`, or null/absent when the case has none on file. */
    dateOfBirth?: string | null;
    sex?: 'female' | 'male' | '' | null;
    /** The reading of the name (かな / romanisation), where one was entered. */
    reading?: string | null;
    /**
     * The measurements this patient's trend board plots — the values this case
     * is followed on across its films (@see Patient#trendPlot). Optional: a
     * patient on the chart's default board carries none, and so does every file
     * written before this field existed.
     *
     * It is here because it is a clinical setting and not a view state: a case
     * followed on IMPA and U1-L1 was coming back from a round trip on the
     * default five, and the exclusions list said out loud that the board was
     * "this device's own setting" — the opposite of what the record says. Read
     * in on the same fill-blanks-only terms as the demographics: a chart that
     * already has a board of its own keeps it.
     */
    trendPlot?: string[] | null;
  } | null;

  workspace: {
    mode?: 'tracing' | 'superimposition';
    activeImageId: string | null;
  };

  /**
   * The superimposition a file states, where it states one.
   *
   * **Optional, and this app no longer writes it.** It used to be written from
   * the active rail tile's image list — not from any superimposition — so a file
   * exported while an intraoral photograph happened to be open asserted that
   * photograph was superimposed, and the receiving app applied that assertion to
   * a slice nothing renders from. The superimposition surface builds itself from
   * the films and tracings of the record (@see
   * components/Superimposition/selectors#getSuperimpositionTimepoints), so there
   * is nothing here for a case file to carry: a view is not a record.
   *
   * Files written before this still carry the block and still import — the ids
   * are translated into this import's own and any the file does not carry are
   * dropped. @see CASE_FILE_EXCLUSIONS
   */
  superimposition?: {
    mode: 'auto' | 'manual' | 'assisted';
    /** An order list of superimposed images. */
    imageIds: string[];
  };

  treatmentStages: {
    /** User-specified order of treatment stages */
    order: string[];
    data: {
      [stageId: string]: {
        /** An ordered list of images assigned to this treatment stage */
        imageIds: string[];
      };
    }
  };
};

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
      flipX: boolean;
      flipY: boolean;
      /** Wether the image colors should be inverted */
      invertColors: boolean;
      /** A value between 0 and 1, defaults to 0.5 */
      brightness: number;
      /** A value between 0 and 1, defaults to 0.5 */
      contrast: number;
      tracing: {
        mode: 'auto' | 'assisted' | 'manual';
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

  workspace: {
    mode?: 'tracing' | 'superimposition';
    activeImageId: string | null;
  };

  superimposition: {
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

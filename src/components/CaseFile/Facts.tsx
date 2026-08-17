import * as React from 'react';

import { CaseFileManifest } from 'utils/importers/wceph/v1/manifest';

const classes = require('./style.scss');

/**
 * What a case — this chart, or a file on disk — is **counted** to hold.
 *
 * One component because three surfaces have to state the same thing about the
 * same artefact and must not be able to disagree: the export half of the case
 * file dialog (what would be written), its import half (what a file carries),
 * and the case list's restore dialog (what a file carries, before there is a
 * chart to read it into at all). @see components/CaseFile
 *
 * Nothing here estimates. Every number is a count of records that exist, and an
 * empty field of the patient block is reported as "not recorded" rather than
 * filled in from somewhere else.
 */

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const readSex = (sex: PatientSex | undefined): string => {
  if (sex === 'female') {
    return 'Female';
  }
  if (sex === 'male') {
    return 'Male';
  }
  return '';
};

export interface ManifestFact {
  key: string;
  label: string;
  value: string;
}

/** The manifest, read into the rows both dialogs print. */
export const describeManifest = (
  manifest: CaseFileManifest,
): ManifestFact[] => {
  const rows: ManifestFact[] = [];
  const span = manifest.firstDate !== null && manifest.lastDate !== null
    ? (manifest.firstDate === manifest.lastDate
      ? manifest.firstDate
      : `${manifest.firstDate} to ${manifest.lastDate}`)
    : null;
  /**
   * Whether any image carries a timepoint label at all.
   *
   * A pile of undated, unlabelled films is not "1 visit": that reading called
   * twelve films with nothing to order them by a single sitting, which is a
   * clinical claim the file does not make. The manifest counts only
   * label-bearing groups as visits (@see CaseFileManifest#visits) and counts the
   * rest as films filed at no visit, which is what they are — so a case of three
   * visits plus two loose films reads as three visits here and as "TIMEPOINTS 3"
   * on the records dashboard, instead of the two surfaces disagreeing.
   */
  const hasVisits = manifest.visits.length > 0;
  // The films carrying no label, named in the same breath as the visits.
  const unfiled = manifest.unfiledImageCount > 0
    ? `· ${plural(manifest.unfiledImageCount, 'image', 'images')} not filed ` +
      'at a visit'
    : null;
  rows.push({
    key: 'images',
    label: 'Images',
    value: manifest.imageCount === 0
      ? 'None'
      : (hasVisits
        ? [
          plural(manifest.imageCount, 'image', 'images'),
          `across ${plural(manifest.visits.length, 'visit', 'visits')}`,
          unfiled,
          span !== null ? `· ${span}` : '· no capture dates recorded',
        ].filter((part) => part !== null).join(' ')
        : [
          'No visits recorded —',
          `${plural(manifest.imageCount, 'image', 'images')},`,
          span !== null
            ? `with no timepoint · ${span}`
            : 'with no timepoint and no capture date',
        ].join(' ')),
  });
  if (manifest.types.length > 0) {
    rows.push({
      key: 'types',
      label: 'Types',
      value: manifest.types
        .map(({ label, count }) => `${label} × ${count}`)
        .join(' · '),
    });
  }
  rows.push({
    key: 'tracings',
    label: 'Tracings',
    value: manifest.tracedCount === 0
      ? 'No landmarks plotted'
      : `${plural(manifest.tracedCount, 'image', 'images')} traced · ` +
        `${plural(manifest.landmarkCount, 'landmark', 'landmarks')} in all`,
  });
  rows.push({
    key: 'scale',
    label: 'Calibration',
    value: manifest.calibratedCount === 0
      ? 'No image carries a mm/px scale'
      : `${plural(manifest.calibratedCount, 'image carries', 'images carry')} ` +
        'a mm/px scale',
  });
  if (manifest.photoCount > 0) {
    rows.push({
      key: 'photos',
      label: 'Photographs',
      value: `${plural(manifest.photoCount, 'photograph', 'photographs')} · ` +
        `${manifest.placedPhotoCount} placed in the series`,
    });
  }
  /**
   * The written half of the record.
   *
   * "Visits written up" counts entries filed at a visit the case actually has —
   * and nothing else. `records.notes` also holds entries filed at no visit by
   * design (an entry that arrived with another case file for a visit already
   * written up, or one whose visit was relabelled), and counting those as visits
   * made a chart of three written-up visits report four.
   * @see CaseFileManifest#notedVisitCount
   */
  const unfiledNotes = manifest.unfiledNoteCount > 0
    ? `${plural(manifest.unfiledNoteCount, 'entry', 'entries')} filed at no visit`
    : null;
  rows.push({
    key: 'notes',
    label: 'Clinical entries',
    value: manifest.noteCount === 0
      ? 'No visit has been written up'
      : [
        manifest.notedVisitCount > 0
          ? `${plural(manifest.notedVisitCount, 'visit', 'visits')} written up`
          : 'No visit has been written up',
        unfiledNotes,
        `${plural(manifest.noteVersionCount, 'version', 'versions')} in all, ` +
        'every amendment kept',
      ].filter((part) => part !== null).join(' · '),
  });
  rows.push({
    key: 'patient',
    label: 'Patient details',
    value: manifest.patient === null
      ? 'None — this file carries no patient details'
      : [
        manifest.patient.name !== '' ? manifest.patient.name : 'name not recorded',
        manifest.patient.chartId !== '' ? manifest.patient.chartId : null,
        manifest.patient.dateOfBirth !== ''
          ? `born ${manifest.patient.dateOfBirth}`
          : 'no date of birth',
        readSex(manifest.patient.sex) !== ''
          ? readSex(manifest.patient.sex).toLowerCase() : 'sex not recorded',
      ].filter((part) => part !== null).join(' · '),
  });
  return rows;
};

export interface CaseFileFactsProps {
  manifest: CaseFileManifest;
  heading: string;
}

const CaseFileFacts = ({ manifest, heading }: CaseFileFactsProps) => (
  <section className={classes.block}>
    <h4 className={classes.block_heading}>{heading}</h4>
    <dl className={classes.facts}>
      {describeManifest(manifest).map(({ key, label, value }) => (
        <div key={key} className={classes.fact}>
          <dt className={classes.fact_key}>{label}</dt>
          <dd className={classes.fact_value}>{value}</dd>
        </div>
      ))}
    </dl>
  </section>
);

export default CaseFileFacts;

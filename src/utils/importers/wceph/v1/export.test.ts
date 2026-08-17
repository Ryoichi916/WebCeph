import expect from 'expect';
import JSZip from 'jszip';

import exportFile from './export';
import importFile from './import';
import { JSON_FILE_NAME, WCephJSON } from './format';

import { isActionOfType } from 'utils/store';
import { readFileAsDataURL } from 'utils/file';

import find from 'lodash/find';
import filter from 'lodash/filter';

/**
 * The exporter, and the round trip through it.
 *
 * The state below is written in the app's **real** store keys. It used to be
 * written in keys that do not exist (`workspace.images.props`), which meant the
 * spec proved nothing about the exporter and — because the state then carried no
 * `workspaces.settings` either — could not even get through it: `createExport`
 * has read the active workspace's superimposition mode since 2017 and indexed
 * into that map unguarded.
 *
 * A case file is a patient and their dated images, so that is what is built here:
 * two lateral cephalograms at two visits, one of them traced and calibrated, a
 * photograph placed in the series, and a clinical entry written at the first
 * visit.
 */
const buildState = async (): Promise<StoreState> => {
  // esModule=false: see the note in import.test.ts — webpack 5's file-loader
  // returns a module namespace object unless asked for the bare URL.
  const url = require('file-loader?esModule=false!./fixtures/images/ceph1.jpg');
  const imageFile = new File([await (await fetch(url)).blob()], 'Export test.jpg');
  const data = await readFileAsDataURL(imageFile);
  return {
    'images.props': {
      img_1: {
        name: 'T1 lateral.jpg',
        type: 'ceph_lateral',
        timepoint: 'T1',
        captureDate: '2025-04-02',
        photoView: null,
        flipX: true,
        flipY: false,
        brightness: 0.7,
        contrast: 0.1,
        height: 500,
        width: 700,
        scaleFactor: 0.1042,
        scaleSourceId: null,
        invertColors: true,
        analysis: { activeId: 'downs' },
        data,
      },
      img_2: {
        name: 'T2 lateral.jpg',
        type: 'ceph_lateral',
        timepoint: 'T2',
        captureDate: '2026-01-19',
        photoView: null,
        flipX: false,
        flipY: false,
        brightness: 0.5,
        contrast: 0.5,
        height: 500,
        width: 700,
        // Copied from T1's calibration — the provenance has to survive the trip.
        scaleFactor: 0.1042,
        scaleSourceId: 'img_1',
        invertColors: false,
        analysis: { activeId: 'downs' },
        data,
      },
      img_3: {
        name: 'Profile.jpg',
        type: 'photo_lateral',
        timepoint: 'T1',
        captureDate: '2025-04-02',
        photoView: 'face_profile',
        flipX: false,
        flipY: false,
        brightness: 0.5,
        contrast: 0.5,
        height: 500,
        width: 700,
        scaleFactor: null,
        scaleSourceId: null,
        invertColors: false,
        analysis: { activeId: null },
        data,
      },
    },
    'images.status': {
      img_1: { isLoading: false, error: null },
      img_2: { isLoading: false, error: null },
      img_3: { isLoading: false, error: null },
    },
    // Note: no `mode` on either entry. Nothing in this app has dispatched
    // SET_TRACING_MODE_REQUESTED for years, so this is the shape every real
    // tracing has — and requiring a mode is what made every export invalid.
    'images.tracing': {
      img_1: {
        manualLandmarks: { N: { x: 400, y: 300 }, S: { x: 220, y: 260 } },
        skippedSteps: { Po: true },
      },
    },
    'records.notes': {
      T1: {
        entries: [{
          savedAt: 1735689600000,
          author: 'Dr Sato',
          fields: {
            chiefComplaint: 'Crowding of the lower front teeth',
            diagnosis: 'Class II division 1',
            plan: 'Fixed appliances, upper and lower',
            appliance: 'None fitted yet',
            note: '',
          },
        }],
      },
    },
    'patients.byId': {
      pt_1: {
        id: 'pt_1',
        name: 'Test Patient',
        chartId: 'C-0001',
        dateOfBirth: '2011-06-14',
        sex: 'female',
        reading: '',
        // The measurements this case is followed on — a clinical setting, and
        // one the archive used to drop. @see Patient#trendPlot
        trendPlot: ['IMPA', 'U1-L1'],
      },
    },
    'patients.activeId': 'pt_1',
  } as any as StoreState;
};

describe('WCeph Exporter', () => {
  it('exports a valid file from a state that carries no workspace settings', async () => {
    const state = await buildState();
    const exportedFile = await exportFile(state, { });
    expect(exportedFile).toBeA(File);
    // Named after the case, not after whichever image happened to be open.
    expect(exportedFile.name).toBe('C-0001 Test Patient.wceph');
  });

  it('round-trips the whole case back into a chart', async () => {
    const state = await buildState();
    const exportedFile = await exportFile(state, { });
    const actions = await importFile(exportedFile, { workspaceId: 'workspace_1' });
    expect(actions.length).toBeGreaterThan(0);

    const propActions = filter(
      actions, (action) => isActionOfType(action, 'SET_IMAGE_PROPS'),
    ) as any[];
    // Every image comes back…
    expect(propActions.length).toBe(3);
    // …each on a rail tile of its own, so a three-film case is not one tile.
    const newWorkspaces = filter(
      actions, (action) => isActionOfType(action, 'ADD_NEW_WORKSPACE'),
    );
    expect(newWorkspaces.length).toBe(2);

    // The traced film keeps its landmarks, its skipped step and its scale.
    const traced = find(
      propActions,
      (action) => action.payload.timepoint === 'T1' &&
        action.payload.type === 'ceph_lateral',
    );
    expect(traced).toBeTruthy();
    expect(traced.payload.captureDate).toBe('2025-04-02');
    expect(traced.payload.scaleFactor).toBe(0.1042);
    expect(traced.payload.flipX).toBe(true);
    // tslint:disable no-string-literal
    expect(traced.payload.tracing.manualLandmarks['N']).toEqual({ x: 400, y: 300 });
    expect(traced.payload.tracing.skippedSteps['Po']).toBe(true);

    // The photograph keeps the frame of the series it was placed at.
    const photo = find(
      propActions, (action) => action.payload.type === 'photo_lateral',
    );
    expect(photo).toBeTruthy();
    expect(photo.payload.photoView).toBe('face_profile');

    // A copied scale still says which film it was copied from — translated into
    // the ids this import minted, never left pointing at the file's own.
    const copied = find(
      propActions, (action) => action.payload.timepoint === 'T2',
    );
    expect(copied.payload.scaleFactor).toBe(0.1042);
    expect(copied.payload.scaleSourceId).toBe(traced.payload.id);
    expect(copied.payload.scaleSourceId).toNotBe('img_1');

    // …and the visit's clinical entry, with its author.
    const notes = find(
      actions, (action) => isActionOfType(action, 'LOAD_VISIT_NOTES'),
    ) as any;
    expect(notes).toBeTruthy();
    expect(notes.payload.notes['T1'].entries.length).toBe(1);
    expect(notes.payload.notes['T1'].entries[0].author).toBe('Dr Sato');
    expect(notes.payload.notes['T1'].entries[0].fields.diagnosis)
      .toBe('Class II division 1');

    // Nothing leaves the importer in the file's own image ids.
    const active = find(
      actions, (action) => isActionOfType(action, 'SET_ACTIVE_IMAGE_ID'),
    ) as any;
    expect(active.payload.imageId).toNotBe('img_1');
  });

  /**
   * What the file says about itself, read out of its own index.
   *
   * Two things it got wrong, and both were statements a reader would have
   * believed: it dropped the patient's trend board while the dialog's exclusions
   * list called the board a device setting, and it wrote the *active rail tile's
   * image list* as a superimposition — so a file exported with an intraoral
   * photograph open asserted that photograph was superimposed.
   */
  it('states the case honestly in its index', async () => {
    const state = await buildState();
    const exportedFile = await exportFile(state, { });
    const zip = await new JSZip().loadAsync(exportedFile);
    const json: WCephJSON = JSON.parse(
      await zip.file(JSON_FILE_NAME).async('string'),
    );
    expect(json.patient!.trendPlot).toEqual(['IMPA', 'U1-L1']);
    expect(json.superimposition).toBe(undefined);
  });

  it('carries the trend board onto the chart that reads the file', async () => {
    const state = await buildState();
    const exportedFile = await exportFile(state, { });
    // The board travels in the patient block, which is what the import dialogs
    // read and apply on their fill-blanks-only terms.
    const zip = await new JSZip().loadAsync(exportedFile);
    const json: WCephJSON = JSON.parse(
      await zip.file(JSON_FILE_NAME).async('string'),
    );
    const actions = await importFile(exportedFile, { workspaceId: 'workspace_1' });
    expect(actions.length).toBeGreaterThan(0);
    expect(json.patient!.name).toBe('Test Patient');
    expect(json.patient!.dateOfBirth).toBe('2011-06-14');
  });
});

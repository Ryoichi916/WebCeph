import * as React from 'react';
import * as Dropzone from 'react-dropzone';
import * as cx from 'classnames';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import Props from './props';

import { FormattedMessage, injectIntl, InjectedIntl, defineMessages } from 'react-intl';

import RecordMetaFields, { normalizeRecordMeta } from 'components/RecordMetaFields';

import {
  DEFAULT_IMAGE_TYPE,
  getTodayISO,
  getImageTypeLabel,
  getImageTypeLabelWithArticle,
  isTraceableImageType,
  formatCaptureDate,
  // The photographic series: the frame a slot files into (see `getStartingMeta`).
  getDefaultPhotoView,
  getPhotoViewLabel,
  reconcilePhotoView,
} from 'utils/records';

// A case file is not an image, and this input does not take one — the sentence
// and the test are the middleware's, so the refusal cannot drift from it.
import {
  isCaseFileName, CASE_FILE_AT_IMAGE_INPUT,
} from 'store/middleware/import';

type InjectedIntlProps = {
  intl: InjectedIntl;
};

const messageDescriptors = defineMessages({
  action_load_sample_image: {
    id: 'action_load_sample_image',
    defaultMessage: 'Load sample image',
  },
  callout_load_sample_image: {
    id: 'callout_load_sample_image',
    defaultMessage: 'No image at hand? Try the bundled sample cephalogram.',
  },
  action_pick_image: {
    id: 'action_pick_image',
    // Named for what it files, like every other control in this scope ("Add
    // lateral cephalogram", "Add profile photo", "Add another image to this
    // record"). "Click to pick an image" was an instruction about the mouse.
    defaultMessage: 'Choose image…',
  },
});

const classes = require('./style.scss');

/**
 * The bundled sample image is a lateral cephalogram. It is filed as one no
 * matter which type the form happens to be showing — a sample cannot be
 * re-labelled into a panoramic or a photograph just because the select says so.
 */
const SAMPLE_IMAGE_TYPE: ImageType = 'ceph_lateral';

/** Which mark the upload screen draws — one per modality this app files. */
type IllustrationMark =
  'lateral' | 'frontal' | 'panoramic' | 'profile' | 'portrait' | 'arch';

/**
 * The mark for a record type. Only the lateral cephalogram is drawn as a lateral
 * cephalogram: "Add a panoramic radiograph to this patient's record" and "Add an
 * intraoral photograph…" were both illustrated with a portrait ceph film
 * carrying a soft-tissue profile line, i.e. the screen depicted the wrong
 * modality while its own sentence named the right one.
 *
 * The two extraoral photographs are two marks for the same reason: filed one
 * mark, "Add a profile photograph to this patient's record" was drawn as an
 * unmistakably front-facing head and shoulders — exactly the fault above, on the
 * one pair of types whose whole difference is which way the patient is facing.
 *
 * An unknown/unset type falls back to the lateral film, which is what an image
 * filed before the records layer existed actually is.
 */
const getIllustrationMark = (type: ImageType | null): IllustrationMark => {
  switch (type) {
    case 'ceph_pa': return 'frontal';
    case 'panoramic': return 'panoramic';
    case 'photo_lateral': return 'profile';
    case 'photo_frontal': return 'portrait';
    case 'photo_intraoral': return 'arch';
    default: return 'lateral';
  }
};

const strokeProps = {
  fill: 'none',
  strokeWidth: 2.5,
  strokeLinecap: 'round' as 'round',
  strokeLinejoin: 'round' as 'round',
};

/**
 * A calm line-style illustration of the record being added. Inline SVG (no
 * external assets); colours come from the stylesheet so the drag-over/reject
 * states can tint it.
 *
 * The plate is a portrait film for the two cephalograms, a wide film for the
 * panoramic and a mounted print for the photographs — the shape alone says which
 * modality the form is filing before a word is read, and what is *inside* it says
 * which of the pair: a head in profile for the profile photograph, face on for the
 * frontal, the occlusion for the intraoral series. Landmark dots and the S–N
 * construction line are drawn on the lateral film only: promising landmarks over
 * a panoramic or a photograph would contradict the note right below the form.
 */
const CephIllustration = ({ mark }: { mark: IllustrationMark }) => (
  <svg
    className={classes.illustration}
    width="168"
    height="168"
    viewBox="0 0 168 168"
    aria-hidden="true"
  >
    {/* soft backdrop disc */}
    <circle className={classes.illustration_disc} cx="84" cy="84" r="80" />

    {mark === 'lateral' || mark === 'frontal' ? (
      /* Portrait film — a cephalogram's own 8 × 10 plate. */
      <rect
        className={classes.illustration_card}
        x="38" y="26" width="92" height="116" rx="10"
      />
    ) : null}

    {mark === 'lateral' ? (
      <g>
        {/* profile tracing line */}
        <path
          className={classes.illustration_profile}
          {...strokeProps}
          d="M 96 40
             C 103 48 106 56 105 64
             C 104 71 100 75 96 78
             C 101 82 104 87 103 92
             C 102 97 98 100 94 102
             C 98 106 99 111 97 116
             C 94 122 87 126 79 127
             C 71 128 63 125 58 119"
        />
        {/* landmark dots */}
        <g className={classes.illustration_dots}>
          <circle cx="96" cy="40" r="3" />
          <circle cx="105" cy="64" r="3" />
          <circle cx="96" cy="78" r="3" />
          <circle cx="103" cy="92" r="3" />
          <circle cx="97" cy="116" r="3" />
          <circle cx="58" cy="119" r="3" />
          <circle cx="62" cy="52" r="3" />
        </g>
        {/* construction line S–N */}
        <line
          className={classes.illustration_construction}
          x1="62" y1="52" x2="96" y2="40"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </g>
    ) : null}

    {mark === 'frontal' ? (
      /* A skull seen from the front: symmetric cranium and mandible, the two
         orbits and the nasal aperture, on the film's own midline. That symmetry
         is the whole difference between a PA film and a lateral one. */
      <g className={classes.illustration_profile}>
        <path
          {...strokeProps}
          d="M 60 66
             C 60 44 70 36 84 36
             C 98 36 108 44 108 66
             C 108 82 104 92 100 98
             C 98 112 92 122 84 122
             C 76 122 70 112 68 98
             C 64 92 60 82 60 66 Z"
        />
        <circle {...strokeProps} strokeWidth={2} cx="73" cy="66" r="6.5" />
        <circle {...strokeProps} strokeWidth={2} cx="95" cy="66" r="6.5" />
        <path {...strokeProps} strokeWidth="2" d="M 84 74 L 79.5 87 H 88.5 Z" />
        <line
          className={classes.illustration_construction}
          x1="84" y1="30" x2="84" y2="130"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </g>
    ) : null}

    {mark === 'panoramic' ? (
      /* A wide film — the shape a panoramic actually comes on — carrying the
         dental arch it is taken for. */
      <g>
        <rect
          className={classes.illustration_card}
          x="20" y="52" width="128" height="64" rx="8"
        />
        <g className={classes.illustration_profile}>
          <path
            {...strokeProps}
            d="M 34 68 C 44 104 70 112 84 112 C 98 112 124 104 134 68"
          />
          {/* Root ticks: the arch is a row of teeth, not a smile. */}
          <g {...strokeProps} strokeWidth="2">
            <path d="M 38.5 74 L 33 78" />
            <path d="M 47 90 L 40.5 92.5" />
            <path d="M 60 101 L 56 107" />
            <path d="M 74 108 L 72.5 114" />
            <path d="M 94 108 L 95.5 114" />
            <path d="M 108 101 L 112 107" />
            <path d="M 121 90 L 127.5 92.5" />
            <path d="M 129.5 74 L 135 78" />
          </g>
        </g>
      </g>
    ) : null}

    {mark === 'profile' ? (
      /* The same photographic mount as the frontal print — this is the same
         record, taken from the side — holding a head in profile: the outline a
         clinician reads a profile photograph for (forehead, nose, lips, chin),
         facing right, exactly as this app's own tracings and its records
         dashboard's mark face. */
      <g>
        <rect
          className={classes.illustration_photo_mount}
          x="42" y="28" width="84" height="106" rx="4"
        />
        <rect
          className={classes.illustration_photo_window}
          x="50" y="36" width="68" height="82" rx="2"
        />
        <g className={classes.illustration_profile}>
          <path
            {...strokeProps}
            d="M 70 84
               C 62 80 60 70 62 61
               C 64 49 74 43 85 45
               C 92 47 96 52 95 58
               L 94 62
               C 98 65 101 69 102 72
               C 100 74 97 74 94 74
               C 96 77 95 79 92 80
               C 94 82 93 84 90 85
               C 91 88 88 90 84 90
               C 78 90 74 88 70 84 Z"
          />
          {/* Neck, then the shoulders the print is cropped at. */}
          <path {...strokeProps} strokeWidth="2" d="M 69 86 L 71 100" />
          <path {...strokeProps} strokeWidth="2" d="M 88 90 L 87 100" />
          <path
            {...strokeProps}
            d="M 56 118 C 58 108 64 100 78 100 C 92 100 104 106 108 118"
          />
        </g>
      </g>
    ) : null}

    {mark === 'portrait' ? (
      /* A mounted print, not a film: a portrait frame with a photographic mount,
         holding a head and shoulders — face on, which is what a *frontal*
         photograph is (the profile has its own mark above). */
      <g>
        <rect
          className={classes.illustration_photo_mount}
          x="42" y="28" width="84" height="106" rx="4"
        />
        <rect
          className={classes.illustration_photo_window}
          x="50" y="36" width="68" height="82" rx="2"
        />
        <g className={classes.illustration_profile}>
          <circle {...strokeProps} cx="84" cy="62" r="15" />
          <path {...strokeProps} d="M 58 118 C 60 96 71 85 84 85 C 97 85 108 96 110 118" />
        </g>
      </g>
    ) : null}

    {mark === 'arch' ? (
      /* An intraoral view: a landscape print of the occlusion — the upper and
         lower arches in contact. */
      <g>
        <rect
          className={classes.illustration_photo_mount}
          x="24" y="46" width="120" height="76" rx="4"
        />
        <rect
          className={classes.illustration_photo_window}
          x="32" y="54" width="104" height="60" rx="2"
        />
        <g className={classes.illustration_profile}>
          <path {...strokeProps} d="M 42 62 C 52 82 70 88 84 88 C 98 88 116 82 126 62" />
          <path {...strokeProps} d="M 44 106 C 54 90 70 88 84 88 C 98 88 114 90 124 106" />
          <g {...strokeProps} strokeWidth="1.6">
            <path d="M 56 76 L 60 68" />
            <path d="M 72 85 L 73 76" />
            <path d="M 96 85 L 95 76" />
            <path d="M 112 76 L 108 68" />
          </g>
        </g>
      </g>
    ) : null}

    {/* upload badge */}
    <g className={classes.illustration_badge}>
      <circle cx="126" cy="126" r="20" />
      <path
        className={classes.illustration_badge_arrow}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 126 134 L 126 119 M 119.5 125 L 126 118 L 132.5 125"
      />
    </g>
  </svg>
);

type State = ImageRecordMeta & {
  /**
   * The name of a **case file** that was handed to this image input, or null.
   *
   * A `.wceph` is not an image and this form must not accept one as one: routed
   * on its extension alone it used to merge a whole foreign case here — twelve
   * films, three visits and another patient's clinical entries — with no
   * manifest and no confirmation. It is refused at the input the clinician used,
   * in the words `CASE_FILE_AT_IMAGE_INPUT` states, pointing at the surface that
   * does read one. @see store/middleware/import
   */
  refusedCaseFile: string | null;
};

/**
 * The record details this upload starts on.
 *
 * Directed at a slot (the clinician pressed "Add profile photo" in T2's panel on
 * the records dashboard), it is that slot: its type, its timepoint and the day
 * that visit was captured. Undirected, it is the generic defaults — the film this
 * app traces, the next timepoint in the series, today.
 *
 * Either way the values are on screen and editable before a file is chosen:
 * nothing is stamped on a record unseen.
 */
const getStartingMeta = (props: Props): ImageRecordMeta => {
  const { filingIntent, defaultTimepoint } = props;
  if (filingIntent !== null) {
    const type = filingIntent.type !== null
      ? filingIntent.type : DEFAULT_IMAGE_TYPE;
    return {
      type,
      timepoint: filingIntent.timepoint,
      // The visit's own day when the slot came from a dated timepoint (the films
      // and photographs of one visit share it), today when it did not.
      captureDate: filingIntent.captureDate !== null
        ? filingIntent.captureDate : getTodayISO(),
      // The frame the slot named, where it named one: an empty cell of a visit's
      // photographic series files at *that* position ("Add the upper occlusal
      // photograph to T2"), so the form opens on it. A slot that named only a type
      // proposes that type's usual frame, and every one of these is on screen and
      // editable before a file is chosen.
      photoView: reconcilePhotoView(type, filingIntent.photoView) !== null
        ? filingIntent.photoView : getDefaultPhotoView(type),
    };
  }
  return {
    type: DEFAULT_IMAGE_TYPE,
    timepoint: defaultTimepoint,
    captureDate: getTodayISO(),
    // The default type is a lateral cephalogram, which holds no series position.
    photoView: getDefaultPhotoView(DEFAULT_IMAGE_TYPE),
  };
};

class CephDropzone extends React.PureComponent<Props & InjectedIntlProps, State> {
  dropzone: null | React.ReactInstance & { open: Function };

  state: State = { ...getStartingMeta(this.props), refusedCaseFile: null };

  /**
   * Re-open the form on the details the app now proposes.
   *
   * This component outlives the tile it is shown in: only the active workspace is
   * rendered (see components/App), so switching tiles hands the *same* dropzone
   * instance a new set of defaults. Without this, pressing "Add intraoral photo"
   * in T2's panel landed on a form still showing whatever the previous tile's
   * form had shown — and the record's own series numbering ("T2" after the first
   * film was filed) never reached the field either.
   *
   * Only the proposal is followed, never overwritten mid-edit: the state is
   * replaced when the proposal itself changes, which happens on a slot click, on a
   * tile switch and when the number of images on file changes — not while the
   * clinician is typing into it.
   */
  componentWillReceiveProps(next: Props & InjectedIntlProps) {
    const before = getStartingMeta(this.props);
    const after = getStartingMeta(next);
    if (
      before.type !== after.type ||
      before.timepoint !== after.timepoint ||
      before.captureDate !== after.captureDate ||
      // …and the frame, which is what distinguishes one photograph slot of a
      // visit from the next: without it, pressing "Add the left buccal
      // photograph" while the form was already open on the right buccal left the
      // form — and therefore the record — on the position that was not asked for.
      before.photoView !== after.photoView
    ) {
      this.setState({ ...after, refusedCaseFile: null });
    }
  }

  render() {
    const {
      isOffline,
      className,
      allowsMultipleFiles = false,
      filingIntent,
      intl: { formatMessage },
    } = this.props;
    const { type, refusedCaseFile } = this.state;
    const isTraceable = isTraceableImageType(type);
    // Where this form came from, when it came from a slot: the clinician pressed
    // "Add profile photo" under T2 on the records dashboard and arrived here, so
    // the form says which slot it is filling rather than looking like a fresh
    // upload that happens to be pre-set. Read off the *intent*, never off the
    // fields — the fields are theirs to change, and the moment they change one
    // this line would otherwise be describing something else.
    const slotNote = filingIntent !== null
      ? [
        // A photographic slot names its *frame*, which is what the clinician
        // pressed: "Frontal at rest at T2" and not "Frontal photograph at T2",
        // which is true of three of the four extraoral cells at once.
        filingIntent.photoView !== null
          ? getPhotoViewLabel(filingIntent.photoView)
          : getImageTypeLabel(filingIntent.type),
        filingIntent.timepoint !== null ? `at ${filingIntent.timepoint}` : null,
        formatCaptureDate(filingIntent.captureDate) !== null
          ? `· ${formatCaptureDate(filingIntent.captureDate)}` : null,
      ].filter((part) => part !== null).join(' ')
      : null;
    return (
      <Dropzone
        ref={this.setRef}
        className={cx(className, classes.dropzone)}
        activeClassName={classes.dropzone__active}
        rejectClassName={classes.dropzone__reject}
        onDrop={this.handleDrop}
        multiple={allowsMultipleFiles}
        disableClick
        disablePreview
      >
        <div className={classes.dropzone_card}>
          <div className={classes.dropzone_placeholder}>
            <CephIllustration mark={getIllustrationMark(type)} />
            <span className={classes.dropzone_placeholder_text}>
              {isTraceable ? (
                <FormattedMessage
                  id="callout_start_tracing"
                  defaultMessage="To start tracing, drop a cephalogram or photograph here"
                />
              ) : (
                `Add ${getImageTypeLabelWithArticle(type)} to this patient's record`
              )}
            </span>
            <span className={classes.dropzone_drop_hint}>
              Drag &amp; drop anywhere inside this frame
            </span>
            <RecordMetaFields
              className={classes.record_form_slot}
              title="Record details"
              hint={slotNote !== null
                ? `Filing ${slotNote} — change any of these first`
                : 'Filed with the image you add — change any of these first'}
              value={this.state}
              onChange={this.handleMetaChange}
            />
            <RaisedButton
              primary
              label={formatMessage(messageDescriptors.action_pick_image)}
              labelStyle={{ textTransform: 'none', fontWeight: 600 }}
              onClick={this.openFilePicker}
            />
            {refusedCaseFile !== null ? (
              <p className={classes.dropzone_refused}>
                <strong className={classes.dropzone_refused_name}>
                  {refusedCaseFile}
                </strong>
                {CASE_FILE_AT_IMAGE_INPUT}
              </p>
            ) : null}
            {isOffline ? null : (
              <div className={classes.dropzone_load_demo}>
                <span className={classes.dropzone_hint}>
                  {isTraceable
                    ? formatMessage(messageDescriptors.callout_load_sample_image)
                    : 'The bundled sample is a lateral cephalogram — it is filed ' +
                      'as one, not as the type selected above.'}
                </span>
                <FlatButton
                  primary
                  label={isTraceable
                    ? formatMessage(messageDescriptors.action_load_sample_image)
                    : 'Load sample lateral cephalogram'}
                  labelStyle={{ textTransform: 'none', fontWeight: 500 }}
                  onClick={this.handleDemoClick}
                />
              </div>
            )}
          </div>
        </div>
      </Dropzone>
    );
  };

  private getMeta = (): ImageRecordMeta => normalizeRecordMeta(this.state);

  private handleMetaChange = (value: ImageRecordMeta) =>
    this.setState({ ...value, refusedCaseFile: null });

  /**
   * A case file chosen here is refused here.
   *
   * The import middleware refuses it too — that is the choke point no surface can
   * bypass — but its refusal reaches a store slice this screen does not render,
   * and a clinician who has just chosen a file is owed the sentence at the input
   * they used. Anything that is not a case file goes on exactly as before, so a
   * mixed drop still files its images. @see store/middleware/import
   */
  private handleDrop = (files: File[]) => {
    const caseFiles = files.filter(({ name }) => isCaseFileName(name));
    const images = files.filter(({ name }) => !isCaseFileName(name));
    this.setState({
      refusedCaseFile: caseFiles.length > 0 ? caseFiles[0].name : null,
    });
    if (images.length > 0) {
      this.props.onFilesDrop(images, this.getMeta());
    }
  }

  // The sample is a lateral cephalogram; its type is not taken from the form.
  // Filing it as whatever the select showed produced a record that called an
  // unmistakable lateral ceph a "Profile photograph" and then refused to
  // analyse it.
  private handleDemoClick = () => this.props.onDemoButtonClick({
    ...this.getMeta(),
    type: SAMPLE_IMAGE_TYPE,
  });

  private setRef = (node: any) => this.dropzone = node;
  private openFilePicker = () => {
    if (this.dropzone !== null) {
      this.dropzone.open();
    }
  }
};

export default injectIntl(CephDropzone);

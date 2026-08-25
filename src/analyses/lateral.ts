import downs from 'analyses/downs';
import steiner from 'analyses/steiner';
import tweed from 'analyses/tweed';
import ricketts from 'analyses/ricketts';
import bjork from 'analyses/bjork';
import jarabak from 'analyses/jarabak';
import dental from 'analyses/dental';
import softTissues from 'analyses/softTissues';
import wits from 'analyses/wits';

/**
 * The lateral-cephalometric analyses this app ships, in the order a clinician
 * reads them: skeletal pattern first, then vertical/growth, then dentition and
 * soft tissue.
 *
 * `id` is the analysis *module* name (`src/analyses/<id>.ts`) — the same id the
 * store keeps per image and the analysis-switch middleware acts on. Note that
 * it is not always the module's own `analysis.id` (`ricketts` exports
 * `ricketts_lateral`), so always key off this `id`.
 *
 * Single source of truth for the toolbar's analysis menu and for the combined
 * ("All analyses") clinical report — add a new lateral analysis here and both
 * pick it up.
 */
export interface LateralAnalysisEntry {
  /** Module name under `src/analyses/`, and the id stored per image. */
  id: string;
  /** Display name (menu item, report section heading). */
  name: string;
  /** One-line clinical scope, shown as secondary text. */
  focus: string;
  /** The analysis module itself, for read-only evaluation. */
  analysis: Analysis<'ceph_lateral'>;
}

export const LATERAL_ANALYSES: LateralAnalysisEntry[] = [
  {
    id: 'downs', name: 'Downs',
    focus: 'Facial pattern & skeletal profile',
    analysis: downs,
  },
  {
    id: 'steiner', name: 'Steiner',
    focus: 'Skeletal, dental & chin relations to S-N',
    analysis: steiner,
  },
  {
    id: 'tweed', name: 'Tweed',
    focus: 'FMA · IMPA · FMIA triangle & Y axis',
    analysis: tweed,
  },
  {
    id: 'ricketts', name: 'Ricketts',
    focus: 'Comprehensive skeletal & dental',
    analysis: ricketts,
  },
  {
    id: 'bjork', name: 'Björk',
    focus: 'Posterior angles, gonial split & sum',
    analysis: bjork,
  },
  {
    id: 'jarabak', name: 'Jarabak',
    focus: 'Growth ratio & facial heights',
    analysis: jarabak,
  },
  {
    id: 'dental', name: 'Dental',
    focus: 'Bite, incisor inclination & position',
    analysis: dental,
  },
  {
    id: 'softTissues', name: 'Soft Tissue',
    focus: 'E-line lips & facial esthetics',
    analysis: softTissues,
  },
  {
    id: 'wits', name: 'Wits & vertical',
    focus: 'Wits · facial-height · FMA',
    analysis: wits,
  },
];

export default LATERAL_ANALYSES;

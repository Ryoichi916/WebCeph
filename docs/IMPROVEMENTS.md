# Improvement backlog

Open work on the lateral-cephalometric workspace, kept in priority order.

Every item below comes from an adversarial review round: harsh visual/clinical
judges on each module, plus a blind benchmark against commercial WebCeph
(latest verdict: this app wins the visual comparison with high confidence and
clears the clinical-depth bar — 91 reported measurements across nine analyses,
all steppers completing, nothing the stepper computes stranded from the tables).
These are what that review still found wanting.

Verification for every item: `npx tsc --noEmit` exits 0, and the change is seen
in a screenshot — `cd <scratchpad> && node shoot.js <outdir>` walks the whole
journey; `verify3.js` switches analyses and captures each stepper and Summary.
Printed output is checked through Chromium's real print pipeline (`page.pdf`),
never from the on-screen preview alone.

## P1 — clinical correctness, visible on a signed document

- [ ] **Posterior/condylar-ramus outline is geometrically wrong.** On report
  page 1 at 260 dpi the curve leaves the condyle and sweeps across the cranial
  base and cervical spine instead of following the posterior ramus border, and
  no cranial-base (S-Ba/clivus) or orbital-rim outline is drawn at all. A wrong
  outline on a certified document is worse than none: either fit these curves to
  the film or restrict the printed tracing to the segments the plotter can
  defend. `components/TracingViewer/outlines.ts`, `utils/tracingSnapshot.ts`.
- [ ] **Nothing sanity-checks the image scale.** With 10 mm = 96 px accepted the
  app printed S-N 27.5 mm, N-Me 40.5 mm and Go-Me 23.0 mm on a signed report
  without a word of doubt — roughly a third of life size. Add a plausibility
  band on cranial-base and facial-height lengths (e.g. warn when N-Me falls
  outside ~90–150 mm) in the calibration dialog, and carry the same warning as a
  report footnote whenever mm rows depend on the suspect scale. `isImplausible`
  already exists in `analyses/simulation.ts` but is never applied to measured
  values. `components/TracingToolbar/CalibrationDialog.tsx`,
  `components/ClinicalReport/`.
- [ ] **Ricketts' mandibular arc equals FMPA to 0.1°.** Two independent angles
  agreeing exactly reads as a shared-geometry bug to any clinician. Verify the
  Xi/Dc/Pm derivation, and reconcile the module comment (it still claims no age
  correction while the norms note says the arc was corrected to 30.5°).
  `analyses/ricketts.ts`, `analyses/landmarks/points/skeletal-custom.ts`.
- [ ] **Finding labels mis-scoped or contradicting their own rows.** "Skeletal
  profile — Concave" is emitted inside the Soft Tissue section (it is a
  soft-tissue profile), and Dental grades "Upper incisor inclination — Normal"
  while U1-MxP in the same group is −8.8°, starred outside the norm. Audit every
  category label against the section it lands in and against its own row's
  deviation. `analyses/landmarks/angles/*.ts`, `analyses/helpers.ts`.

## P2 — quick fixes a clinician would catch in ten minutes

- [ ] **Canvas never scopes landmarks to the open analysis.** After a session
  that touched Ricketts and Soft Tissue, switching to Björk (6 measurements, 5
  points) still renders ~40 labelled dots — Pt, Ba, Dc, R1–R4, D, PM, U4, L4,
  Ls, Li, Pn, Sn, Pog' — and the dental region becomes label soup. Dim or hide
  points the active analysis does not consume. `components/TracingViewer/`.
- [ ] **Summary dialog clips silently.** Fixed at ~760 px in a 900 px viewport,
  so Jarabak's 16 rows and the whole norms-provenance block sit below the fold
  with no scrollbar and no fade — the only hint is a half-cut row. Give it the
  viewport height and a visible overflow affordance (the stepper's scroll-fade
  pattern already exists). `components/AnalysisResultsViewer/`.
- [ ] **Simulation's value table cannot be scrolled fully into view** — 8 of 14
  rows visible at 900 px. Same fix as above. `components/TreatmentSimulation/`.
- [ ] **Printed report leaves a three-quarters-blank page.** "Clinical notes &
  plan" plus certification occupy the top quarter of page 3 and the rest is
  white. Either let the ruled notes fill the page or keep the block on page 2 —
  `pdf-tweed-2.png` proves notes can follow a table on one page, so this is a
  keep-together sizing bug. `components/ClinicalReport/style.scss`.
- [ ] **Superimposition shows orphan geometry.** Landmarks present on T1 but
  absent on T2 render as isolated cyan dots and stray strokes over the posterior
  skull, reading as noise beside two otherwise clean tracings. Dim unpaired
  points or exclude them from the frame. `components/Superimposition/`.
- [ ] **"Profilogram" is not a profilogram.** It is a dashed polyline laid over
  the radiograph, not the standalone profile drawing the name denotes. Either
  render it as its own figure (optionally beside the film) or rename the control
  to what it does. `analyses/profilogram.ts`, `components/TracingViewer/`.
- [ ] **Export is PNG/JPG only.** No tracing/landmark export, no measurement CSV
  outside the Summary dialog, no way to hand a case to another system. Add
  landmark + measurement export (the wceph project format already round-trips
  internally) and a report-level CSV. DICOM is a separate, larger piece.
  `store/middleware/exportImage.ts`, `components/TracingToolbar/`.

## P3 — modules still missing against the commercial field

- [ ] **Patient dashboard: study models are still missing.** The surface itself
  is done — it is a full workspace page, not a modal, and it now holds the
  extraoral/intraoral photograph types, the per-timepoint analysis history, the
  cross-timepoint measurement trend, a horizontal treatment timeline with the
  elapsed interval on every gap, and working launch points into the tracing
  editor, the clinical report, the treatment simulation and a superimposition of
  a named pair of timepoints. What the commercial field still has and this does
  not is **study models / 3D records** (plaster scans, IOS meshes): a new record
  type with its own viewer, not a variation on an image.
  `components/RecordsDashboard/`.
- [ ] **Non-lateral analysis.** PA/frontal cephalometric analysis (the frontal
  landmark points already exist in `analyses/landmarks/frontalPhoto/`),
  photographic (facial esthetic) analysis, and arch/space analysis.
- [ ] **Growth prediction.** The simulation is deliberately geometric and says
  so; a growth-increment model (e.g. Ricketts' arcial or a Björk increment) is a
  separate, honest addition — and must stay labelled as prediction.
- [ ] **Auto-plot is unvalidated against real clinical films.** The demo
  predictor is geometric and the bundled film is synthetic, so nothing on screen
  evidences tracing accuracy on a real radiograph. Validating against real
  anonymised films — or shipping one — is the strongest remaining credibility
  lever.
- [ ] **Multi-clinician / cloud records.** Storage is local to the browser by
  design; sharing, multi-device access and practice-level records are absent.

## Done in recent rounds

Kept short, as evidence of the review loop rather than a changelog: nine
analyses filled to their published component sets (35 → 91 reported
measurements) with sourced norms, age- and sex-corrected where the literature
indexes them; every computed measurement surfaced with norm and deviation;
mm measurements withheld until the image is calibrated; anatomical outline
tracings and incisor templates; calibration dialog; A4 clinical report with
wigglegrams, findings overview, norms provenance and certification block;
cephalometric superimposition with auditable registration; geometric treatment
simulation; patient demographics and image records with types and timepoints.

/**
 * The browser document title while a printable view is open.
 *
 * Why this exists. The app titles the tab from the active workspace, which is
 * the image's file name (see `components/App`), and Chrome names a "Save as
 * PDF" file after `document.title`. Every clinical deliverable this app
 * produces therefore defaulted to `test-ceph.jpg - WebCeph.pdf` — a file that
 * names the operator's scan file and not the patient, the document or the film,
 * and that sorts next to nothing in a chart folder.
 *
 * Each printable view declares its own title through react-helmet for as long
 * as it is mounted, so the app's own title comes back the moment it closes.
 */

/**
 * `"C-0001 山田 太郎 — Cephalometric report (T1, 2026-01-12)"`.
 *
 * Every part is omitted rather than guessed: an unregistered patient yields
 * `"Cephalometric report"`, and a film with no timepoint or date yields no
 * parenthesis. Nothing here is invented to fill the string out.
 */
export const printDocumentTitle = (
  patient: Patient | null,
  documentName: string,
  subject: Array<string | null> = [],
): string => {
  const who = patient !== null
    ? [patient.chartId, patient.name].filter((p) => !!p && p.trim() !== '')
      .map((p) => p.trim())
      .join(' ')
    : '';
  const head = who !== '' ? `${who} — ${documentName}` : documentName;
  const parts = subject
    .filter((p) => p !== null && p.trim() !== '')
    .map((p) => (p as string).trim());
  return parts.length > 0 ? `${head} (${parts.join(', ')})` : head;
};

export default printDocumentTitle;

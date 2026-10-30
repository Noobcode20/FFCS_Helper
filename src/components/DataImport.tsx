import { useState } from "react";
import type { Catalog, ImportResult } from "../lib/types";
import { parseImportFile } from "../lib/importer";
import { downloadJson } from "../lib/storage";
import { defaultCatalog } from "../data/catalog";
export function DataImport({
  catalog,
  apply,
}: {
  catalog: Catalog;
  apply: (catalog: Catalog) => void;
}) {
  const [semester, setSemester] = useState(catalog.semester);
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ImportResult>();
  const [busy, setBusy] = useState(false);
  async function read(file?: File) {
    if (!file) return;
    setBusy(true);
    setResult(undefined);
    try {
      setResult(
        await parseImportFile(file, {
          semester,
          source: source.trim(),
          url: url || undefined,
        }),
      );
    } catch (e) {
      setResult({
        errors: [e instanceof Error ? e.message : "Could not read this file."],
        warnings: [],
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel content-panel">
      <span className="eyebrow">BRING YOUR OWN SEMESTER</span>
      <h2>Import a catalog</h2>
      <p className="muted">
        JSON, CSV or XLSX. Files are validated locally. Review the results
        before replacing the active catalog.
      </p>
      <div className="form-grid">
        <label>
          Semester
          <input
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          />
        </label>
        <label>
          Source name
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Department export"
          />
        </label>
        <label className="full">
          Source URL (optional)
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>
      <label className="file-drop">
        Choose catalog file
        <input
          type="file"
          accept=".json,.csv,.xlsx"
          disabled={busy}
          onChange={(e) => void read(e.target.files?.[0])}
        />
        <small>Only apply files you have permission to use.</small>
      </label>
      <button
        className="secondary"
        onClick={() =>
          downloadJson("ffcs-catalog-template.json", { ...defaultCatalog, offerings: [] })
        }
      >
        Download catalog JSON template
      </button>
      <details><summary>CSV / XLSX column format</summary><p>Use the first worksheet, one row per meeting. Times use HH:MM, days Mon–Sun. Keep credits blank when unknown. Repeat offering_id only for explicitly linked components.</p><code className="import-columns">course_id, code, title, credits, faculty_id, faculty, offering_id, section, component, slot, day, start, end, venue</code><p>Component: theory, lab, tutorial or project. Venue is optional. JSON keeps the full normalized catalog and provenance.</p><a href="./IMPORT_FORMAT.md" target="_blank" rel="noreferrer">Read full import and backup instructions</a></details>
      {busy && <p role="status">Reading and validating file…</p>}
      {result && (
        <div aria-live="polite" className="import-result">
          <h3>Validation preview</h3>
          {result.errors.map((e, i) => (
            <p className="error" key={i}>
              {e}
            </p>
          ))}
          {result.warnings.map((e, i) => (
            <p className="warning" key={i}>
              {e}
            </p>
          ))}
          {result.catalog && (
            <>
              <p>
                {result.catalog.campus} · {result.catalog.semester}
              </p>
              <p>
                {result.catalog.courses.length} courses ·{" "}
                {result.catalog.offerings.length} sections ·{" "}
                {result.catalog.faculty.length} faculty ·{" "}
                {result.catalog.reviews.length} review records
              </p>
              {(catalog.provenance.status === 'verified' && (result.catalog.provenance.status !== 'verified' || Date.parse(result.catalog.provenance.updatedAt || result.catalog.provenance.importedAt) < Date.parse(catalog.provenance.updatedAt || catalog.provenance.importedAt))) && <p className="warning">This replaces a source-claimed verified catalog with older or unverified data. Review dates and export your existing catalog first.</p>}
              <p className="muted">
                Applying clears the current selection and generation results.
                Saved plans are retained and checked against this catalog when
                loaded.
              </p>
              <button
                disabled={result.errors.length > 0}
                onClick={() => {
                  apply(result.catalog!);
                  setResult(undefined);
                }}
              >
                Apply validated catalog
              </button>
            </>
          )}
          {!result.catalog && !result.errors.length && (
            <p>No valid catalog was returned.</p>
          )}
        </div>
      )}
    </section>
  );
}

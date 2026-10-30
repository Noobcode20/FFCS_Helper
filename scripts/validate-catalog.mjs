/** Node 22.18+ (native TypeScript stripping). Uses the app's actual importer/engine.
 * node scripts/validate-catalog.mjs [absolute/path/to/app/src/lib]
 * Optional path permits independent data worktree validation against supervisor code.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lib = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'src/lib');
const { validateCatalog } = await import(pathToFileURL(resolve(lib, 'importer.ts')).href);
const { generateSchedules, getConflicts, defaultPreferences } = await import(pathToFileURL(resolve(lib, 'engine.ts')).href);
const input = JSON.parse(await readFile(resolve(root, 'src/data/catalog.json'), 'utf8'));
const result = validateCatalog(input);
assert.deepEqual(result.errors, [], 'Main catalog importer rejected bundled data');
assert.ok(result.catalog);
assert.deepEqual(result.catalog.warnings, input.warnings, 'Importer dropped critical source warnings');
const roundTrip = validateCatalog(JSON.parse(JSON.stringify(result.catalog)));
assert.deepEqual(roundTrip.errors, []);
assert.deepEqual(roundTrip.catalog?.warnings, input.warnings, 'JSON roundtrip lost source warnings');
const catalog = result.catalog;
// Every real offering, including every lab, must survive the production engine.
for (const offering of catalog.offerings) {
  const generated = generateSchedules(catalog, [offering.courseId], defaultPreferences, { [offering.courseId]: [offering.id] });
  assert.equal(generated.schedules.length, 1, `Engine rejected ${offering.id}`);
  assert.deepEqual(generated.schedules[0].offeringIds, [offering.id]);
}
const selection = ['BCSE202L', 'BCSE202P', 'BCSE302L'];
const generated = generateSchedules(catalog, selection, defaultPreferences);
assert.ok(generated.schedules.length > 0, 'No real multi-course alternatives generated');
for (const schedule of generated.schedules) {
  const offerings = schedule.offeringIds.map(id => catalog.offerings.find(o => o.id === id));
  assert.deepEqual(getConflicts(offerings), []);
  assert.equal(offerings.length, selection.length);
}
console.log(JSON.stringify({ importerErrors: 0, validatedOfferings: catalog.offerings.length, preservedWarnings: input.warnings.length, multiCourseSelection: selection, schedules: generated.schedules.length, explored: generated.explored, truncated: generated.truncated }, null, 2));

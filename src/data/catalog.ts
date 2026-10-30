import type { Catalog } from '../lib/types';
import { attachReviewLibrary } from '../lib/reviews';
import type { ReviewLibrary } from '../lib/reviews';
import { allocationSnapshot, vtopCourses, vtopFaculty, vtopOfferings, vtopSlotTemplateProvenance } from './vtop';

/** Review records are kept in a separate async chunk and loaded only when needed. */
export async function loadReviewLibrary(): Promise<ReviewLibrary> {
  const { default: library } = await import('./review-library.json');
  return library as ReviewLibrary;
}
export async function withBundledReviews(catalog: Catalog): Promise<Catalog> {
  return attachReviewLibrary(catalog, await loadReviewLibrary());
}

const currentCatalog: Catalog = {
  version: 1,
  campus: 'Vellore',
  semester: allocationSnapshot.semester,
  provenance: {
    source: 'VTOP faculty and course allocations captured separately for ECE and ECM accounts',
    url: 'https://vtop.vit.ac.in/vtop/content',
    importedAt: allocationSnapshot.extractedAt,
    updatedAt: allocationSnapshot.extractedAt,
    status: 'imported',
  },
  warnings: [`ECE and ECM allocations are kept as separate account-specific course records. Repeated course codes, categories, faculty, and class rows are retained. Clock times use VTOP's generic slot template captured ${vtopSlotTemplateProvenance.capturedAt} and displayed for ${vtopSlotTemplateProvenance.displayedSemester}; this does not verify Winter-specific timing, registration, or availability. Confirm Winter timing and course assignments in VTOP before registration.`],
  courses: vtopCourses,
  faculty: vtopFaculty,
  offerings: vtopOfferings,
  reviews: [],
};

/** Current VTOP allocation snapshot. No historical timetable rows are included. */
export const defaultCatalog: Catalog = currentCatalog;
export default defaultCatalog;
export const catalogWarnings: readonly string[] = currentCatalog.warnings ?? [];
export const catalogCounts = {
  courses: vtopCourses.length,
  faculty: vtopFaculty.length,
  offerings: vtopOfferings.length,
  reviews: 0,
};
export const catalogSourceCommit = 'VTOP allocation snapshot';

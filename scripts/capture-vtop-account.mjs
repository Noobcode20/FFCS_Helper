// Reusable VTOP allocation source capture. Run this file through ego-browser nodejs
// after a human has logged in and opened Academics > Course Registration Allocation.
// It never logs in, reads credentials, registers courses, or stores CSRF tokens.
// Supply globalThis.VTOP_CAPTURE_CONFIG in the `ego-browser nodejs -e` command:
// {
//   taskSpaceId: 2, pageLabel: 'p1',
//   account: { label: 'ECM', username: '<private VTOP username>',
//     loginSelection: '<private account display name>', expectedStudentId: '<private student ID>' },
//   outputPath: '/absolute/path/to/data/vtop-faculty-list-ecm-winter-2026-27.json'
// }
// Example invocation appears in data/README.md. A failed/partial capture never
// replaces the existing source file.
const config = globalThis.VTOP_CAPTURE_CONFIG;
if (!config?.taskSpaceId || !config?.account?.label || !config?.account?.expectedStudentId || !config?.outputPath) {
  throw new Error('Set globalThis.VTOP_CAPTURE_CONFIG with taskSpaceId, account identity, and absolute outputPath.');
}
const categoryOrder = ['NC', 'UCC', 'PCC', 'CON', 'OEC'];
const categoryNames = {
  NC: 'NC - Non Credit Course',
  UCC: 'UCC - University Core Courses',
  PCC: 'PCC - Programme Core Courses',
  CON: 'CON - Concentration',
  OEC: 'OEC - Open Elective Courses',
};
const task = await globalThis.taskSpace(config.taskSpaceId);
const page = task.page(config.pageLabel || 'p1');
const categories = [];
const verified = { studentId: null, semester: null, sourceUrl: null };

for (const category of categoryOrder) {
  // Keep each page call bounded to one category, with at most three detail requests in flight.
  const part = await page.evaluate(async ({ expectedStudentId, category }) => {
    const id = document.querySelector('#authorizedID')?.value;
    const semester = document.body.innerText.match(/Winter Semester \d{4}-\d{2}/)?.[0];
    if (id !== expectedStudentId) throw new Error(`Visible student ID mismatch: ${id || 'missing'}`);
    if (semester !== 'Winter Semester 2026-27') throw new Error(`Semester mismatch: ${semester || 'missing'}`);
    if (!document.querySelector('select[name="curriculumCategory"]')) throw new Error('Course Registration Allocation page is not open.');
    const csrf = document.querySelector('input[name="_csrf"]')?.value;
    if (!csrf) throw new Error('VTOP CSRF field is unavailable.');
    const post = async (path, values) => {
      const response = await fetch(`/vtop/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...values, _csrf: csrf, authorizedID: id, x: new Date().toUTCString() }),
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      return response.text();
    };
    const courseListHtml = await post('academics/common/getCoursesListForCurriculmCategory', { cccategory: category });
    const listDoc = new DOMParser().parseFromString(courseListHtml, 'text/html');
    if (/access denied|session timed out|invalid login|vtop login/i.test(listDoc.body.innerText)) {
      throw new Error(`VTOP returned an authentication/error page for category ${category}.`);
    }
    const courseSelect = listDoc.querySelector('select[name="courseId"]');
    if (!courseSelect) throw new Error(`Course list response has no courseId select for ${category}.`);
    const options = [...courseSelect.options].filter(option => option.value);
    const courses = new Array(options.length);
    let next = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < options.length) {
        const index = next++;
        const option = options[index];
        const detailHtml = await post('academics/common/getCoursesDetailForRegistration', { courseCode: option.value });
        const detailDoc = new DOMParser().parseFromString(detailHtml, 'text/html');
        if (/access denied|session timed out|invalid login|vtop login/i.test(detailDoc.body.innerText)) {
          throw new Error(`VTOP returned an authentication/error page for ${category}/${option.value}.`);
        }
        const table = detailDoc.querySelector('table');
        const tableRows = table ? [...table.querySelectorAll('tr')] : [];
        const headerRow = tableRows.find(row => row.querySelector('th'));
        const headerCells = headerRow ? [...headerRow.querySelectorAll('th, td')] : [];
        const headers = headerCells.map(cell => cell.textContent.trim());
        const expectedHeaders = ['Slot Detail', 'Venue', 'Faculty', 'Course Type'];
        if (!table || JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
          throw new Error(`Unexpected allocation table for ${category}/${option.value}; headers=${headers.join('|') || 'missing'}.`);
        }
        const rows = tableRows.filter(row => !row.querySelector('th'));
        const explicitEmptyMessage = detailDoc.body.innerText.trim();
        if (rows.length === 0 && explicitEmptyMessage && !/no (allocation|allotted|course|record)|not available/i.test(explicitEmptyMessage)) {
          throw new Error(`Zero-row detail has no recognized empty-state message: ${category}/${option.value}.`);
        }
        courses[index] = {
          courseId: option.value,
          courseName: option.textContent.trim(),
          allocations: rows.map((row, rowIndex) => {
            const cells = [...row.cells];
            if (cells.length !== 4) throw new Error(`Expected four cells in ${category}/${option.value}/row ${rowIndex + 1}; got ${cells.length}.`);
            return {
              slotDetail: cells[0].textContent.trim(),
              venue: cells[1].textContent.trim(),
              faculty: cells[2].textContent.trim(),
              courseType: cells[3].textContent.trim(),
              sourceRowIndex: rowIndex + 1,
              sourceCellRowspans: cells.map(cell => cell.rowSpan),
              sourceCellColspans: cells.map(cell => cell.colSpan),
              sourceRowHtml: row.outerHTML,
            };
          }),
          ...(rows.length === 0 ? { sourceEmptyAllocationMessage: explicitEmptyMessage } : {}),
        };
      }
    }));
    return { studentId: id, semester, sourceUrl: location.href, category, courses };
  }, { expectedStudentId: config.account.expectedStudentId, category });
  verified.studentId = part.studentId;
  verified.semester = part.semester;
  verified.sourceUrl = part.sourceUrl;
  categories.push({ category, categoryName: categoryNames[category], courses: part.courses });
  console.log(`${category}: ${part.courses.length} courses, ${part.courses.reduce((n, course) => n + course.allocations.length, 0)} rows`);
}

const missingCells = [];
let courseCount = 0;
let rowCount = 0;
for (const category of categories) for (const course of category.courses) {
  courseCount++;
  course.allocations.forEach((row, rowIndex) => {
    rowCount++;
    for (const key of ['slotDetail', 'venue', 'faculty', 'courseType']) {
      if (!String(row[key] ?? '').trim()) missingCells.push(`${category.category}/${course.courseId}/row-${rowIndex + 1}/${key}`);
    }
  });
}
if (categories.length !== categoryOrder.length || categories.some((c, i) => c.category !== categoryOrder[i])) {
  throw new Error('Category capture is incomplete or out of order; existing file was not changed.');
}
const capturedAt = new Date().toISOString();
const data = {
  schemaVersion: 1,
  campus: 'Vellore',
  semester: verified.semester,
  source: 'VTOP > Academics > Course Registration Allocation',
  sourceUrl: 'https://vtop.vit.ac.in/vtop/content',
  capturedAt,
  captureMethod: 'Authenticated page-context POST requests to the VTOP read endpoints after visible account identity and semester verification. Full allocation table row HTML, row order, and cell spans retained.',
  slotTimingStatus: 'Exact VTOP slot labels retained; weekday and clock-time meanings are not encoded here.',
  account: {
    label: config.account.label,
    captureDate: capturedAt.slice(0, 10),
    identityVerified: true,
  },
  categories,
  captureSummary: { courseCount, rowCount, missingCellCount: missingCells.length, missingCells },
};
const fs = await import('node:fs/promises');
const path = await import('node:path');
const tempPath = `${config.outputPath}.tmp`;
await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`);
await fs.rename(tempPath, config.outputPath);
console.log(JSON.stringify({ outputPath: config.outputPath, identityVerified: Boolean(verified.studentId), semester: verified.semester, courseCount, rowCount, missingCells }, null, 2));

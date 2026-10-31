import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';

const files = {
  ECE: 'data/vtop-faculty-list-ece-winter-2026-27.json',
  ECM: 'data/vtop-faculty-list-ecm-winter-2026-27.json',
};
// Include additional programmes only when their complete source capture exists.
for (const [label, path] of Object.entries({
  MCA: 'data/vtop-faculty-list-mca-winter-2026-27.json',
  'CSE CORE': 'data/vtop-faculty-list-cse-core-winter-2026-27.json',
})) {
  try {
    await access(path);
    files[label] = path;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const captures = await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await read(path)]));
const accounts = Object.fromEntries(captures);
const stamp = captures.map(([, data]) => data.capturedAt ?? data.compiledAt).filter(Boolean).sort().at(-1);
if (!stamp) throw new Error('Capture timestamp is required.');
const sha = createHash('sha256');
const rows = [];

for (const [label, data] of captures) {
  if (data.account.label !== label) throw new Error(`${label}: unexpected account label`);
  if (data.semester !== accounts.ECE.semester || data.campus !== accounts.ECE.campus) throw new Error(`${label}: capture semester/campus mismatch`);
  for (const category of data.categories) for (const course of category.courses) {
    sha.update(JSON.stringify({ account: label, category: category.category, course }));
    for (const allocation of course.allocations) rows.push({
      account: label,
      category: category.category, categoryName: category.categoryName,
      courseId: course.courseId, courseName: course.courseName, ...allocation,
    });
  }
}

const summaries = Object.fromEntries(captures.map(([label, data]) => {
  const categories = Object.fromEntries(data.categories.map((c) => [c.category, {
    courses: c.courses.length,
    facultyRows: c.courses.reduce((n, course) => n + course.allocations.length, 0),
  }]));
  return [label, {
    courseEntries: data.categories.reduce((n, c) => n + c.courses.length, 0),
    facultyRows: data.categories.reduce((n, c) => n + c.courses.reduce((m, x) => m + x.allocations.length, 0), 0),
    distinctFacultyNames: new Set(data.categories.flatMap((c) => c.courses.flatMap((x) => x.allocations.map((a) => a.faculty)))).size,
    categories,
  }];
}));
for (const [label, data] of captures) data.summary = summaries[label];

const metadata = {
  campus: 'Vellore', semester: accounts.ECE.semester, source: accounts.ECE.source,
  sourceUrl: accounts.ECE.sourceUrl, compiledAt: stamp,
  slotTimingStatus: accounts.ECE.slotTimingStatus,
};
const combined = {
  schemaVersion: 2, ...metadata,
  accounts: captures.map(([label, data]) => ({
    label, capturedAt: data.capturedAt ?? data.compiledAt,
    categories: data.categories,
  })),
  summary: { accounts: summaries, totalCourseEntries: Object.values(summaries).reduce((n, x) => n + x.courseEntries, 0), totalFacultyRows: rows.length },
  overlap: buildOverlap(captures),
};
const csvCell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const csv = [
  ['account','category','category_name','course_id','course_name','faculty','slot_detail','venue','course_type'],
  ...rows.map((r) => [r.account,r.category,r.categoryName,r.courseId,r.courseName,r.faculty,r.slotDetail,r.venue,r.courseType]),
].map((line) => line.map(csvCell).join(',')).join('\n') + '\n';
// Planner-facing shape: one record per account/category/course, with every
// allocation row retained in source order. Course identity includes account
// and category so duplicate codes from different accounts/categories stay apart.
const groupedCourses = new Map();
for (const [label, data] of captures) for (const category of data.categories) for (const sourceCourse of category.courses) {
  const key = JSON.stringify([label, category.category, sourceCourse.courseId]);
  if (groupedCourses.has(key)) throw new Error(`Duplicate course entry: ${key}`);
  const title = String(sourceCourse.courseName ?? '');
  const prefix = `${sourceCourse.courseId} - `;
  groupedCourses.set(key, {
    account: label,
    category: category.category, categoryName: category.categoryName,
    courseCode: sourceCourse.courseId, courseId: sourceCourse.courseId,
    courseTitle: title.startsWith(prefix) ? title.slice(prefix.length) : title,
    allocations: sourceCourse.allocations.map(allocation => ({
      slotDetail: allocation.slotDetail, venue: allocation.venue, faculty: allocation.faculty,
      courseType: allocation.courseType, sourceRowIndex: allocation.sourceRowIndex,
      scheduleGroup: allocation.scheduleGroup ?? 'unresolved',
    })),
  });
}
const schedules = {
  schemaVersion:2,
  snapshot:{...metadata, extractedAt:stamp, accounts:captures.map(([label])=>({label})), sourceHashSha256:sha.digest('hex'), slotGroupRule:'No morning/evening or weekday mapping applied; scheduleGroup remains unresolved.',clockTimesIncluded:false},
  summary:{accounts:Object.fromEntries(Object.entries(summaries).map(([k,v])=>[k,{...v,distinctFacultyNames:undefined}])),totalCourseEntries:combined.summary.totalCourseEntries,totalFacultyRows:rows.length},
  courses:[...groupedCourses.values()],
};

const explorerPath = 'data/vtop-faculty-explorer.html';
const explorer = await readFile(explorerPath, 'utf8');
const start = explorer.indexOf('const rows=');
const end = explorer.indexOf(';const accounts=', start);
if (start < 0 || end < 0) throw new Error('Explorer data markers changed; inspect the HTML before rebuilding.');
const explorerRows = rows.map(({ account, category, courseId, courseName, slotDetail, venue, faculty, courseType }) => ({ account, category, courseId, courseName, slotDetail, venue, faculty, courseType }));
const outputs = new Map([
  ['data/vtop-allocation-winter-2026-27.json', JSON.stringify(combined,null,2)+'\n'],
  ['data/vtop-allocation-winter-2026-27.csv', csv],
  ['data/vtop-schedules-winter-2026-27.json', JSON.stringify(schedules,null,2)+'\n'],
  [explorerPath, explorer.slice(0, start) + 'const rows=' + JSON.stringify(explorerRows).replaceAll('<', '\\u003c') + explorer.slice(end)],
]);
const checkOnly = process.argv.includes('--check');
const stale = [];
for (const [path, content] of outputs) {
  if (checkOnly) {
    if (await readFile(path, 'utf8') !== content) stale.push(path);
  } else await writeFile(path, content);
}
if (stale.length) throw new Error(`Stale derived exports: ${stale.join(', ')}. Run node scripts/rebuild-vtop-exports.mjs.`);

console.log(JSON.stringify({summaries,totalRows:rows.length,checkOnly,missingRequired:rows.filter(r=>['slotDetail','venue','faculty','courseType'].some(k=>!r[k])).length},null,2));

function buildOverlap(entries) {
  const byKey = new Map();
  const labels = entries.map(([label]) => label);
  for (const [label,data] of entries) for (const category of data.categories) for (const course of category.courses) {
    const key=`${category.category}|${course.courseId}`;
    const item=byKey.get(key)??{category:category.category,courseId:course.courseId,...Object.fromEntries(labels.map(label => [label, []]))};
    item[label].push(course.courseName); byKey.set(key,item);
  }
  const shared=[...byKey.values()].filter(x=>labels.filter(label=>x[label].length).length>1);
  const distinctCodes=new Map();
  for(const x of byKey.values()){const cats=distinctCodes.get(x.courseId)??new Set();cats.add(x.category);distinctCodes.set(x.courseId,cats);}
  return {sharedCategoryCoursePairs:shared.length,sharedCategoryCourseEntries:shared.map(({category,courseId})=>({category,courseId})),codesInDifferentCategories:[...distinctCodes].filter(([,cats])=>cats.size>1).map(([courseId,cats])=>({courseId,categories:[...cats].sort()}))};
}

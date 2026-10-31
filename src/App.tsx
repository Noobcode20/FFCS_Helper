import { useEffect, useMemo, useRef, useState } from "react";
import {
  Books,
  CalendarBlank,
  Stack,
  Database,
  MagnifyingGlass,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  GitBranch,
  Check,
  X,
  SlidersHorizontal,
  PencilSimple,
  Heart,
  Prohibit,
  CalendarPlus,
  CaretDown,
  Skull,
} from "@phosphor-icons/react";
import { defaultCatalog, loadReviewLibrary } from "./data/catalog";
import { attachReviewLibrary, normalizeFacultyName, preferredRating } from "./lib/reviews";
import type { ReviewLibrary } from "./lib/reviews";
import { CourseTitle } from "./components/CourseTitle";
import { FacultyReviews } from "./components/FacultyReviews";
import { allocationSnapshot, facultyAllocations } from "./data/vtop";
import { calendarGenerationConstraints, nextGenerationCycle } from "./lib/generation-cycle";
import { repairFfcs } from "./lib/ffcs";
import { searchCourses } from "./lib/search";
import {
  conflicts,
  isSchedulableOffering,
  getConflicts,
  generateSchedules,
  defaultPreferences,
} from "./lib/engine";
import {
  loadPlans,
  savePlans,
  downloadJson,
  downloadCsv,
  downloadIcs,
  catalogFingerprint,
  restorePlans,
} from "./lib/storage";
import { validateCatalog } from "./lib/importer";
import type {
  BlockedWindow,
  Catalog,
  Offering,
  Plan,
  Preferences,
} from "./lib/types";
import { loadBlockedWindows, offeringBlockedBy, saveBlockedWindows, formatClock } from "./lib/blocked";
import { Timetable, days, time } from "./components/Timetable";
import { DataImport } from "./components/DataImport";

type View = "planner" | "faculty" | "plans";
type MobilePlannerSection = "search" | "timetable" | "shortlist";
type CalendarChoice = { id: string; name: string; offeringIds: string[]; pinnedOfferingIds?: string[]; registeredOfferingIds?: string[]; ffcsOriginalOfferingIds?: string[] };
const CALENDAR_KEY = "ffcs-helper:calendars:v1";
const FFCS_REJECTIONS_KEY = "ffcs-helper:ffcs-rejected-faculty:v1";
const SHORTLIST_KEY = "ffcs-helper:shortlist:v1";
const ACTIVE_CALENDAR_KEY = "ffcs-helper:active-calendar:v1";
function initialShortlist(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || "null");
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) return parsed;
  } catch { /* Start with an empty shortlist when storage is unavailable. */ }
  return [];
}
function initialAlternativeCourses(): string[] {
  try {
    const shortlisted = new Set(initialShortlist());
    const parsed: unknown = JSON.parse(localStorage.getItem("ffcs-helper:alternative-courses:v1") || "null");
    if (Array.isArray(parsed)) return [...new Set(parsed.filter((id): id is string => typeof id === "string" && !shortlisted.has(id)))];
  } catch { /* Start with an empty alternatives list when storage is unavailable. */ }
  return [];
}
function initialActiveCalendarId(calendars: CalendarChoice[]): string {
  try {
    const id = localStorage.getItem(ACTIVE_CALENDAR_KEY);
    if (id && calendars.some((calendar) => calendar.id === id)) return id;
  } catch { /* Use the first calendar when storage is unavailable. */ }
  return calendars[0]?.id || "calendar-main";
}
function initialCalendars(): CalendarChoice[] {
  try {
    const raw = localStorage.getItem(CALENDAR_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length && parsed.every((x) =>
      x && typeof x.id === "string" && typeof x.name === "string" &&
      (x.registeredOfferingIds === undefined || (Array.isArray(x.registeredOfferingIds) && x.registeredOfferingIds.every((id: unknown) => typeof id === "string"))) &&
      (x.ffcsOriginalOfferingIds === undefined || (Array.isArray(x.ffcsOriginalOfferingIds) && x.ffcsOriginalOfferingIds.every((id: unknown) => typeof id === "string"))) &&
      Array.isArray(x.offeringIds) && x.offeringIds.every((id: unknown) => typeof id === "string") &&
      (x.pinnedOfferingIds === undefined || (Array.isArray(x.pinnedOfferingIds) && x.pinnedOfferingIds.every((id: unknown) => typeof id === "string"))))) return parsed;
  } catch { /* Start with a local empty calendar when storage is unavailable. */ }
  return [{ id: "calendar-main", name: "My timetable", offeringIds: [] }];
}
function courseDomain(course: Catalog["courses"][number]): string {
  if (course.categoryName || course.category) return course.categoryName || course.category!;
  const source = course.provenance?.url?.split("/").pop()?.replace(/\.ts$/, "") || "";
  const domains: Record<string, string> = {
    FoundationCore: "Foundation Core",
    DiscliplineCore: "Discipline Core",
    DisciplineElective: "Discipline Electives",
    DisciplineLinked: "Linked Courses",
    OpenElective: "Open Electives",
    SE_DS: "Data Science",
    SE_BCB: "Computational Biology",
    SE_AIML: "AI & Machine Learning",
    SE_IOT: "Internet of Things",
    SE_IS: "Information Security",
    SE_Blockchain: "Blockchain",
  };
  return domains[source] || "Other / imported";
}
function displayCourseTitle(course: Catalog["courses"][number]): string {
  const title = course.title.trim();
  const code = course.code.trim();
  const withoutCode = title.replace(new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:[·–—:-]\\s*)?`, "i"), "").trim();
  return withoutCode || title;
}
function displayComponentType(component: Offering["components"][number]): string {
  if (component.sourceType === "ETH" || component.sourceType === "TH") return "Theory";
  if (component.sourceType === "ELA" || component.sourceType === "LO" || component.sourceType === "LA") return "Lab";
  return component.sourceType || component.type[0].toUpperCase() + component.type.slice(1);
}
function initialCatalog(): Catalog {
  try {
    const raw = localStorage.getItem("ffcs-helper-catalog");
    if (raw) {
      const result = validateCatalog(JSON.parse(raw));
      if (result.catalog && !result.errors.length && result.catalog.semester === defaultCatalog.semester) {
        if (result.catalog.provenance.source === "Current faculty and course allocations") {
          localStorage.removeItem("ffcs-helper-catalog");
        } else {
          return result.catalog;
        }
      }
    }
  } catch {
    /* Default catalog remains available when browser storage is blocked. */
  }
  return defaultCatalog;
}
function initialPlans(): Plan[] {
  try {
    return loadPlans();
  } catch {
    return [];
  }
}
function initialBlockedTimes(): BlockedWindow[] {
  try {
    return loadBlockedWindows();
  } catch {
    return [];
  }
}
const theoryBatchLabels = {
  morning: "Morning theory",
  evening: "Evening theory",
  any: "Mixed / any",
} as const;
const nav = [{ id: "planner", title: "Course planner", icon: CalendarBlank }] as const;
export default function App() {
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const [reviewDataLoaded, setReviewDataLoaded] = useState(false);
  const reviewLibraryRef = useRef<ReviewLibrary | null>(null);
  const reviewLoadPromiseRef = useRef<Promise<void> | null>(null);
  const ensureReviewData = async () => {
    if (reviewDataLoaded) return;
    if (reviewLoadPromiseRef.current) return reviewLoadPromiseRef.current;
    reviewLoadPromiseRef.current = (async () => {
      try {
        const library = await loadReviewLibrary();
        reviewLibraryRef.current = library;
        setCatalog((current) => attachReviewLibrary(current, library));
        setReviewDataLoaded(true);
      } catch {
        setMessage("Faculty feedback could not be loaded. Check your connection and try again.");
      } finally {
        reviewLoadPromiseRef.current = null;
      }
    })();
    return reviewLoadPromiseRef.current;
  };
  const [view, setView] = useState<View>("planner");
  const [mobilePlannerSection, setMobilePlannerSection] = useState<MobilePlannerSection>("search");
  const [courseId, setCourseId] = useState("");
  const [offeringPage, setOfferingPage] = useState(0);
  const calendarMeasureRef = useRef<HTMLDivElement>(null);
  const [calendarPanelHeight, setCalendarPanelHeight] = useState(0);
  const [facultySearch, setFacultySearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [activeCourseSuggestion, setActiveCourseSuggestion] = useState(0);
  const [domainFilter, setDomainFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState<"" | "ECE" | "ECM">(() => {
    try {
      const saved = localStorage.getItem("ffcs-helper:branch");
      return saved === "ECE" || saved === "ECM" ? saved : "";
    } catch { return ""; }
  });
  useEffect(() => {
    try {
      if (branchFilter) localStorage.setItem("ffcs-helper:branch", branchFilter);
      else localStorage.removeItem("ffcs-helper:branch");
    } catch { /* Keep the selected branch for this session. */ }
  }, [branchFilter]);
  const [previewOfferingId, setPreviewOfferingId] = useState("");
  const [calendars, setCalendars] = useState<CalendarChoice[]>(initialCalendars);
  const [activeCalendarId, setActiveCalendarId] = useState(() => initialActiveCalendarId(initialCalendars()));
  const [renamingCalendarId, setRenamingCalendarId] = useState("");
  const [calendarNameDraft, setCalendarNameDraft] = useState("");
  const [calendarToDelete, setCalendarToDelete] = useState<CalendarChoice | null>(null);
  const calendarDeleteDialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (calendarToDelete) calendarDeleteDialogRef.current?.focus();
  }, [calendarToDelete]);
  const [selected, setSelected] = useState<string[]>([]);
  const [basket, setBasket] = useState<string[]>(initialShortlist);
  const [alternativeCourses, setAlternativeCourses] = useState<string[]>(initialAlternativeCourses);
  function updateAlternatives(ids: string[]) {
    const next = [...new Set(ids)];
    setAlternativeCourses(next);
    try { localStorage.setItem("ffcs-helper:alternative-courses:v1", JSON.stringify(next)); }
    catch { setMessage("Alternative courses saved for this session only."); }
  }

  useEffect(() => {
    try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify(basket)); }
    catch { setMessage("Shortlist changes are active for this session, but browser storage is unavailable."); }
  }, [basket]);
  useEffect(() => {
    try { localStorage.setItem(ACTIVE_CALENDAR_KEY, activeCalendarId); } catch { /* Calendar selection remains active for this session. */ }
  }, [activeCalendarId]);
  const [prefs, setPrefs] = useState<Preferences>({ ...defaultPreferences });
  useEffect(() => { try { const v=JSON.parse(localStorage.getItem('ffcs-helper:faculty-preferences:v1')||'{}'); setPrefs(p=>({...p,preferredFaculty:Array.isArray(v.preferredFaculty)?v.preferredFaculty:[],blockedFaculty:Array.isArray(v.blockedFaculty)?v.blockedFaculty:[],facultyMode:v.facultyMode||'preferred',ratingThreshold:v.ratingThreshold??3})); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem('ffcs-helper:faculty-preferences:v1',JSON.stringify({preferredFaculty:prefs.preferredFaculty||[],blockedFaculty:prefs.blockedFaculty||[],facultyMode:prefs.facultyMode||'preferred',ratingThreshold:prefs.ratingThreshold??3})); } catch {} }, [prefs]);
  const [allBlockedTimes, setAllBlockedTimes] = useState<BlockedWindow[]>(initialBlockedTimes);
  const activeCalendar = calendars.find((c) => c.id === activeCalendarId) || calendars[0];
  const blockedTimes = allBlockedTimes.filter(block => !block.calendarId || block.calendarId === activeCalendar.id);
  const pinnedOfferingIds = (activeCalendar.pinnedOfferingIds || []).filter(id => activeCalendar.offeringIds.includes(id));
  const pinnedOfferings = catalog.offerings.filter(o => pinnedOfferingIds.includes(o.id));
  function setBlockedTimes(next: BlockedWindow[]) {
    const combined = [...allBlockedTimes.filter(block => block.calendarId && block.calendarId !== activeCalendar.id), ...next];
    if (combined.length > 5000 || calendars.some(calendar => combined.filter(block => !block.calendarId || block.calendarId === calendar.id).length > 50)) { setMessage("Keep up to 50 time blocks per timetable."); return; }
    setAllBlockedTimes(combined);
  }
  function addTimeBlock(block: BlockedWindow, scope: 'this' | 'all') {
    setBlockedTimes([...blockedTimes, { ...block, ...(scope === 'this' ? { calendarId: activeCalendar.id } : {}) }]);
  }
  function togglePin(offeringId: string) {
    const next = pinnedOfferingIds.includes(offeringId) ? pinnedOfferingIds.filter(id => id !== offeringId) : [...pinnedOfferingIds, offeringId];
    persistCalendars(calendars.map(calendar => calendar.id === activeCalendar.id ? { ...calendar, pinnedOfferingIds: next } : calendar));
  }
  useEffect(() => {
    const node = calendarMeasureRef.current;
    if (!node) return;
    const updateHeight = () => setCalendarPanelHeight(node.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [courseId, activeCalendarId, previewOfferingId, blockedTimes.length]);
  useEffect(() => {
    try { saveBlockedWindows(allBlockedTimes); }
    catch { setMessage("Blocked times are active for this session, but browser storage is unavailable."); }
  }, [allBlockedTimes]);
  const [generationFeedback, setGenerationFeedback] = useState("");
  const [useCurrentCalendar, setUseCurrentCalendar] = useState(false);
  const generationCycles = useRef(new Map<string, string[][]>());
  const [message, setMessage] = useState(() => {
    try {
      loadPlans();
      localStorage.getItem("ffcs-helper-catalog");
      return "";
    } catch (e) {
      return `Browser storage could not be loaded: ${e instanceof Error ? e.message : "unavailable"}. You can continue for this session and export a backup.`;
    }
  });
  useEffect(() => {
    const report = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("ffcs-toast", report);
    return () => window.removeEventListener("ffcs-toast", report);
  }, []);
  const [busy, setBusy] = useState(false);
  const [ffcsMode, setFfcsMode] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (registrationComplete) {
      completionHeadingRef.current?.focus();
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [registrationComplete]);
  const [preferenceMode, setPreferenceMode] = useState(false);
  useEffect(() => {
    if (view === "faculty" || preferenceMode) void ensureReviewData();
  }, [view, preferenceMode]);
  const [preferenceCourseId, setPreferenceCourseId] = useState("");
  const [preferenceSearch, setPreferenceSearch] = useState("");
  const [preferenceMinRating, setPreferenceMinRating] = useState(0);
  const [preferenceRatingFilter, setPreferenceRatingFilter] = useState("all");
  const [preferenceSelectedOnly, setPreferenceSelectedOnly] = useState(false);
  const [preferenceSort, setPreferenceSort] = useState("name");
  const clearTeacherFilters = () => {
    setPreferenceSearch("");
    setPreferenceMinRating(0);
    setPreferenceRatingFilter("all");
    setPreferenceSelectedOnly(false);
    setPreferenceSort("name");
  };
  const [ffcsReturning, setFfcsReturning] = useState(false);
  const ffcsLockedCourses = (activeCalendar.registeredOfferingIds || []).flatMap(id => { const o = catalog.offerings.find(o => o.id === id && activeCalendar.offeringIds.includes(id)); return o ? [o.courseId] : []; });
  const [ffcsDisintegratingCourse, setFfcsDisintegratingCourse] = useState("");
  const [ffcsRejections, setFfcsRejections] = useState<Record<string, string[]>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(FFCS_REJECTIONS_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every(id => typeof id === "string"))) : {};
    } catch { return {}; }
  });
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [name, setName] = useState("");
  const [exportWeek, setExportWeek] = useState("");
  const [editing, setEditing] = useState<string>();
  const [compare, setCompare] = useState<string[]>([]);
  const [facultyQuery, setFacultyQuery] = useState("");
  const [facultyPage, setFacultyPage] = useState(0);
  const [facultySort, setFacultySort] = useState("name");
  const [facultyCoverage, setFacultyCoverage] = useState("all");
  const [facultyCategory, setFacultyCategory] = useState("All");
  const sourceDate = catalog.provenance.updatedAt || catalog.provenance.importedAt;
  const sourceIsOld = Date.now() - Date.parse(sourceDate) > 90 * 24 * 60 * 60 * 1000;
  const fingerprint = useMemo(() => catalogFingerprint(catalog), [catalog]);
  const course = catalog.courses.find((c) => c.id === courseId);
  const previewOffering = catalog.offerings.find((o) => o.id === previewOfferingId);
  const hasVerifiedMeetingTimes = catalog.offerings.some((offering) => offering.components.some((component) => component.meetings.length > 0));
  useEffect(() => {
    if (!hasVerifiedMeetingTimes && mobilePlannerSection !== "search") setMobilePlannerSection("search");
  }, [hasVerifiedMeetingTimes, mobilePlannerSection]);
  // VTOP account labels provide the ECE/ECM split; do not infer it from course codes.
  const hasAccountData = catalog.courses.some((item) => !!item.account);
  const branchCourses = hasAccountData
    ? branchFilter ? catalog.courses.filter((item) => item.account === branchFilter) : []
    : catalog.courses;
  const branchCourseIds = new Set(branchCourses.map((item) => item.id));
  const branchOfferings = catalog.offerings.filter((item) => branchCourseIds.has(item.courseId));
  const domains = [...new Set(branchCourses.map(courseDomain))].sort((a, b) => a.localeCompare(b));
  const subjectCourses = domainFilter
    ? branchCourses.filter((c) => courseDomain(c) === domainFilter)
    : [];
  const searchedCourses = courseSearch.trim()
    ? searchCourses(catalog, courseSearch).filter((item) => !hasAccountData || item.account === branchFilter).slice(0, 8)
    : [];
  const selectedOfferings = useMemo(
    () =>
      selected
        .map((id) => catalog.offerings.find((o) => o.id === id))
        .filter((o): o is Offering => !!o),
    [catalog, selected],
  );
  const selectedConflicts = getConflicts(selectedOfferings);
  const shortlistedCourseIds = [...new Set([...basket, ...selectedOfferings.map((o) => o.courseId)])];
  const offerings = course
    ? catalog.offerings.filter((o) => o.courseId === course.id)
    : [];
  const activeCalendarOfferings = activeCalendar?.offeringIds
    .map((id) => catalog.offerings.find((o) => o.id === id))
    .filter((o): o is Offering => !!o) || [];
  const ffcsGroups = [...activeCalendarOfferings.reduce((groups, offering) => {
    const item = catalog.courses.find(c => c.id === offering.courseId);
    if (!item) return groups;
    const label = item.categoryName || item.category || courseDomain(item);
    const group = groups.get(label) || [];
    group.push({ offering, course: item });
    groups.set(label, group);
    return groups;
  }, new Map<string, { offering: Offering; course: Catalog["courses"][number] }[]>())]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, courses]) => ({ label, courses: courses.sort((a, b) => a.course.code.localeCompare(b.course.code)) }));
  async function replaceFfcsCourse(courseId: string) {
    if (busy || !activeCalendar || !activeCalendarOfferings.some(o => o.courseId === courseId)) return;
    const current = activeCalendarOfferings.find(o => o.courseId === courseId)!;
    setBusy(true);
    setGenerationFeedback("Finding a replacement while keeping registered courses fixed…");
    await new Promise(resolve => window.setTimeout(resolve, 30));
    try {
      const rejections = ffcsRejections;
      persistFfcsRejections({ ...rejections, [courseId]: [...new Set([...(rejections[courseId] || []), current.facultyId])] });
      const result = repairFfcs(catalog, activeCalendarOfferings, courseId, ffcsLockedCourses, rejections, prefs, alternativeCourses);
      if (!result.offeringIds) { setMessage(result.message || "No replacement found."); return; }
      persistCalendars(calendars.map(calendar => calendar.id === activeCalendar.id
        ? { ...calendar, offeringIds: result.offeringIds! } : calendar));
      setMessage("");
      if (result.substitutedCourseId) updateAlternatives(alternativeCourses.filter(id => id !== result.substitutedCourseId));
    } finally {
      setBusy(false);
      setGenerationFeedback("");
      setFfcsDisintegratingCourse("");
    }
  }

  const visibleOfferings = offerings.flatMap((offering) =>
    [...new Set([offering.facultyId, ...offering.components.map((c) => c.facultyId).filter((id): id is string => !!id)])]
      .map((facultyId) => ({ offering, facultyId, blocked: offeringBlockedBy(offering, blockedTimes) })),
  ).filter(({ offering, facultyId, blocked }) => {
    if (blocked) return false;
    const facultyName = catalog.faculty.find((f) => f.id === facultyId)?.name || "";
    return `${offering.section} ${facultyName} ${offering.components.flatMap((c) => c.slots).join(" ")}`
      .toLowerCase().includes(facultySearch.toLowerCase());
  }).sort((a, b) => (a.offering.id === previewOfferingId ? -1 : b.offering.id === previewOfferingId ? 1 : 0) || (a.blocked ? 1 : 0) - (b.blocked ? 1 : 0));
  const basketFacultyIds = useMemo(
    () =>
      new Set(
        catalog.offerings
          .filter((o) => basket.includes(o.courseId))
          .flatMap((o) => [
            o.facultyId,
            ...o.components
              .map((c) => c.facultyId)
              .filter((id): id is string => !!id),
          ]),
      ),
    [catalog, basket],
  );
  const preferenceCourseIds = [...new Set([...shortlistedCourseIds, ...activeCalendarOfferings.map(o => o.courseId), ...alternativeCourses])];
  const preferenceCourse = catalog.courses.find(c => c.id === preferenceCourseId && preferenceCourseIds.includes(c.id)) || catalog.courses.find(c => preferenceCourseIds.includes(c.id));
  const preferenceFacultyIds = new Set(catalog.offerings.filter(o => o.courseId === preferenceCourse?.id).flatMap(o => [o.facultyId, ...o.components.flatMap(c => c.facultyId ? [c.facultyId] : [])]));
  const preferenceFaculty = catalog.faculty.filter(f => preferenceFacultyIds.has(f.id));
  const filteredPreferenceFaculty = preferenceFaculty.map(f => ({
    faculty: f,
    rating: preferredRating(catalog, f.id, preferenceCourse?.id),
  })).filter(({ faculty, rating }) =>
    faculty.name.toLowerCase().includes(preferenceSearch.trim().toLowerCase()) &&
    (!preferenceSelectedOnly || (prefs.preferredFaculty || []).includes(faculty.id)) &&
    (preferenceRatingFilter === "all" || (preferenceRatingFilter === "rated" ? !!rating : !rating)) &&
    (!preferenceMinRating || (rating?.rating != null && rating.rating >= preferenceMinRating))
  ).sort((a, b) => {
    if (preferenceSort === "rating") return (b.rating?.rating ?? -1) - (a.rating?.rating ?? -1) || a.faculty.name.localeCompare(b.faculty.name);
    if (preferenceSort === "reviews") return (b.rating?.sampleSize ?? -1) - (a.rating?.sampleSize ?? -1) || a.faculty.name.localeCompare(b.faculty.name);
    return a.faculty.name.localeCompare(b.faculty.name);
  });
  const teacherFiltersActive = !!preferenceSearch || preferenceMinRating > 0 || preferenceRatingFilter !== "all" || preferenceSelectedOnly || preferenceSort !== "name";
  const ratedFaculty = useMemo(()=>new Map(catalog.faculty.map(f => [f.id, preferredRating(catalog,f.id)])),[catalog]);
  const reviewedFaculty = useMemo(()=>new Set(catalog.reviews.map(r=>r.facultyId)),[catalog]);
  const browsing = facultyQuery.trim().length === 0;
  const faculties = facultyAllocations.map((record) => {
    const key = normalizeFacultyName(record.name);
    const match = catalog.faculty.find((f) => normalizeFacultyName(f.name) === key);
    const id = match?.id ?? `vtop-faculty-${key}`;
    const person = match ?? { id, name: record.name };
    const reviewCatalog = match ? catalog : { ...catalog, faculty: [...catalog.faculty, person] };
    const assignments = browsing && facultyCategory !== "All" ? record.assignments.filter((a) => a.category === facultyCategory) : record.assignments;
    return { ...person, assignments, reviewCatalog };
  }).filter(f =>
    (f.assignments.length > 0) &&
    (f.name.toLowerCase().includes(facultyQuery.toLowerCase()) || normalizeFacultyName(f.name).includes(normalizeFacultyName(facultyQuery))) &&
    (facultyCoverage === 'all' || (facultyCoverage === 'rated' ? ratedFaculty.has(f.id) && !!ratedFaculty.get(f.id) : reviewedFaculty.has(f.id)))
  ).sort((a,b)=>{
    const x=ratedFaculty.get(a.id),y=ratedFaculty.get(b.id);
    const query=normalizeFacultyName(facultyQuery);
    const namePriority=(name:string)=>{const key=normalizeFacultyName(name);return !query?0:key===query?3:key.startsWith(query)?2:0;};
    return (namePriority(b.name)-namePriority(a.name)) || (facultySort==='rating' ? (y?.rating??-1)-(x?.rating??-1) : facultySort==='samples' ? (y?.sampleSize??-1)-(x?.sampleSize??-1) : 0) || a.name.localeCompare(b.name);
  });
  function persist(next: Plan[]) {
    setPlans(next);
    try {
      savePlans(next);
      setMessage("Plans saved on this device.");
    } catch (e) {
      setMessage(
        `Plans remain in this session, but browser storage failed: ${e instanceof Error ? e.message : "storage unavailable"}`,
      );
    }
  }
  function persistCalendars(next: CalendarChoice[]) {
    setCalendars(next);
    try { localStorage.setItem(CALENDAR_KEY, JSON.stringify(next)); }
    catch { setMessage("Calendar changes are active for this session, but browser storage is unavailable."); }
  }
  function persistFfcsRejections(next: Record<string, string[]>) {
    setFfcsRejections(next);
    try { localStorage.setItem(FFCS_REJECTIONS_KEY, JSON.stringify(next)); }
    catch { setMessage("This rejection is active for this session, but browser storage is unavailable."); }
  }
  function addToCalendar(offering: Offering) {
    if (offering.pairingStatus === "unresolved") {
      setMessage("Theory/lab pairing unresolved; confirm the complete section in VTOP before adding it to a calendar.");
      return;
    }
    if (offering.scheduleStatus === "browse-only") {
      setMessage(`This allocation is browse-only: ${offering.scheduleNote || "complete meeting times are unavailable"}`);
      return;
    }
    if (!isSchedulableOffering(offering)) {
      setMessage("This allocation has incomplete or conflicting meeting data and cannot be added to a calendar.");
      return;
    }
    if (pinnedOfferings.some(o => o.courseId === offering.courseId && o.id !== offering.id)) {
      setMessage("Unpin this course before replacing its class.");
      return;
    }
    const current = activeCalendarOfferings.filter((o) => o.courseId !== offering.courseId);
    const clashes = current.filter((o) => conflicts(o, offering));
    if (clashes.length) {
      setMessage(`Cannot add this class: it clashes with ${clashes.map((o) => catalog.courses.find((c) => c.id === o.courseId)?.code || o.section).join(", ")}.`);
      return;
    }
    const blocked = offeringBlockedBy(offering, blockedTimes);
    if (blocked && !window.confirm(`This class falls inside your blocked time ${formatClock(blocked.start)}–${formatClock(blocked.end)}. Add it anyway?`)) {
      setMessage("Class not added. It overlaps a blocked time.");
      return;
    }
    persistCalendars(calendars.map((c) => c.id === activeCalendar.id
      ? { ...c, offeringIds: [...current.map((o) => o.id), offering.id] } : c));
    if (alternativeCourses.includes(offering.courseId)) updateAlternatives(alternativeCourses.filter(id => id !== offering.courseId));
    setPreviewOfferingId("");
    setMessage(`${catalog.courses.find((c) => c.id === offering.courseId)?.code} added to ${activeCalendar.name}.`);
  }
  function addCalendar() {
    const next = { id: crypto.randomUUID(), name: `Calendar ${calendars.length + 1}`, offeringIds: [] };
    persistCalendars([...calendars, next]);
    setActiveCalendarId(next.id);
    setPreviewOfferingId("");
  }
  function beginRenameCalendar(calendar: CalendarChoice) {
    setRenamingCalendarId(calendar.id);
    setCalendarNameDraft(calendar.name);
  }
  function saveCalendarName(id: string) {
    const name = calendarNameDraft.trim();
    if (!name) { setMessage("Enter a name for this calendar."); return; }
    if (calendars.some((item) => item.id !== id && item.name.trim().toLowerCase() === name.toLowerCase())) {
      setMessage("Choose a calendar name that is not already in use.");
      return;
    }
    persistCalendars(calendars.map((item) => item.id === id ? { ...item, name } : item));
    setRenamingCalendarId("");
    setCalendarNameDraft("");
    setMessage(`Calendar renamed to ${name}.`);
  }
  function cancelRenameCalendar() {
    setRenamingCalendarId("");
    setCalendarNameDraft("");
  }
  function deleteCalendar(id: string) {
    if (calendars.length <= 1) {
      setMessage("Keep at least one calendar. Add another calendar before deleting this one.");
      return;
    }
    const calendar = calendars.find((item) => item.id === id);
    if (!calendar) return;
    setCalendarToDelete(calendar);
  }
  function confirmDeleteCalendar() {
    if (!calendarToDelete) return;
    const id = calendarToDelete.id;
    const next = calendars.filter((item) => item.id !== id);
    persistCalendars(next);
    setAllBlockedTimes(allBlockedTimes.filter(block => block.calendarId !== id));
    if (activeCalendarId === id) setActiveCalendarId(next[0].id);
    setPreviewOfferingId("");
    setMessage(`${calendarToDelete.name} deleted.`);
    setCalendarToDelete(null);
  }
  function chooseCourse(id: string) {
    const next = catalog.courses.find((c) => c.id === id);
    if (next) setDomainFilter(courseDomain(next));
    setCourseId(id);
    setCourseSearch("");
    setFacultySearch("");
    setPreviewOfferingId("");
    setOfferingPage(0);
  }
  function openClassSubject(courseId: string, offeringId: string) {
    chooseCourse(courseId);
    setPreviewOfferingId(offeringId);
    requestAnimationFrame(() => document.querySelector(".catalog-column")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function applyCatalog(next: Catalog) {
    if (reviewLibraryRef.current) next = attachReviewLibrary(next, reviewLibraryRef.current);
    setCatalog(next);
    setSelected([]);
    setBasket([]);
    updateAlternatives([]);
    setCourseId("");
    setFacultySearch("");
    setPreviewOfferingId("");
    setEditing(undefined);
    try {
      localStorage.setItem("ffcs-helper-catalog", JSON.stringify(next));
      setMessage("Catalog applied and stored on this device.");
    } catch {
      setMessage(
        "Catalog applied for this session. Browser storage is unavailable.",
      );
    }
    setView("planner");
  }
  async function generate(fromCalendar = false) {
    if (busy) return;
    if (!fromCalendar && hasAccountData && !branchFilter) {
      const error = "Select a branch before generating a timetable.";
      setGenerationFeedback(error);
      setMessage(error);
      return;
    }
    const useCalendar = fromCalendar || useCurrentCalendar;
    const constraints = calendarGenerationConstraints(useCalendar, pinnedOfferings, blockedTimes);
    const generationPins = constraints.pinnedOfferings;
    if (!(shortlistedCourseIds.length || generationPins.length)) {
      setMessage("Add at least one course to your generation basket.");
      return;
    }
    setBusy(true);
    setGenerationFeedback("Finding clash-free calendar layouts…");
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const preferences = { ...prefs, maxResults: Math.min(5, prefs.maxResults) };
      preferences.blockedFaculty = prefs.blockedFaculty || [];
      preferences.preferredFaculty = prefs.preferredFaculty || [];
      const generationCourses = [...new Set([...shortlistedCourseIds, ...generationPins.map(o => o.courseId)])];
      const pinnedChoices = constraints.pinnedChoices;
      const generationBlocks = constraints.blockedTimes;
      // Alternatives and each calendar have independent cursors and constraints.
      const cycleKey = JSON.stringify([
        fromCalendar ? activeCalendar.id : "alternatives", useCalendar, fingerprint,
        [...generationCourses].sort(), preferences, pinnedChoices,
        generationBlocks.map(block => JSON.stringify([[...block.days].sort(), block.start, block.end])).sort(),
      ]);
      const cycle = nextGenerationCycle(generationCycles.current.get(cycleKey) || (fromCalendar && activeCalendar.offeringIds.length ? [activeCalendar.offeringIds] : []), excluded =>
        generateSchedules(catalog, generationCourses,
          { ...preferences, maxResults: fromCalendar ? 1 : preferences.maxResults },
          pinnedChoices, generationBlocks, excluded, true));
      generationCycles.current.set(cycleKey, cycle.history);
      const result = cycle.result;
      const newSchedules = result.schedules;
      const schedulesToApply = newSchedules;
      const cycledToFirst = cycle.restarted;
      if (schedulesToApply.length) {
        if (fromCalendar) {
          const updatedCalendars = calendars.map(calendar => calendar.id === activeCalendar.id
            ? { ...calendar, offeringIds: [...schedulesToApply[0].offeringIds], pinnedOfferingIds: [...pinnedOfferingIds] }
            : calendar);
          persistCalendars(updatedCalendars);
        } else {
          const generatedNames = calendars.map((calendar) => calendar.name.match(/^Generated (\d+)$/)?.[1]).filter(Boolean).map(Number);
          let nextGeneratedName = Math.max(0, ...generatedNames) + 1;
          const generated = newSchedules.map((schedule) => ({
            id: crypto.randomUUID(), name: `Generated ${nextGeneratedName++}`, offeringIds: [...schedule.offeringIds], pinnedOfferingIds: generationPins.map(offering => offering.id),
          }));
          if (useCalendar) {
            const copiedBlocks = generated.flatMap(calendar => generationBlocks.filter(block => block.calendarId).map(block => ({ ...block, id: crypto.randomUUID(), calendarId: calendar.id })));
            setAllBlockedTimes(current => [...current, ...copiedBlocks]);
          }
          const nextCalendars = [...calendars, ...generated];
          persistCalendars(nextCalendars);
          if (generated[0]) setActiveCalendarId(generated[0].id);
        }
        setPreviewOfferingId("");
        requestAnimationFrame(() => document.querySelector(".calendar-switcher")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      setGenerationFeedback(cycledToFirst
        ? `This generation cycle restarted from its first available schedule. Kept ${generationPins.length} pinned class${generationPins.length === 1 ? "" : "es"} fixed.`
        : newSchedules.length
        ? fromCalendar
          ? `Updated this calendar with a new schedule. Kept ${generationPins.length} pinned class${generationPins.length === 1 ? "" : "es"} fixed.`
          : `Created ${newSchedules.length} new alternative${newSchedules.length === 1 ? "" : "s"}.`
        : `No schedule could be generated. ${result.message || "Try relaxing blocked times or changing your course shortlist."}`);
      setMessage(cycledToFirst
        ? `Generation cycle restarted. ${result.explored} combinations explored.`
        :
        `${newSchedules.length} alternatives · ${result.explored} combinations explored.${result.truncated ? " Search limit reached; results may be incomplete." : ""} ${result.message || ""}`,
      );
    } catch (e) {
      setGenerationFeedback(e instanceof Error ? e.message : "Generation failed.");
      setMessage(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!name.trim()) {
      setMessage("Give your plan a name before saving.");
      return;
    }
    if (!activeCalendar.offeringIds.length) {
      setMessage("Select at least one section before saving.");
      return;
    }
    if (getConflicts(activeCalendarOfferings).length) {
      setMessage("Resolve clashes before saving.");
      return;
    }
    const plan: Plan = {
      id: editing || crypto.randomUUID(),
      name: name.trim(),
      offeringIds: [...activeCalendar.offeringIds],
      savedAt: new Date().toISOString(),
      semester: catalog.semester,
      catalogFingerprint: catalogFingerprint(catalog),
    };
    try { restorePlans({ plans: [plan] }, catalog); } catch (error) { setMessage(error instanceof Error ? error.message : "This calendar cannot be saved."); return; }
    persist([...plans.filter((p) => p.id !== plan.id), plan]);
    setEditing(plan.id);
    setMessage(`Saved ${plan.name} on this device.`);
  }
  function load(plan: Plan) {
    if (plan.catalogFingerprint !== catalogFingerprint(catalog)) {
      setMessage(
        "This plan belongs to a different catalog. Import its original catalog before loading it.",
      );
      return;
    }
    setSelected(plan.offeringIds);
    persistCalendars(calendars.map(calendar => calendar.id === activeCalendar.id ? { ...calendar, offeringIds: [...plan.offeringIds], pinnedOfferingIds: [] } : calendar));
    const planCourseIds = [
      ...new Set(
        catalog.offerings
          .filter((o) => plan.offeringIds.includes(o.id))
          .map((o) => o.courseId),
      ),
    ];
    setBasket(planCourseIds);
    updateAlternatives(alternativeCourses.filter(id => !planCourseIds.includes(id)));
    setName(plan.name);
    setEditing(plan.id);
    setView("planner");
    setMessage(`Editing ${plan.name}. Save to update this plan.`);
  }
  async function restore(file?: File) {
    if (!file) return;
    try {
      const restored = restorePlans(JSON.parse(await file.text()), catalog);
      const merged = new Map(plans.map((p) => [p.id, p]));
      restored.forEach((p) => merged.set(p.id, p));
      persist([...merged.values()]);
    } catch (e) {
      setMessage(
        `Backup could not be restored: ${e instanceof Error ? e.message : "invalid JSON"}`,
      );
    }
  }
  const exportAction = (action: () => void) => {
    try {
      action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    }
  };
  return (
    <div className={`app-shell ${ffcsMode && !preferenceMode ? "ffcs-theme" : ""} ${ffcsReturning && !preferenceMode ? "ffcs-returning" : ""} ${preferenceMode ? "preferences-screen" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="main-shell">
        {calendarToDelete && <div className="calendar-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarToDelete(null); }}>
          <section ref={calendarDeleteDialogRef} tabIndex={-1} className="calendar-confirm" role="alertdialog" aria-modal="true" aria-labelledby="calendar-confirm-title" aria-describedby="calendar-confirm-description"
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setCalendarToDelete(null); } else if (event.key === "Enter") { event.preventDefault(); confirmDeleteCalendar(); } }}>
            <h2 id="calendar-confirm-title">Delete calendar?</h2>
            <p id="calendar-confirm-description">Delete {calendarToDelete.name} and its {calendarToDelete.offeringIds.length} saved class{calendarToDelete.offeringIds.length === 1 ? "" : "es"}?</p>
            <div className="calendar-confirm-actions"><button type="button" onClick={() => setCalendarToDelete(null)}>No</button><button type="button" className="danger" onClick={confirmDeleteCalendar}>Yes, delete</button></div>
          </section>
        </div>}
        <main id="main">
          {view === "planner" && (
            <div className={`planner-view mobile-section-${mobilePlannerSection} ${ffcsMode ? "ffcs-mode" : ""} ${preferenceMode ? "preference-mode" : ""}`}>
              {registrationComplete ? <section className="registration-complete" aria-labelledby="registration-complete-title">
                <header className="registration-complete-intro">
                  <span className="registration-complete-check" aria-hidden="true"><Check size={32} weight="bold" /></span>
                  <span className="eyebrow">ALL COURSES REGISTERED</span>
                  <h1 id="registration-complete-title" ref={completionHeadingRef} tabIndex={-1}>Congratulations!</h1>
                  <p>You’re ready for the semester. Your Final Calendar is saved, and FFCS mode is off.</p>
                  <button type="button" onClick={() => {
                    setRegistrationComplete(false);
                    setMobilePlannerSection("timetable");
                    requestAnimationFrame(() => document.querySelector(".calendar-switcher")?.scrollIntoView({ block: "start" }));
                  }}><ArrowLeft size={17} /> Back to home</button>
                </header>
                <Timetable title="Final Calendar" catalog={catalog} offerings={activeCalendarOfferings} blockedTimes={blockedTimes} />
              </section> : preferenceMode ? <section className="teacher-preferences" aria-labelledby="teacher-preferences-title">
                <header className="teacher-preferences-header">
                  <button type="button" className="secondary preference-back" onClick={() => setPreferenceMode(false)}><ArrowLeft size={17} /> Back to planner</button>
                  <span className="preference-save-status"><Check size={16} /> Saved automatically</span>
                </header>
                <div className="teacher-preferences-intro">
                  <span className="eyebrow">YOUR TEACHING PREFERENCES</span>
                  <h1 id="teacher-preferences-title">Who would you like to learn from?</h1>
                  <p>Choose a course, then select the teachers you prefer. You can choose more than one. Your choices guide timetable generation and teacher replacements.</p>
                </div>
                {preferenceCourseIds.length ? <div className="teacher-selection-layout">
                  <nav className="preference-course-nav" aria-label="Courses for teacher preferences">
                    <h2>Your courses <span>{preferenceCourseIds.length}</span></h2>
                    {preferenceCourseIds.map(id => {
                      const course = catalog.courses.find(c => c.id === id);
                      if (!course) return null;
                      const ids = new Set(catalog.offerings.filter(o => o.courseId === id).flatMap(o => [o.facultyId, ...o.components.flatMap(c => c.facultyId ? [c.facultyId] : [])]));
                      const count = (prefs.preferredFaculty || []).filter(id => ids.has(id)).length;
                      return <button type="button" key={id} aria-current={preferenceCourse?.id === id ? "true" : undefined} onClick={() => { setPreferenceCourseId(id); setPreferenceSearch(""); }}>
                        <strong>{course.code}</strong><span>{displayCourseTitle(course)}</span><small>{count ? `${count} preferred` : "No preference yet"}</small>
                      </button>;
                    })}
                  </nav>
                  <section className="preference-teachers" aria-label="Available teachers">
                    <div className="preference-teachers-heading"><div><span className="eyebrow">{preferenceCourse?.code}</span><h2>{preferenceCourse && displayCourseTitle(preferenceCourse)}</h2><p>{preferenceFaculty.length} teacher{preferenceFaculty.length === 1 ? "" : "s"} · {(prefs.preferredFaculty || []).filter(id => preferenceFacultyIds.has(id)).length} preferred</p></div><Heart size={26} weight="duotone" /></div>
                    <label className="preference-search"><MagnifyingGlass size={19} /><input aria-label="Search teachers" placeholder="Search teachers by name" value={preferenceSearch} onChange={e => setPreferenceSearch(e.target.value)} /></label>
                    <div className="preference-filters">
                      <label>Ratings<select value={preferenceRatingFilter} onChange={e => { setPreferenceRatingFilter(e.target.value); if (e.target.value === "unrated") setPreferenceMinRating(0); }}><option value="all">All teachers</option><option value="rated">With ratings</option><option value="unrated">Without ratings</option></select></label>
                      <label>Minimum rating<select value={preferenceMinRating} onChange={e => { const minimum = Number(e.target.value); setPreferenceMinRating(minimum); if (minimum) setPreferenceRatingFilter("rated"); }}><option value={0}>Any rating</option><option value={3}>3.0 and above</option><option value={3.5}>3.5 and above</option><option value={4}>4.0 and above</option><option value={4.5}>4.5 and above</option></select></label>
                      <label>Sort by<select value={preferenceSort} onChange={e => setPreferenceSort(e.target.value)}><option value="name">Name A–Z</option><option value="rating">Highest rating</option><option value="reviews">Most reported reviews</option></select></label>
                    </div>
                    <div className="preference-filter-summary"><label><input type="checkbox" checked={preferenceSelectedOnly} onChange={e => setPreferenceSelectedOnly(e.target.checked)} />Preferred only</label><span role="status">{filteredPreferenceFaculty.length} of {preferenceFaculty.length} teachers</span>{teacherFiltersActive && <button type="button" className="text-button" onClick={clearTeacherFilters}>Clear filters</button>}</div>
                    <div className="preference-faculty-list">
                      {filteredPreferenceFaculty.map(({ faculty: f, rating }) => {
                        const selected = (prefs.preferredFaculty || []).includes(f.id);
                        return <label key={f.id}>
                          <input type="checkbox" checked={selected} onChange={() => setPrefs(p => ({ ...p, preferredFaculty: (p.preferredFaculty || []).includes(f.id) ? (p.preferredFaculty || []).filter(id => id !== f.id) : [...(p.preferredFaculty || []), f.id] }))} />
                          <span className="preference-teacher-identity"><span>{f.name}</span><span className="preference-teacher-rating">{rating ? <><strong>{rating.rating!.toFixed(2)}/5</strong><span> · {rating.sampleSize === null ? "Review count unknown" : `${rating.sampleSize} reported review${rating.sampleSize === 1 ? "" : "s"}`}{rating.courseId ? " · This course" : " · Overall"}</span></> : "No rating available"}</span></span><small>{selected ? "Preferred" : "Select teacher"}</small>
                        </label>;
                      })}
                    </div>
                    {!preferenceFaculty.length && <p className="preference-empty">No teachers are listed for this course.</p>}
                    {!!preferenceFaculty.length && !filteredPreferenceFaculty.length && <div className="preference-empty"><p>No teachers match your filters.</p><button type="button" className="secondary" onClick={clearTeacherFilters}>Clear filters</button></div>}
                    <p className="preference-selection-note">Leave teachers unselected if you have no preference for this course.</p>
                  </section>
                </div> : <div className="preference-empty"><Books size={32} /><h2>Add your courses first</h2><p>Shortlist courses in the planner to choose your preferred teachers here.</p><button type="button" onClick={() => setPreferenceMode(false)}>Find courses</button></div>}
                <footer className="teacher-preferences-footer"><span>Your teacher choices are saved on this device.</span><button type="button" onClick={() => setPreferenceMode(false)}>Done<Check size={17} /></button></footer>
              </section> : <>
              <div className="ffcs-toggle-row">
                {!preferenceMode && <button type="button" className="ffcs-toggle" role="switch" aria-checked={ffcsMode} onClick={() => {
                  const enabled = !ffcsMode;
                  if (enabled) {
                    persistCalendars(calendars.map(calendar => calendar.id === activeCalendar.id
                      ? { ...calendar, ffcsOriginalOfferingIds: calendar.ffcsOriginalOfferingIds || [...calendar.offeringIds] }
                      : calendar));
                  } else {
                    persistCalendars(calendars.map(calendar => {
                      if (calendar.ffcsOriginalOfferingIds === undefined) return calendar;
                      const { ffcsOriginalOfferingIds: _baseline, ...rest } = calendar;
                      return rest;
                    }));
                  }
                  setFfcsMode(enabled);
                  setFfcsReturning(!enabled);
                  if (!enabled) window.setTimeout(() => setFfcsReturning(false), 950);
                }}><span>FFCS mode</span><span className="ffcs-switch-track" aria-hidden="true"><span className="ffcs-switch-thumb"><Skull size={17} weight="fill" /></span></span></button>}
                {!ffcsMode && <button type="button" className="ffcs-toggle preference-toggle" onClick={() => { setPreferenceMode(true); setPreferenceSearch(""); }}><span>Teacher preferences</span><ArrowUpRight size={17} /></button>}
                {ffcsMode && <div className="ffcs-mode-tools"><button type="button" className="ffcs-clear-rejections" onClick={() => {
                  persistFfcsRejections({});
                  persistCalendars(calendars.map(calendar => calendar.id === activeCalendar.id
                    ? { ...calendar, offeringIds: calendar.ffcsOriginalOfferingIds || calendar.offeringIds, registeredOfferingIds: [] }
                    : calendar));
                  setMessage("Reset complete. Courses were restored, rejections were cleared, and all courses are ready to register again.");
                }}>Reset</button></div>}
              </div>
              <fieldset className="mobile-planner-nav" aria-label="Planner sections">
                <legend>Planner sections</legend>
                <label>
                  <input type="radio" name="mobile-planner-section" value="search" checked={mobilePlannerSection === "search"} onChange={() => setMobilePlannerSection("search")} />
                  <span>Find courses</span>
                </label>
                {hasVerifiedMeetingTimes && <>
                  <label>
                    <input type="radio" name="mobile-planner-section" value="timetable" checked={mobilePlannerSection === "timetable"} onChange={() => setMobilePlannerSection("timetable")} />
                    <span>Timetable</span>
                  </label>
                  <label>
                    <input type="radio" name="mobile-planner-section" value="shortlist" checked={mobilePlannerSection === "shortlist"} onChange={() => setMobilePlannerSection("shortlist")} />
                    <span>Shortlist</span>
                  </label>
                </>}
              </fieldset>
              {hasVerifiedMeetingTimes && <div className="planner-top-row">
                  <section className="panel scheduler-panel" aria-labelledby="scheduler-title">
                    <div className="scheduler-heading">
                      <span className="eyebrow">AUTO-SCHEDULER</span>
                      <h2 id="scheduler-title">Generate timetables</h2>
                    </div>
                    <div className="scheduler-options">
                      <div className="scheduler-options-heading"><SlidersHorizontal size={17} /><span>Ranking preferences</span><span className="optional-label">Optional</span></div>
                      <label className="scheduler-batch-field">Theory batch
                        <select value={prefs.theoryBatch} onChange={(e) => setPrefs({ ...prefs, theoryBatch: e.target.value as Preferences["theoryBatch"] })}>
                          <option value="any">{theoryBatchLabels.any}</option><option value="morning">{theoryBatchLabels.morning}</option><option value="evening">{theoryBatchLabels.evening}</option>
                        </select>
                      </label>
                        <label>
                          Gap reduction
                          <select
                            value={prefs.compactness}
                            onChange={(e) =>
                              setPrefs({
                                ...prefs,
                                compactness: Number(e.target.value),
                                minClassGap: Number(e.target.value) === -1 ? 30 : 9,
                              })
                            }
                          >
                            <option value={0}>No preference</option>
                            <option value={1}>Prefer compact days</option>
                            <option value={3}>Strongly reduce gaps</option>
                            <option value={-1}>More time between classes</option>
                          </select>
                        </label>
                        <label>
                          Alternatives
                          <select
                            value={prefs.maxResults}
                            onChange={(e) =>
                              setPrefs({
                                ...prefs,
                                maxResults: Number(e.target.value),
                              })
                            }
                          >
                            {[3, 5].map((n) => (
                              <option key={n} value={n}>
                                {n} schedules
                              </option>
                            ))}
                          </select>
                        </label>
                      {prefs.facultyOrder.length > 0 && (
                        <ol className="faculty-order scheduler-faculty-order">
                          {prefs.facultyOrder.map((id) => (
                            <li key={id}>
                              {catalog.faculty.find((f) => f.id === id)?.name}
                              <button
                                className="text-button"
                                onClick={() =>
                                  setPrefs({
                                    ...prefs,
                                    facultyOrder: prefs.facultyOrder.filter(
                                      (x) => x !== id,
                                    ),
                                  })
                                }
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    <button type="button" role="switch" aria-checked={useCurrentCalendar} className="secondary wide" disabled={busy} onClick={() => setUseCurrentCalendar(value => !value)}>
                      Use current calendar state: {useCurrentCalendar ? "On" : "Off"}
                    </button>
                    <p className="small muted">{useCurrentCalendar ? "Keep this calendar’s pinned classes and blocked times when creating alternatives." : "Start alternatives from empty: ignore calendar pins and blocked times."}</p>
                    <button
                      className="wide scheduler-generate"
                      disabled={busy || (!shortlistedCourseIds.length && !(useCurrentCalendar && pinnedOfferings.length))}
                      onClick={() => void generate()}
                    >
                      {busy
                        ? "Exploring section combinations…"
                        : "Generate alternatives"}{" "}
                      <ArrowUpRight size={17} />
                    </button>
                  </section>
              {hasVerifiedMeetingTimes && <section className="shortlist-panel" id="shortlist" aria-labelledby="shortlist-title">
                <div className="shortlist-head">
                  <h2 id="shortlist-title">Course shortlist <span className="shortlist-count">({shortlistedCourseIds.length} selected)</span></h2>
                  <p>Sections assigned automatically</p>
                </div>
                {shortlistedCourseIds.length ? <div className="shortlist-list">
                  {shortlistedCourseIds.map((id) => {
                    const c = catalog.courses.find((item) => item.id === id);
                    return <div className="shortlist-row" key={id}>
                      <button type="button" className="shortlist-course-identity" aria-label={`Select ${c?.code} and view available teachers`} onClick={() => chooseCourse(id)}><strong>{c?.code}</strong><CourseTitle title={c ? displayCourseTitle(c) : ""} /></button>
                      <button className="icon-button shortlist-remove" aria-label={`Remove ${c?.code} from shortlist`} onClick={() => {
                        setSelected((items) => items.filter((offeringId) => catalog.offerings.find((item) => item.id === offeringId)?.courseId !== id));
                        setBasket((items) => items.filter((course) => course !== id));
                      }}><X size={17} /></button>
                    </div>;
                  })}
                </div> : <div className="shortlist-empty"><Stack size={21} /><span>No courses added yet.</span><small>Search for a course above, then choose Add course to shortlist.</small></div>}
                {selectedConflicts.length > 0 && <p className="error shortlist-error">The applied timetable has {selectedConflicts.length} class clash{selectedConflicts.length === 1 ? "" : "es"}.</p>}
              </section>}
              </div>}
              {!ffcsMode && <section className="panel alternative-courses" aria-labelledby="alternative-courses-title">
                <div className="shortlist-head"><h2 id="alternative-courses-title">Alternative classes <span className="shortlist-count">({alternativeCourses.length} selected)</span></h2><p>Used when a course has no available replacement section.</p></div>
                {alternativeCourses.length ? <div className="shortlist-list">
                  {alternativeCourses.map(id => {
                    const c = catalog.courses.find(item => item.id === id);
                    if (!c) return null;
                    return <div className="shortlist-row" key={id}>
                      <div className="shortlist-course-identity"><strong>{c.code}</strong><CourseTitle title={displayCourseTitle(c)} /></div>
                      <button type="button" className="icon-button shortlist-remove" aria-label={`Remove ${c.code} from alternative classes`} onClick={() => updateAlternatives(alternativeCourses.filter(courseId => courseId !== id))}><X size={17} /></button>
                    </div>;
                  })}
                </div> : <div className="shortlist-empty"><Stack size={21} /><span>No alternative classes added yet.</span><small>Search for a course above, then choose Add as alternative.</small></div>}
              </section>}
              <section className="catalog-filters" aria-label="Find courses">
                <div className="catalog-search-wrap">
                  <MagnifyingGlass size={20} aria-hidden="true" />
                  <input id="search" type="search" value={courseSearch} maxLength={160}
                    placeholder="Search courses by name, code or faculty…"
                    aria-label="Search courses by name, code or faculty"
                    role="combobox" aria-autocomplete="list" aria-expanded={searchedCourses.length > 0}
                    aria-controls="course-suggestions" aria-activedescendant={searchedCourses[activeCourseSuggestion] ? `course-option-${searchedCourses[activeCourseSuggestion].id}` : undefined}
                    onChange={(e) => { setCourseSearch(e.target.value); setActiveCourseSuggestion(0); }}
                    onKeyDown={(e) => {
                      if (!searchedCourses.length) return;
                      if (e.key === "ArrowDown") { e.preventDefault(); setActiveCourseSuggestion((i) => (i + 1) % searchedCourses.length); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveCourseSuggestion((i) => (i - 1 + searchedCourses.length) % searchedCourses.length); }
                      else if (e.key === "Enter") { e.preventDefault(); chooseCourse(searchedCourses[activeCourseSuggestion]?.id ?? searchedCourses[0].id); }
                      else if (e.key === "Escape") setCourseSearch("");
                    }} />
                  {searchedCourses.length > 0 && <div id="course-suggestions" className="course-suggestions" role="listbox" aria-label="Matching courses">
                  {searchedCourses.map((c, index) => <button type="button" role="option" id={`course-option-${c.id}`} aria-selected={index === activeCourseSuggestion} className={index === activeCourseSuggestion ? "active" : undefined} key={c.id} onMouseEnter={() => setActiveCourseSuggestion(index)} onClick={() => chooseCourse(c.id)}>
                      <strong>{c.code}</strong><span>{displayCourseTitle(c)}</span>
                    </button>)}
                  </div>}
                  {courseSearch.trim() && searchedCourses.length === 0 && <div className="course-suggestions no-results" role="status">No matching courses. Try another code, title or faculty name.</div>}
                </div>
                <div className="catalog-filter-row">
                  <label className="catalog-filter"><span>Branch</span><select id="branch-filter" aria-label="Branch" value={branchFilter} onChange={(e) => {
                    setBranchFilter(e.target.value as "" | "ECE" | "ECM");
                    setDomainFilter(""); setCourseId(""); setCourseSearch(""); setFacultySearch(""); setPreviewOfferingId("");
                  }}><option value="">Choose a branch</option><option value="ECE">ECE</option><option value="ECM">ECM</option></select></label>
                  <label className="catalog-filter"><span>Category</span><select aria-label="Curriculum category" value={domainFilter} onChange={(e) => {
                    const value = e.target.value;
                    setDomainFilter(value);
                    if (!value || (course && courseDomain(course) !== value)) { setCourseId(""); setFacultySearch(""); setPreviewOfferingId(""); }
                  }}>
                    <option value="">Curriculum category</option>
                    {domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                  </select></label>
                  <label className="catalog-filter"><span>Course</span><select aria-label="Course" value={courseId} onChange={(e) => {
                    if (e.target.value) chooseCourse(e.target.value);
                    else { setCourseId(""); setFacultySearch(""); setPreviewOfferingId(""); }
                  }}>
                    <option value="">Choose a course</option>
                    {subjectCourses
                      .sort((a, b) => a.code.localeCompare(b.code)).map((c) => <option key={c.id} value={c.id}>{c.code} · {displayCourseTitle(c)}</option>)}
                  </select></label>
                </div>
              </section>

              <div className="workspace-grid">
                <section className="catalog-column">
                  {course ? (
                    <div className="picked-course">
                      <div className="picked-course-copy"><span className="eyebrow">SELECTED COURSE</span><h2>{course.code}</h2><p>{displayCourseTitle(course)}</p></div>
                      {hasVerifiedMeetingTimes && <div className="course-selection-actions">
                        <button type="button" className="shortlist-course-button" disabled={shortlistedCourseIds.includes(course.id) || alternativeCourses.includes(course.id)} onClick={() => setBasket((b) => b.includes(course.id) ? b : [...b, course.id])}>{shortlistedCourseIds.includes(course.id) ? <Check size={20} /> : <Plus size={24} />}{shortlistedCourseIds.includes(course.id) ? "Shortlisted" : alternativeCourses.includes(course.id) ? "Added as alternative" : "Shortlist"}</button>
                        <button type="button" className="shortlist-course-button" disabled={alternativeCourses.includes(course.id) || shortlistedCourseIds.includes(course.id)} onClick={() => updateAlternatives([...alternativeCourses, course.id])}>{alternativeCourses.includes(course.id) ? <Check size={20} /> : <GitBranch size={24} />}{alternativeCourses.includes(course.id) ? "Added as alternative" : shortlistedCourseIds.includes(course.id) ? "Added to shortlist" : "Alternative"}</button>
                      </div>}
                    </div>
                  ) : <div className="course-picker"><h2>Find your class</h2><p className="muted small">Search for a course or browse by curriculum category.</p></div>}
                  {course && (
                    <section className="course-detail">
                      <div className="faculty-search-heading"><h3>Find your faculty</h3><span>Search by name</span></div>
                      <label className="faculty-search-box">
                        <MagnifyingGlass size={21} aria-hidden="true" />
                        <input
                          value={facultySearch}
                          onChange={(e) => { setFacultySearch(e.target.value); setOfferingPage(0); }}
                          placeholder="Search faculty name..."
                          aria-label="Search faculty name"
                        />
                      </label>
                      <div className="section-heading">
                        <h3>Available faculty</h3>
                        <span>{visibleOfferings.length}</span>
                      </div>
                      <div className="faculty-list-scroll" role="region" aria-label="Available faculty list" tabIndex={0}
                        style={calendarPanelHeight ? { maxHeight: `${calendarPanelHeight}px` } : undefined}>
                      {visibleOfferings
                        .map(({ offering: o, facultyId, blocked }) => {
                          const mainFaculty = catalog.faculty.find((f) => f.id === facultyId);
                          const rating = preferredRating(catalog, facultyId, course.id);
                          // An offering is the class allocation. Keep all of its components
                          // together so linked theory and lab slots stay visible as one class.
                          const facultyComponents = o.components;
                          const stars = rating ? Math.max(0, Math.min(5, Math.round(rating.rating!))) : 0;
                          const inCalendar = activeCalendarOfferings.some((x) => x.id === o.id);
                          const isPreferred=(prefs.preferredFaculty||[]).includes(facultyId), isBlocked=(prefs.blockedFaculty||[]).includes(facultyId);
                          const clashes = activeCalendarOfferings.filter(
                            (s) => s.courseId !== o.courseId && conflicts(s, o),
                          );
                          return (
                            <article
                              className={`offering faculty-option ${previewOfferingId === o.id ? "previewing" : ""} ${blocked ? "offering-blocked" : ""} ${isBlocked ? "faculty-blocked" : ""}`}
                              key={`${o.id}-${facultyId}`}
                              onClick={() => setPreviewOfferingId(o.id)}
                            >
                              <div className="faculty-card-heading">
                                <div className="faculty-card-ident">
                                  <button className="faculty-preview" onClick={(event) => { event.stopPropagation(); setPreviewOfferingId(o.id); }} aria-pressed={previewOfferingId === o.id} aria-label={`Preview classes for ${mainFaculty?.name || "faculty allocation"}`}>
                                    <strong className="faculty-title">{mainFaculty?.name || "Faculty not recorded"}</strong>
                                    <span className="faculty-venues">{[...new Set(facultyComponents.map(c => c.venue).filter(Boolean))].join(" · ") || "Room unavailable"}</span>
                                  </button>
                                  <div className="faculty-actions" aria-label={`Preferences for ${mainFaculty?.name || 'faculty'}`}>
                                    <button className={`faculty-action prefer ${isPreferred?'active':''}`} aria-pressed={isPreferred} onClick={(event)=>{event.stopPropagation();setPrefs(p=>({...p,preferredFaculty:isPreferred?(p.preferredFaculty||[]).filter(x=>x!==facultyId):[...(p.preferredFaculty||[]),facultyId],blockedFaculty:(p.blockedFaculty||[]).filter(x=>x!==facultyId)}));}}><Heart size={19} weight={isPreferred ? 'fill' : 'regular'} />{isPreferred?'Preferred':'Prefer'}</button>
                                    <button className={`faculty-action block ${isBlocked?'active':''}`} aria-pressed={isBlocked} onClick={(event)=>{event.stopPropagation();setPrefs(p=>({...p,blockedFaculty:isBlocked?(p.blockedFaculty||[]).filter(x=>x!==facultyId):[...(p.blockedFaculty||[]),facultyId],preferredFaculty:(p.preferredFaculty||[]).filter(x=>x!==facultyId)}));}}><Prohibit size={19} />{isBlocked?'Blocked':'Block'}</button>
                                    {hasVerifiedMeetingTimes && <button className={`faculty-action calendar ${inCalendar?'active':''}`} disabled={clashes.length>0||!isSchedulableOffering(o)} aria-pressed={inCalendar} onClick={(event)=>{event.stopPropagation();addToCalendar(o);}}><CalendarPlus size={19} />{inCalendar?'Added to calendar':'Add to calendar'}</button>}
                                  </div>
                                </div>
                                <div className="faculty-score" aria-label={rating ? `${rating.rating!.toFixed(1)} out of 5` : "Rating unavailable"}>
                                  <span className="faculty-stars" aria-hidden="true">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
                                  <b>{rating ? `${rating.rating!.toFixed(1)}/5` : "No rating"}</b>
                                </div>
                              </div>
                              <div className="faculty-weekly-head"><strong>Class times</strong><span>{facultyComponents.map(c => c.venue).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(", ") || "Room unavailable"}</span></div>
                              <div className="faculty-component-grid">{facultyComponents.map((c, i) => (
                                <section className={`faculty-component-card ${c.sourceType === "ELA" || displayComponentType(c).toLowerCase().includes("lab") ? "faculty-component-lab" : ""}`} key={i}>
                                  <header><strong>{displayComponentType(c)}</strong><span>{c.slots.join(" + ") || "Slot unavailable"}</span></header>
                                  <div className="faculty-meetings">{c.meetings.map((m, j) => <div className="faculty-meeting" key={j}><b>{days[m.day]?.slice(0,3)}</b><strong>{time(m.start)}–{time(m.end)}</strong></div>)}{displayComponentType(c).toLowerCase().includes("lab") && <span className="faculty-lab-venue">{c.venue || "Venue unavailable"}</span>}</div>
                                  {!c.meetings.length && <p className="muted small">Meeting times unavailable for this source.</p>}
                                </section>
                              ))}</div>
                              {o.pairingStatus === "unresolved" && <p className="warning small">Theory/lab pairing unresolved; confirm the complete section in VTOP before adding it to a calendar.</p>}
                              {o.scheduleStatus === "browse-only" && <p className="warning small">Browse-only allocation: {o.scheduleNote || "meeting times are incomplete"} It cannot be added to the timetable.</p>}
                              {blocked && <p className="blocked-note small">Inside your blocked time {formatClock(blocked.start)}–{formatClock(blocked.end)}. Classes you preview here stay on the timetable, but confirm before adding.</p>}
                              {clashes.length > 0 && (
                                <p className="error small">
                                  Clashes with{" "}
                                  {clashes
                                    .map(
                                      (c) =>
                                        catalog.courses.find(
                                          (x) => x.id === c.courseId,
                                        )?.code,
                                    )
                                    .join(", ")}
                                </p>
                              )}
                              <details onToggle={(event) => { if (event.currentTarget.open) void ensureReviewData(); }}>
                                <summary>Faculty reviews<CaretDown size={20} /></summary>
                                <FacultyReviews
                                  catalog={catalog}
                                  facultyId={facultyId}
                                  courseId={course.id}
                                />
                              </details>
                            </article>
                          );
                        })}
                      {!visibleOfferings.length && (
                        <p className="muted">
                          No matching sections are recorded in this catalog.
                        </p>
                      )}
                      </div>
                    </section>
                  )}
                </section>
                <div className="schedule-column">
                  <div className="calendar-switcher" role="tablist" aria-label="Calendars">
                    {calendars.map((calendar) => (
                      <div className={`calendar-tab-wrap ${activeCalendar?.id === calendar.id ? "active" : ""} ${renamingCalendarId === calendar.id ? "renaming" : ""}`} role="presentation" key={calendar.id}>
                        {renamingCalendarId === calendar.id ? <>
                          <input autoFocus className="calendar-rename-input" aria-label="New calendar name" maxLength={40}
                            value={calendarNameDraft} onChange={(e) => setCalendarNameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveCalendarName(calendar.id); if (e.key === "Escape") cancelRenameCalendar(); }} />
                          <button className="calendar-rename-action" aria-label="Save calendar name" title="Save name" onClick={() => saveCalendarName(calendar.id)}><Check size={15} /><span>Save</span></button>
                          <button className="calendar-rename-action" aria-label="Cancel rename" title="Cancel" onClick={cancelRenameCalendar}><X size={15} /><span>Cancel</span></button>
                        </> : <>
                          <button role="tab" aria-selected={activeCalendar?.id === calendar.id}
                            className="calendar-tab"
                            onClick={() => {
                              if (ffcsMode && !calendar.ffcsOriginalOfferingIds) {
                                persistCalendars(calendars.map(item => item.id === calendar.id
                                  ? { ...item, ffcsOriginalOfferingIds: [...item.offeringIds] }
                                  : item));
                              }
                              setActiveCalendarId(calendar.id);
                              setPreviewOfferingId("");
                            }}>
                            {calendar.name}
                          </button>
                          <button className="calendar-rename-action icon-only" aria-label={`Rename ${calendar.name}`} title={`Rename ${calendar.name}`} onClick={() => beginRenameCalendar(calendar)}><PencilSimple size={14} /></button>
                          <button className="calendar-delete" aria-label={`Delete ${calendar.name}`} title={`Delete ${calendar.name}`}
                            disabled={calendars.length === 1} onClick={() => deleteCalendar(calendar.id)}>
                            <X size={14} />
                          </button>
                        </>}
                      </div>
                    ))}
                    <button className="calendar-add" aria-label="Add calendar" title="Add calendar" onClick={addCalendar}><Plus size={19} /></button>
                  </div>
                  {ffcsMode && <section className="ffcs-course-list" aria-label="Courses in this timetable">
                    {!activeCalendarOfferings.length && <p>No courses in this timetable yet. Return to the planner to add your courses or generate a starting timetable.</p>}
                    {ffcsGroups.map(({ label, courses }) => {
                      const description = label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^P-?PPC\s*[-–:]\s*/i, "");
                      const visibleCourses = courses.filter(({ course }) => !ffcsLockedCourses.includes(course.id));
                      if (!visibleCourses.length) return null;
                      return <section className="ffcs-category-group" key={label}>
                        <header className="ffcs-category-heading"><strong>{description}</strong><span className="ffcs-heading-rule" /></header>
                        <div className="ffcs-category-rows">{visibleCourses.map(({ offering, course: item }) => {
                          const locked = ffcsLockedCourses.includes(item.id);
                          const facultyName = catalog.faculty.find(f => f.id === offering.facultyId)?.name || "Faculty unavailable";
                          const slotNames = offering.components.flatMap(component => component.slots).filter((slot, index, slots) => slots.indexOf(slot) === index).join(" + ") || "Slot unavailable";
                          const toggleLock = () => {
                            const registeredOfferingIds = locked
                              ? (activeCalendar.registeredOfferingIds || []).filter(id => id !== offering.id)
                              : [...new Set([...(activeCalendar.registeredOfferingIds || []), offering.id])];
                            const complete = activeCalendar.offeringIds.length > 0 && activeCalendar.offeringIds.every(id => registeredOfferingIds.includes(id));
                            persistCalendars(calendars.map(calendar => {
                              const { ffcsOriginalOfferingIds: baseline, ...rest } = calendar;
                              if (calendar.id === activeCalendar.id) return complete
                                ? { ...rest, name: "Final Calendar", registeredOfferingIds }
                                : { ...calendar, registeredOfferingIds };
                              return complete ? rest : calendar;
                            }));
                            if (complete) {
                              setFfcsMode(false);
                              setFfcsReturning(false);
                              setPreviewOfferingId("");
                              setRegistrationComplete(true);
                              setRenamingCalendarId("");
                              setMessage("");
                            }
                          };
                          return <article className={`ffcs-course-row ${locked ? "locked" : ""} ${ffcsDisintegratingCourse === offering.id ? "disintegrating" : ""}`} key={offering.id}>
                            <div className="ffcs-course-identity">
                              <strong className="ffcs-code">{item.code}</strong>
                              <span className="ffcs-title">{displayCourseTitle(item)}{locked ? " · Registered" : ""}</span>
                            </div>
                            <div className="ffcs-course-meta"><span><small>Faculty</small><strong>{facultyName}</strong></span><span><small>Slot</small><strong>{slotNames}</strong></span></div>
                            <button type="button" className={`ffcs-check ${locked ? "active" : ""}`} aria-label={`${locked ? "Mark unregistered" : "Mark registered"} ${item.code}`} aria-pressed={locked} onClick={toggleLock}><Check size={19} /></button>
                            <button type="button" className="ffcs-replace" aria-label={`Reject ${facultyName} and find another teacher for ${item.code}`} title={locked ? "Checked courses stay fixed" : "Reject this teacher"} disabled={busy || locked} onClick={() => {
                              void replaceFfcsCourse(item.id);
                            }}><X size={19} /></button>
                          </article>;
                        })}</div>
                      </section>;
                    })}
                  </section>}
                  {!hasVerifiedMeetingTimes ? <section ref={calendarMeasureRef} className="panel timetable"><div className="panel-heading"><div><span className="eyebrow">CURRENT ALLOCATIONS</span><h2>Timetable preview</h2></div></div>{previewOffering ? <div className="allocation-preview"><strong>{catalog.courses.find((c) => c.id === previewOffering.courseId)?.code} · {catalog.faculty.find((f) => f.id === previewOffering.facultyId)?.name}</strong>{previewOffering.components.map((component, index) => <span key={index}>{displayComponentType(component)} · Slot {component.slots.join(" + ") || "unavailable"} · Venue {component.venue || "unavailable"}</span>)}<p className="calendar-hint">Weekday and clock times are not included in this allocation data, so this selection cannot be placed on the weekly timetable.</p></div> : <p className="calendar-hint">Select anywhere on a faculty allocation to preview its slot here. Weekday and clock times are not included in this data.</p>}</section> : !ffcsMode && <>
                  <div ref={calendarMeasureRef}><Timetable title={activeCalendar.name === "Final Calendar" ? "Final Calendar" : undefined} catalog={catalog} offerings={activeCalendarOfferings} previewOfferingId={previewOfferingId} blockedTimes={blockedTimes} onChangeBlockedTimes={setBlockedTimes} onAddBlock={addTimeBlock} pinnedOfferingIds={pinnedOfferingIds} onTogglePin={togglePin} onSelectClass={openClassSubject} onGenerateAround={() => void generate(true)} onError={setMessage} generating={busy} canGenerate={shortlistedCourseIds.length > 0 || pinnedOfferings.length > 0} /></div>
                  </>}
                </div>
              </div>
              </>}
            </div>
          )}
          {view === "faculty" && (
            <section className="panel content-panel">
              <div className="section-heading">
                <h2>Faculty directory</h2>
              </div>
              <p className="muted">Faculty allocations and available student feedback for {allocationSnapshot.semester}. Clock times use VTOP’s generic template displayed for Fall 2026–27; confirm Winter timing in VTOP.</p>
              <label>
                Find faculty
                <input
                  value={facultyQuery}
                  onChange={(e) => {
                    setFacultyQuery(e.target.value);
                    setFacultyPage(0);
                  }}
                  placeholder="Search faculty by name"
                />
              </label>
              {browsing && <div className="faculty-browse"><p className="eyebrow">BROWSE BY COURSE GROUP</p><div className="faculty-category-tabs">{["All", ...new Set(facultyAllocations.flatMap((f) => f.assignments.map((a) => a.category)))].map((category) => <button className={facultyCategory === category ? "active" : "secondary"} key={category} onClick={() => { setFacultyCategory(category); setFacultyPage(0); }}>{category}</button>)}</div></div>}
              <div className="form-grid faculty-controls"><label>Show faculty<select value={facultyCoverage} onChange={e=>{setFacultyCoverage(e.target.value);setFacultyPage(0);}}><option value="all">All names</option><option value="rated">With numeric ratings</option><option value="reviewed">With any feedback</option></select></label><label>Sort faculty<select value={facultySort} onChange={e=>{setFacultySort(e.target.value);setFacultyPage(0);}}><option value="name">Name A–Z</option><option value="rating">Reported rating: high to low</option><option value="samples">Reported review count</option></select></label></div><p className="muted small">{faculties.length} matching faculty names.</p>
              {faculties
                .slice(facultyPage * 10, facultyPage * 10 + 10)
                .map((f) => (
                  <div className="faculty-entry" key={f.id}>
                  <FacultyReviews
                    key={f.id}
                    catalog={f.reviewCatalog}
                    facultyId={f.id}
                  />
                  <ul className="faculty-allocations">{f.assignments.map((a, i) => <li key={`${a.account}-${a.category}-${a.code}-${a.slot}-${a.venue}-${i}`}><strong>{a.code}</strong> {a.title}<span>{a.account} · {a.categoryName} · {a.slot} · {a.venue} · {a.type}</span></li>)}</ul>
                  </div>
                ))}
              {!faculties.length && (
                <p className="empty">
                  No matching faculty records in this catalog.
                </p>
              )}
              <Pagination
                page={facultyPage}
                count={faculties.length}
                size={10}
                change={setFacultyPage}
              />
            </section>
          )}
          {view === "plans" && (
            <section className="panel content-panel">
              <h2>Keep or export the active calendar</h2>
              <p>{activeCalendar.name} · {activeCalendar.offeringIds.length} classes. Exports and saved plans contain this calendar.</p>
              <div className="form-grid">
                <label>Plan name<input value={name} onChange={event => setName(event.target.value)} placeholder="My semester plan" /></label>
                <label>Calendar export week (Monday)<input type="date" value={exportWeek} onChange={event => setExportWeek(event.target.value)} /></label>
              </div>
              <div className="release-nav">
                <button onClick={save}>Save plan</button>
                <button className="secondary" onClick={() => exportAction(() => downloadCsv(catalog, activeCalendar.offeringIds))}>Export CSV</button>
                <button className="secondary" onClick={() => exportAction(() => downloadIcs(catalog, activeCalendar.offeringIds, exportWeek))}>Export calendar week</button>
                <button className="secondary" onClick={() => { setView("planner"); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); }}>Print / PDF</button>
              </div>
              <div className="section-heading">
                <h2>Saved on this device</h2>
                <button
                  className="secondary"
                  disabled={!plans.length}
                  onClick={() =>
                    exportAction(() =>
                      downloadJson("ffcs-plans-backup.json", { plans }),
                    )
                  }
                >
                  Export JSON backup
                </button>
              </div>
              <label className="restore-label">
                Restore a JSON plan backup
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => void restore(e.target.files?.[0])}
                />
              </label>
              <p className="muted small">
                Backups must match the active catalog. Select at least two plans
                below to compare.
              </p>
              {!plans.length && (
                <div className="empty">
                  <Stack size={30} />
                  <h3>No plans saved yet</h3>
                  <p>
                    Select sections in the planner, name your plan, and save it
                    here.
                  </p>
                  <button onClick={() => setView("planner")}>
                    Build a plan
                  </button>
                </div>
              )}
              {plans.map((p) => (
                <article className="plan-row" key={p.id}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={compare.includes(p.id)}
                      onChange={() =>
                        setCompare((c) =>
                          c.includes(p.id)
                            ? c.filter((id) => id !== p.id)
                            : [...c, p.id],
                        )
                      }
                    />
                    Compare
                  </label>
                  <div>
                    <h3>{p.name}</h3>
                    <small>
                      {p.semester} · {p.offeringIds.length} courses ·{" "}
                      {new Date(p.savedAt).toLocaleString()}
                    </small>
                    {p.catalogFingerprint !== catalogFingerprint(catalog) && (
                      <p className="warning small">
                        Different catalog. Import the original to inspect
                        section details.
                      </p>
                    )}
                  </div>
                  <button className="secondary" onClick={() => load(p)}>
                    Load / edit
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      persist(plans.filter((x) => x.id !== p.id));
                      setCompare((c) => c.filter((id) => id !== p.id));
                      if (editing === p.id) setEditing(undefined);
                    }}
                  >
                    Delete
                  </button>
                </article>
              ))}
              {compare.length >= 2 && (
                <div className="comparison">
                  <h3>Plan comparison</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Course</th>
                          {plans
                            .filter((p) => compare.includes(p.id))
                            .map((p) => (
                              <th key={p.id}>{p.name}</th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...new Set(
                            plans
                              .filter(
                                (p) =>
                                  compare.includes(p.id) &&
                                  p.catalogFingerprint ===
                                    catalogFingerprint(catalog),
                              )
                              .flatMap((p) =>
                                catalog.offerings
                                  .filter((o) => p.offeringIds.includes(o.id))
                                  .map((o) => o.courseId),
                              ),
                          ),
                        ].map((id) => (
                          <tr key={id}>
                            <th>
                              {catalog.courses.find((c) => c.id === id)?.code}
                              <small>
                                {
                                  catalog.courses.find((c) => c.id === id)
                                    ?.title
                                }
                              </small>
                            </th>
                            {plans
                              .filter((p) => compare.includes(p.id))
                              .map((p) => {
                                const o =
                                  p.catalogFingerprint ===
                                  catalogFingerprint(catalog)
                                    ? catalog.offerings.find(
                                        (o) =>
                                          p.offeringIds.includes(o.id) &&
                                          o.courseId === id,
                                      )
                                    : undefined;
                                return (
                                  <td key={p.id}>
                                    {o ? (
                                      <>
                                        <strong>
                                          <small className="identifier-label">
                                            Source / planning ID
                                          </small>
                                          {o.section}
                                        </strong>
                                        <span>
                                          {
                                            catalog.faculty.find(
                                              (f) => f.id === o.facultyId,
                                            )?.name
                                          }
                                        </span>
                                        <small>
                                          {o.components
                                            .flatMap((c) => c.slots)
                                            .join(" + ")}
                                        </small>
                                      </>
                                    ) : p.catalogFingerprint ===
                                      catalogFingerprint(catalog) ? (
                                      "Not included"
                                    ) : (
                                      "Catalog mismatch"
                                    )}
                                  </td>
                                );
                              })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
          {view === "plans" && (
            <section aria-label="Catalog tools">
              <h2 className="subsection-title">Course catalog</h2>
              <DataImport catalog={catalog} apply={applyCatalog} />
            </section>
          )}
          {(message || generationFeedback) && <aside className="toast-stack" aria-label="Notifications">
            {message && <div className="app-toast" role="status"><span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setMessage("")}><X size={17} /></button></div>}
            {generationFeedback && <div className="app-toast" role="status"><span>{generationFeedback}</span><button type="button" aria-label="Dismiss generation notification" onClick={() => setGenerationFeedback("")}><X size={17} /></button></div>}
          </aside>}
          <footer className="main-footer">
            <span>FFCS Helper · Vellore</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Pagination({
  page,
  count,
  size,
  change,
}: {
  page: number;
  count: number;
  size: number;
  change: (page: number) => void;
}) {
  const total = Math.max(1, Math.ceil(count / size));
  return (
    <div className="pagination">
      <small>
        {count
          ? `${page * size + 1}–${Math.min((page + 1) * size, count)} of ${count}`
          : "0 results"}
      </small>
      <div className="row">
        <button
          className="secondary compact"
          disabled={page === 0}
          onClick={() => change(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </button>
        <button
          className="secondary compact"
          disabled={page >= total - 1}
          onClick={() => change(page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function RecordSource({provenance}:{provenance:Catalog['provenance']}) {
 return <details className="record-provenance"><summary>Section source and dates</summary><p className="small">{provenance.source}</p><p className="small">Status: {provenance.status === 'verified' ? 'source claims verified' : provenance.status}<br/>Source snapshot: {provenance.updatedAt || 'Not supplied'}<br/>Imported: {provenance.importedAt}</p>{provenance.url && <a href={provenance.url} target="_blank" rel="noreferrer">Open section source</a>}</details>;
}

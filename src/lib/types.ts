export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface Meeting { day: Day; start: number; end: number; slot: string; }
export interface Provenance { source: string; url?: string; importedAt: string; updatedAt?: string; status: 'historical' | 'imported' | 'verified'; license?: string; }
export interface Course { id: string; code: string; title: string; credits: number | null; category?: string; categoryName?: string; account?: string; aliases?: string[]; provenance?: Provenance; }
export interface Faculty { id: string; name: string; reviewOnly?: boolean; department?: string; provenance?: Provenance; }
export interface Component { type: 'theory' | 'lab' | 'tutorial' | 'project'; sourceType?: string; slots: string[]; meetings: Meeting[]; facultyId?: string; venue?: string; }
export interface Offering { id: string; courseId: string; facultyId: string; section: string; components: Component[]; pairingStatus?: 'unresolved'; scheduleStatus?: 'browse-only'; scheduleNote?: string; scheduleBlockers?: ('missing-times' | 'overlapping-times' | 'unmapped-source-type')[]; provenance?: Provenance; }
export interface ReviewEvidence { sourceId: string; sourceName: string; page?: number; sourceRow?: string; sha256?: string; extraction?: 'text' | 'ocr'; }
export interface Review { id: string; facultyId: string; courseId?: string; rating: number | null; teaching?: number; workload?: number; grading?: number; attendance?: number; text?: string; date: string | null; source: string; sourceUrl?: string; sampleSize: number | null; kind?: 'aggregate' | 'individual' | 'qualitative'; context?: string; sourceFacultyName?: string; evidence?: ReviewEvidence[]; importedAt?: string; verification?: 'user-supplied'; notes?: string[]; }

export interface Catalog { version: 1; campus: 'Vellore'; semester: string; provenance: Provenance; warnings?: string[]; courses: Course[]; faculty: Faculty[]; offerings: Offering[]; reviews: Review[]; }
export interface BlockedWindow { calendarId?: string; id: string; days: Day[]; start: number; end: number; }
export interface Preferences { colorByBuilding?: boolean; theoryBatch: 'any' | 'morning' | 'evening'; timeOfDay: 'any' | 'morning' | 'afternoon'; freeDays: number[]; compactness: number; minClassGap?: number; facultyOrder: string[]; maxResults: number; ratingThreshold?: number; facultyMode?: 'preferred'|'rated'; preferredFaculty?: string[]; blockedFaculty?: string[]; preferredBuildings?: string[]; }
export interface Schedule { offeringIds: string[]; score: number; reasons: string[]; }
export interface Plan { id: string; name: string; offeringIds: string[]; savedAt: string; semester: string; catalogFingerprint: string; }
export interface ImportResult { catalog?: Catalog; errors: string[]; warnings: string[]; }

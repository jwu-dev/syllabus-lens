import {
  DEFAULT_AI_SETTINGS,
  type AiSettings,
  type CourseOutline,
} from "./types";

const COURSES_STORAGE_KEY = "syllabus-lens:courses:v1";
const SETTINGS_STORAGE_KEY = "syllabus-lens:ai-settings:v1";
const PDF_DB_NAME = "syllabus-lens-pdfs";
const PDF_STORE_NAME = "pdfs";

export function loadCourses(): CourseOutline[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COURSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CourseOutline[]) : [];
  } catch {
    return [];
  }
}

export function saveCourses(courses: CourseOutline[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses));
  } catch (err) {
    console.error("Failed to save courses to localStorage:", err);
  }
}

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    return { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save AI settings:", err);
  }
}

function openPdfDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(PDF_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
        db.createObjectStore(PDF_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdfBlob(courseId: string, blob: Blob): Promise<void> {
  const db = await openPdfDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE_NAME, "readwrite");
    tx.objectStore(PDF_STORE_NAME).put(blob, courseId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPdfBlob(courseId: string): Promise<Blob | null> {
  try {
    const db = await openPdfDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_STORE_NAME, "readonly");
      const req = tx.objectStore(PDF_STORE_NAME).get(courseId);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deletePdfBlob(courseId: string): Promise<void> {
  try {
    const db = await openPdfDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PDF_STORE_NAME, "readwrite");
      tx.objectStore(PDF_STORE_NAME).delete(courseId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage cleanup errors
  }
}

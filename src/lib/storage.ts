/**
 * localStorage helper for RollCall check-in data.
 * Stores an array of check-in records keyed by today's date.
 */

export interface CheckInRecord {
  studentId: string;
  time: string; // ISO timestamp
  order: number; // serial number (1, 2, 3...)
}

const STORAGE_KEY = "rollcall_checkins";

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fullKey(): string {
  return `${STORAGE_KEY}_${getTodayKey()}`;
}

export function getCheckIns(): CheckInRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(fullKey());
    return raw ? (JSON.parse(raw) as CheckInRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveCheckIns(records: CheckInRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(fullKey(), JSON.stringify(records));
}

export function addCheckIn(studentId: string): CheckInRecord[] {
  const records = getCheckIns();
  const nextOrder = records.length + 1;
  const newRecord: CheckInRecord = {
    studentId,
    time: new Date().toISOString(),
    order: nextOrder,
  };
  const updated = [...records, newRecord];
  saveCheckIns(updated);
  return updated;
}

export function undoLastCheckIn(): CheckInRecord[] {
  const records = getCheckIns();
  if (records.length === 0) return records;
  const updated = records.slice(0, -1);
  saveCheckIns(updated);
  return updated;
}

export function resetToday(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(fullKey());
}

// Session-based admin auth
const AUTH_KEY = "rollcall_auth";

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

export function setAdminAuthenticated(value: boolean): void {
  if (typeof window === "undefined") return;
  if (value) {
    sessionStorage.setItem(AUTH_KEY, "true");
  } else {
    sessionStorage.removeItem(AUTH_KEY);
  }
}

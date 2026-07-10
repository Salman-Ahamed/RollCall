"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { STUDENTS, type Student } from "@/lib/students";
import { ADMIN_PIN } from "@/lib/config";
import {
  getCheckIns,
  addCheckIn,
  undoLastCheckIn,
  resetToday,
  isAdminAuthenticated,
  setAdminAuthenticated,
  type CheckInRecord,
} from "@/lib/storage";

// ─── PIN Login Screen ────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setAdminAuthenticated(true);
      onSuccess();
    } else {
      setError(true);
      setPin("");
      setTimeout(() => setError(false), 1500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-8 w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-500 mb-4 shadow-lg shadow-emerald-500/25">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">RollCall</h1>
          <p className="text-slate-400 text-sm mt-1">Enter admin PIN to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={`relative mb-6 ${error ? "animate-shake" : ""}`}>
            <input
              id="pin-input"
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              className={`w-full px-4 py-4 text-center text-2xl tracking-[0.3em] font-mono rounded-xl bg-slate-800 border-2 transition-colors duration-200 focus:outline-none focus:ring-0 ${
                error
                  ? "border-red-500 text-red-400"
                  : "border-slate-600 focus:border-blue-500 text-white"
              } placeholder:text-slate-500 placeholder:text-base placeholder:tracking-normal placeholder:font-sans`}
            />
            {error && (
              <p className="absolute -bottom-6 left-0 text-red-400 text-sm font-medium animate-fade-in">
                Wrong PIN. Try again.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pin.length === 0}
            className="btn btn-green w-full py-4 text-lg mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

function Dashboard() {
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPin, setResetPin] = useState("");
  const [resetError, setResetError] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load check-ins on mount
  useEffect(() => {
    setCheckIns(getCheckIns());
    setMounted(true);
  }, []);

  // Derived data
  const checkedInIds = useMemo(
    () => new Set(checkIns.map((c) => c.studentId)),
    [checkIns]
  );

  const waitingStudents = useMemo(
    () => STUDENTS.filter((s) => !checkedInIds.has(s.id)),
    [checkedInIds]
  );

  const filteredWaiting = useMemo(() => {
    if (!search.trim()) return waitingStudents;
    const q = search.toLowerCase().trim();
    return waitingStudents.filter((s) => s.name.toLowerCase().includes(q));
  }, [waitingStudents, search]);

  const arrivedStudents = useMemo(() => {
    return checkIns.map((record) => {
      const student = STUDENTS.find((s) => s.id === record.studentId);
      return { ...record, student };
    });
  }, [checkIns]);

  // Actions
  const handleCheckIn = useCallback((studentId: string) => {
    const updated = addCheckIn(studentId);
    setCheckIns(updated);
  }, []);

  const handleUndo = useCallback(() => {
    const updated = undoLastCheckIn();
    setCheckIns(updated);
  }, []);

  const handleReset = useCallback(() => {
    if (resetPin !== ADMIN_PIN) {
      setResetError(true);
      setResetPin("");
      setTimeout(() => setResetError(false), 1500);
      return;
    }
    resetToday();
    setCheckIns([]);
    setShowResetDialog(false);
    setResetPin("");
  }, [resetPin]);

  const handleExportCSV = useCallback(() => {
    if (arrivedStudents.length === 0) return;

    const header = "Order,Name,Phone,Time";
    const rows = arrivedStudents.map((a) => {
      const timeStr = new Date(a.time).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      return `${a.order},"${a.student?.name ?? "Unknown"}","${a.student?.phone ?? ""}","${timeStr}"`;
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const today = new Date().toISOString().split("T")[0];
    link.download = `rollcall_${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [arrivedStudents]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Floating Header */}
      <header className="sticky top-4 z-40 px-4">
        <div className="max-w-2xl mx-auto glass-panel px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg shadow-black/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight tracking-tight">RollCall</h1>
              <p className="text-xs text-slate-400 font-medium">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Stats pill + Practice link */}
          <div className="flex items-center gap-2.5 text-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow" />
              <span className="text-white font-bold">{checkIns.length}</span>
              <span className="text-slate-500 font-medium">/ {STUDENTS.length}</span>
            </div>

            <Link
              href="/practice"
              className="btn px-3 py-2 text-xs font-bold rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 hover:text-white transition-all shadow-lg shadow-purple-500/10 gap-1.5 border border-purple-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Practice
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-28">
        {/* Search */}
        <div className="relative mb-6 animate-fade-in group mt-2">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl group-focus-within:bg-blue-500/20 transition-all duration-300" />
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-400 transition-colors z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="search-input"
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-2xl glass-card text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-base relative z-0"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors z-10 bg-slate-800 p-1 rounded-full"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Unified List */}
        <div className="space-y-2 animate-fade-in">
          {/* Arrived Students (Top) */}
          {arrivedStudents.map((a, i) => (
            <div
              key={a.studentId}
              className="glass-card px-4 py-3 flex items-center gap-3 animate-slide-in"
              style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
            >
              {/* Order badge */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold shadow-inner">
                {a.order}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-base truncate">
                  {a.student?.name ?? "Unknown"}
                </p>
                <p className="text-slate-400 text-xs font-medium mt-0.5">
                  {a.student?.phone}
                </p>
              </div>

              {/* Time */}
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Arrived</span>
                <span className="text-xs text-emerald-400/90 font-mono font-medium flex-shrink-0 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/10">
                  {new Date(a.time).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>
            </div>
          ))}

          {/* Divider if both exist */}
          {arrivedStudents.length > 0 && filteredWaiting.length > 0 && (
            <div className="h-px bg-slate-700/50 my-4" />
          )}

          {/* Waiting Students (Bottom) */}
          {filteredWaiting.map((student) => (
            <WaitingCard
              key={student.id}
              student={student}
              onCheckIn={handleCheckIn}
            />
          ))}

          {/* Empty State */}
          {arrivedStudents.length === 0 && filteredWaiting.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm glass-card">
              {waitingStudents.length === 0
                ? "🎉 Everyone's here!"
                : "No matching students found."}
            </div>
          )}
        </div>
      </main>

      {/* ── Bottom Floating Dock ── */}
      <div className="fixed bottom-6 inset-x-0 z-30 px-4">
        <div className="max-w-md mx-auto glass-panel rounded-2xl px-3 py-3 flex items-center justify-between gap-3 shadow-2xl shadow-black/40 border border-white/10">
          {/* Undo */}
          <button
            id="undo-btn"
            onClick={handleUndo}
            disabled={checkIns.length === 0}
            className="btn btn-ghost flex-1 py-3 text-sm gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
            title="Undo last check-in"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
            </svg>
            Undo
          </button>

          {/* Export CSV */}
          <button
            id="export-btn"
            onClick={handleExportCSV}
            disabled={checkIns.length === 0}
            className="btn btn-blue flex-1 py-3 text-sm gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>

          {/* Reset */}
          <button
            id="reset-btn"
            onClick={() => setShowResetDialog(true)}
            className="btn btn-red flex-1 py-3 text-sm gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>
      </div>

      {/* ── Reset Confirmation Dialog ── */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card p-6 w-full max-w-sm animate-fade-in">
            <h3 className="text-lg font-bold text-white mb-1">Reset Today&apos;s Data?</h3>
            <p className="text-slate-400 text-sm mb-5">
              This will clear all check-ins for today. Enter the admin PIN to confirm.
            </p>

            <div className={`mb-4 ${resetError ? "animate-shake" : ""}`}>
              <input
                id="reset-pin-input"
                type="password"
                autoFocus
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
                placeholder="Enter PIN"
                className={`w-full px-4 py-3 text-center text-lg tracking-[0.2em] font-mono rounded-xl bg-slate-800 border-2 transition-colors ${
                  resetError
                    ? "border-red-500 text-red-400"
                    : "border-slate-600 focus:border-blue-500 text-white"
                } placeholder:text-slate-500 placeholder:text-sm placeholder:tracking-normal placeholder:font-sans focus:outline-none`}
              />
              {resetError && (
                <p className="text-red-400 text-xs mt-1.5 font-medium">Wrong PIN.</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowResetDialog(false);
                  setResetPin("");
                  setResetError(false);
                }}
                className="btn btn-ghost flex-1 py-3"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetPin.length === 0}
                className="btn btn-red flex-1 py-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Waiting Card Component ──────────────────────────────────────────────────

function WaitingCard({
  student,
  onCheckIn,
}: {
  student: Student;
  onCheckIn: (id: string) => void;
}) {
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  const handleClick = () => {
    setJustCheckedIn(true);
    // Short delay so the user sees the visual feedback before the card disappears
    setTimeout(() => onCheckIn(student.id), 150);
  };

  return (
    <div
      className={`glass-card px-4 py-3 flex items-center gap-3 transition-all duration-300 ${
        justCheckedIn ? "opacity-0 scale-95 translate-y-2" : "hover:scale-[1.01]"
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 shadow-inner">
        {student.name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-base truncate">{student.name}</p>
        <p className="text-slate-400 text-xs font-medium mt-0.5">{student.phone}</p>
      </div>

      {/* Check-in button */}
      <button
        id={`checkin-${student.id}`}
        onClick={handleClick}
        disabled={justCheckedIn}
        className="btn btn-green px-6 py-2.5 text-sm font-bold tracking-wider disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]"
      >
        IN
      </button>
    </div>
  );
}

// ─── Root Page ───────────────────────────────────────────────────────────────

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isAdminAuthenticated());
  }, []);

  // SSR / hydration loading
  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />;
  }

  return <Dashboard />;
}

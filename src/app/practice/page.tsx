"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { STUDENTS } from "@/lib/students";
import {
  getCheckIns,
  isAdminAuthenticated,
  getPracticeSchedule,
  savePracticeSchedule,
  clearPracticeSchedule,
  type PracticeSchedule,
  type PracticeSlot,
} from "@/lib/storage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Build a schedule from arrived students, starting "now". */
function buildSchedule(totalMinutes: number): PracticeSchedule | null {
  const checkIns = getCheckIns();
  if (checkIns.length === 0) return null;

  const perStudent = totalMinutes / checkIns.length;
  const now = new Date();
  const slots: PracticeSlot[] = checkIns.map((ci, i) => {
    const student = STUDENTS.find((s) => s.id === ci.studentId);
    const start = new Date(now.getTime() + i * perStudent * 60_000);
    const end = new Date(start.getTime() + perStudent * 60_000);
    return {
      studentId: ci.studentId,
      order: ci.order,
      name: student?.name ?? "Unknown",
      durationMin: perStudent,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      done: false,
    };
  });

  return {
    totalMinutes,
    generatedAt: now.toISOString(),
    slots,
    activeIndex: -1,
    timerEndTime: null,
  };
}

// ─── Audio beep (Web Audio API – no external files) ──────────────────────────

function playBeep() {
  try {
    const ctx = new AudioContext();
    // Play three quick ascending beeps
    [0, 200, 400].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660 + i * 220;
      osc.type = "sine";
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime + delay / 1000);
      osc.stop(ctx.currentTime + delay / 1000 + 0.15);
    });
  } catch {
    // Silently fail if AudioContext not available
  }
}

// ─── Practice Page ───────────────────────────────────────────────────────────

export default function PracticePage() {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [schedule, setSchedule] = useState<PracticeSchedule | null>(null);
  const [timeInput, setTimeInput] = useState("");
  const [countdown, setCountdown] = useState<number>(-1); // seconds remaining
  const [timerDone, setTimerDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beeped = useRef(false);

  // ── Mount: check auth + load saved schedule ──
  useEffect(() => {
    setAuthed(isAdminAuthenticated());
    const saved = getPracticeSchedule();
    if (saved) {
      setSchedule(saved);
      setTimeInput(String(saved.totalMinutes));
      // Restore running timer if there was one
      if (saved.timerEndTime) {
        const remaining = Math.ceil(
          (new Date(saved.timerEndTime).getTime() - Date.now()) / 1000
        );
        if (remaining > 0) {
          setCountdown(remaining);
        } else {
          // Timer expired while page was closed
          setTimerDone(true);
          setCountdown(0);
        }
      }
    }
    setMounted(true);
  }, []);

  // ── Countdown tick ──
  useEffect(() => {
    if (countdown > 0) {
      beeped.current = false;
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            if (!beeped.current) {
              beeped.current = true;
              playBeep();
            }
            setTimerDone(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [countdown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist schedule whenever it changes ──
  useEffect(() => {
    if (schedule) savePracticeSchedule(schedule);
  }, [schedule]);

  // ── Actions ──

  const handleGenerate = useCallback(() => {
    const mins = parseFloat(timeInput);
    if (isNaN(mins) || mins <= 0) return;
    const s = buildSchedule(mins);
    if (!s) return;
    setSchedule(s);
    setCountdown(-1);
    setTimerDone(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [timeInput]);

  const handleStart = useCallback(
    (index: number) => {
      if (!schedule) return;
      const slot = schedule.slots[index];
      const endTime = new Date(
        Date.now() + slot.durationMin * 60_000
      ).toISOString();
      const updated: PracticeSchedule = {
        ...schedule,
        activeIndex: index,
        timerEndTime: endTime,
      };
      setSchedule(updated);
      setCountdown(Math.ceil(slot.durationMin * 60));
      setTimerDone(false);
      beeped.current = false;
    },
    [schedule]
  );

  const handleMarkDone = useCallback(
    (index: number, isEarly: boolean = false) => {
      if (!schedule) return;
      // Stop timer if marking the active one done
      if (timerRef.current && index === schedule.activeIndex) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const now = new Date();
      const newSlots = schedule.slots.map((s, i) =>
        i === index ? { ...s, done: true, actualEndTime: now.toISOString() } : s
      );

      // Recalculate remaining slots' times starting from now ONLY if marking done early from the active slot
      if (index === schedule.activeIndex && isEarly) {
        const remaining = newSlots.filter((s, i) => i > index && !s.done);
        if (remaining.length > 0) {
          let cursor = now;
          for (const slot of remaining) {
            const slotIdx = newSlots.findIndex(
              (s) => s.studentId === slot.studentId && s.order === slot.order
            );
            if (slotIdx !== -1) {
              const start = new Date(cursor);
              const end = new Date(start.getTime() + slot.durationMin * 60_000);
              newSlots[slotIdx] = {
                ...newSlots[slotIdx],
                startTime: start.toISOString(),
                endTime: end.toISOString(),
              };
              cursor = end;
            }
          }
        }
      }

      // Find next undone slot if we just marked the active one done
      let nextActive = schedule.activeIndex;
      if (newSlots[nextActive]?.done) {
        const nextUndone = newSlots.findIndex((s, i) => i > nextActive && !s.done);
        nextActive = nextUndone >= 0 ? nextUndone : newSlots.length;
      }

      setSchedule({
        ...schedule,
        slots: newSlots,
        activeIndex: nextActive,
        timerEndTime: index === schedule.activeIndex ? null : schedule.timerEndTime,
      });
      if (index === schedule.activeIndex) {
        setCountdown(-1);
        setTimerDone(false);
      }
    },
    [schedule]
  );

  const handleUndoRow = useCallback((index: number) => {
    if (!schedule) return;
    const newSlots = [...schedule.slots];
    newSlots[index] = { ...newSlots[index], done: false };
    delete newSlots[index].actualEndTime;
    
    // Auto-revert activeIndex to this index if it's earlier than the current activeIndex
    let nextActive = schedule.activeIndex;
    if (index < nextActive || nextActive >= schedule.slots.length) {
      const nextUndone = newSlots.findIndex(s => !s.done);
      nextActive = nextUndone >= 0 ? nextUndone : schedule.slots.length;
    }

    setSchedule({ ...schedule, slots: newSlots, activeIndex: nextActive });
  }, [schedule]);

  const handleRecalculate = useCallback(() => {
    const mins = parseFloat(timeInput);
    if (isNaN(mins) || mins <= 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const s = buildSchedule(mins);
    if (!s) return;
    setSchedule(s);
    setCountdown(-1);
    setTimerDone(false);
  }, [timeInput]);

  const handleClearSchedule = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    clearPracticeSchedule();
    setSchedule(null);
    setCountdown(-1);
    setTimerDone(false);
  }, []);

  // ── Derived data ──
  const arrivedCount = (() => {
    try {
      return getCheckIns().length;
    } catch {
      return 0;
    }
  })();

  const allDone =
    schedule !== null &&
    schedule.slots.every(s => s.done);

  const doneCount = schedule ? schedule.slots.filter(s => s.done).length : 0;

  const activeSlot =
    schedule && schedule.activeIndex >= 0 && schedule.activeIndex < schedule.slots.length
      ? schedule.slots[schedule.activeIndex]
      : null;

  const isTimerRunning = countdown > 0;

  // ── Loading / auth gates ──

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-sm animate-fade-in">
          <p className="text-slate-400 mb-4">
            Please log in from the main page first.
          </p>
          <Link
            href="/"
            className="btn btn-blue px-6 py-3 text-sm"
          >
            Go to RollCall
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Floating Header */}
      <header className="sticky top-4 z-40 px-4">
        <div className="max-w-2xl mx-auto glass-panel px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg shadow-black/20">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 flex items-center justify-center transition-colors border border-slate-700/50 shadow-inner"
              title="Back to RollCall"
            >
              <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight tracking-tight flex items-center gap-2">
                <span className="text-purple-400">Practice</span>
                Schedule
              </h1>
              <p className="text-xs text-slate-400 font-medium">
                {schedule ? `${doneCount} of ${arrivedCount} completed` : `${arrivedCount} students present`}
              </p>
            </div>
          </div>

          {schedule && (
            <button
              onClick={handleClearSchedule}
              className="btn bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-3 py-2 text-xs font-bold rounded-xl transition-all shadow-sm gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-8">
        {/* ── Time Input + Generate ── */}
        <section className="glass-card p-5 animate-fade-in">
          <label
            htmlFor="total-time-input"
            className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 block"
          >
            Total Practice Time
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 group">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl blur-xl group-focus-within:bg-purple-500/20 transition-all duration-300" />
              <input
                id="total-time-input"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="e.g. 60"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                className="w-full px-4 py-4 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xl font-semibold placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all pr-16 relative z-10"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold tracking-wide z-10">
                MIN
              </span>
            </div>
            <button
              id="generate-btn"
              onClick={schedule ? handleRecalculate : handleGenerate}
              disabled={!timeInput || parseFloat(timeInput) <= 0 || arrivedCount === 0}
              className="btn bg-gradient-to-br from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] px-8 py-4 sm:py-0 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 whitespace-nowrap z-10"
            >
              {schedule ? "Recalculate" : "Generate"}
            </button>
          </div>
          {arrivedCount === 0 && (
            <p className="text-amber-400/80 text-xs mt-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              No students checked in yet. Go back and check students in first.
            </p>
          )}
          {schedule && (
            <p className="text-slate-500 text-xs mt-2">
              {schedule.slots.length} students × {schedule.slots[0]?.durationMin.toFixed(1)} min each
              &nbsp;·&nbsp; Generated {formatTime(schedule.generatedAt)}
            </p>
          )}
        </section>

        {/* ── Active Turn Hero Card ── */}
        {activeSlot && (
          <section
            className={`rounded-[2rem] p-8 sm:p-10 animate-scale-in transition-all duration-500 relative overflow-hidden ${
              timerDone
                ? "bg-gradient-to-br from-amber-500/20 to-red-600/20 border border-amber-500/50 shadow-[0_0_50px_rgba(245,158,11,0.15)]"
                : isTimerRunning
                ? "bg-gradient-to-br from-purple-500/20 to-blue-600/20 border border-purple-500/40 shadow-[0_0_50px_rgba(168,85,247,0.2)]"
                : "glass-card border border-white/5 shadow-2xl shadow-black/50"
            }`}
          >
            {/* Ambient inner glow for active state */}
            {(isTimerRunning || timerDone) && (
              <div className="absolute inset-0 bg-white/5 backdrop-blur-3xl mix-blend-overlay pointer-events-none" />
            )}
            
            <div className="text-center relative z-10">
              <p className="text-xs font-bold text-slate-400/80 uppercase tracking-[0.2em] mb-3">
                {timerDone ? "⏰ Time's Up!" : isTimerRunning ? "Now Practicing" : "Up Next"}
              </p>
              <p className="text-4xl sm:text-5xl font-extrabold text-white mb-2 tracking-tight drop-shadow-md">
                {activeSlot.name}
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/20 text-slate-300 text-sm font-medium mb-6 border border-white/5">
                <span className="text-emerald-400">#{activeSlot.order}</span>
                <span>•</span>
                <span>{activeSlot.durationMin.toFixed(1)} min</span>
              </div>

              {/* Countdown display */}
              <div className={`text-6xl sm:text-7xl font-mono font-black mb-5 transition-colors ${
                timerDone
                  ? "text-amber-400 animate-pulse"
                  : countdown > 0
                  ? countdown <= 30
                    ? "text-red-400"
                    : "text-purple-400"
                  : "text-slate-500"
              }`}>
                {countdown >= 0 ? formatCountdown(countdown) : formatCountdown(Math.ceil(activeSlot.durationMin * 60))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 justify-center">
                {!isTimerRunning && !timerDone && (
                  <button
                    id="start-timer-btn"
                    onClick={() => handleStart(schedule!.activeIndex)}
                    className="btn bg-purple-500 hover:bg-purple-600 text-white focus:ring-purple-500 shadow-lg shadow-purple-500/20 px-8 py-4 text-lg font-bold gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Start
                  </button>
                )}
                {(isTimerRunning || timerDone) && (
                  <button
                    id="done-early-hero-btn"
                    onClick={() => handleMarkDone(schedule!.activeIndex, true)}
                    className={`btn px-8 py-4 text-lg font-bold gap-2 ${
                      timerDone
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-500 shadow-lg shadow-emerald-500/20"
                        : "bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500 shadow-lg shadow-amber-500/20"
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {timerDone ? "Next →" : "Done Early"}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* All done message */}
        {allDone && schedule && (
          <section className="glass-card p-8 text-center animate-fade-in">
            <div className="text-5xl mb-3">🎉</div>
            <h3 className="text-xl font-bold text-white mb-1">All Done!</h3>
            <p className="text-slate-400 text-sm">
              Every student has had their practice turn.
            </p>
          </section>
        )}

        {/* ── Schedule List ── */}
        {schedule && schedule.slots.length > 0 && (
          <section className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Schedule
            </h2>

            <div className="space-y-2">
              {schedule.slots.map((slot, i) => {
                const isActive = i === schedule.activeIndex;
                const isDone = slot.done;
                const isNext =
                  !isDone &&
                  !isActive &&
                  i ===
                    schedule.slots.findIndex(
                      (s, idx) => idx > schedule.activeIndex && !s.done
                    );

                return (
                  <div
                    key={`${slot.studentId}-${slot.order}`}
                    className={`glass-card px-4 py-3 flex items-center gap-3 transition-all duration-300 ${
                      isActive
                        ? "ring-2 ring-purple-500/60 bg-purple-500/10"
                        : isDone
                        ? "opacity-50"
                        : isNext && timerDone
                        ? "ring-2 ring-amber-500/50 bg-amber-500/5"
                        : ""
                    }`}
                  >
                    {/* Order badge */}
                    <div
                      className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        isDone
                          ? "bg-emerald-500/15 text-emerald-400"
                          : isActive
                          ? "bg-purple-500/20 text-purple-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {isDone ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        slot.order
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${
                        isActive ? "text-white" : isDone ? "text-slate-400 line-through" : "text-slate-200"
                      }`}>
                        {slot.name}
                      </p>
                      <p className="text-slate-500 text-xs font-mono">
                        {isDone && slot.actualEndTime ? (
                          <span className="text-emerald-400/80">
                            Done at {formatTime(slot.actualEndTime)}
                          </span>
                        ) : (
                          `${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`
                        )}
                      </p>
                    </div>

                    {/* Duration badge */}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                      isActive
                        ? "bg-purple-500/20 text-purple-300"
                        : "bg-slate-700/60 text-slate-400"
                    }`}>
                      {slot.durationMin.toFixed(1)}m
                    </span>

                    {/* Action buttons */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      {isActive && !isDone && !isTimerRunning && !timerDone && schedule.activeIndex >= 0 && (
                        <button
                          onClick={() => handleStart(i)}
                          className="btn bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 px-3 py-1.5 text-xs font-semibold rounded-lg"
                        >
                          Start
                        </button>
                      )}
                      
                      {!isDone && (
                        <button
                          onClick={() => handleMarkDone(i, false)}
                          className={`btn px-3 py-1.5 text-xs font-semibold rounded-lg ${
                            isActive && (isTimerRunning || timerDone)
                              ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                              : "bg-slate-700/50 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-400"
                          }`}
                          title="Mark done"
                        >
                          ✓ Done
                        </button>
                      )}

                      {isDone && (
                        <button
                          onClick={() => handleUndoRow(i)}
                          className="btn bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white px-2.5 py-1.5 rounded-lg"
                          title="Undo"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!schedule && (
          <section className="glass-card p-8 text-center animate-fade-in">
            <div className="text-4xl mb-3">⏱️</div>
            <h3 className="text-lg font-bold text-white mb-1">
              No Schedule Yet
            </h3>
            <p className="text-slate-400 text-sm">
              Enter the total practice time above and hit Generate to create a
              fair schedule for all present students.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

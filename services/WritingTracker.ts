/**
 * WritingTracker — tracks session word counts and daily writing velocity.
 *
 * The tracker captures a "baseline" word count when the session starts and
 * computes session words = current total − baseline. Historical daily totals
 * are persisted through the plugin's data so streaks survive restarts.
 */

export interface DailyEntry {
    /** ISO date string (YYYY-MM-DD) */
    date: string;
    /** Words written that day */
    words: number;
}

export interface WritingTrackerData {
    /** Daily word counts keyed by ISO date */
    history: Record<string, number>;
    /** Daily revision counts (absolute word changes — adds + deletes) keyed by ISO date */
    revisionHistory?: Record<string, number>;
}

export class WritingTracker {
    /** Word count at the moment the session started – null until startSession() is called */
    private baselineWords: number | null = null;
    /** Timestamp the session started */
    private sessionStart: number = Date.now();
    /** Persisted daily history */
    private history: Record<string, number> = {};
    /** Persisted daily revision (absolute change) history */
    private revisionHistory: Record<string, number> = {};
    /** Last known total word count — used to measure revision deltas between flushes */
    private lastKnownTotal: number | null = null;

    /**
     * Start (or restart) a session, capturing the current total word count
     * as the baseline.  Also sanitises today's history entry if it looks
     * corrupted (from earlier 0-baseline bug).
     */
    startSession(currentTotalWords: number): void {
        // If the project word count isn't available yet, don't start — keep
        // baseline null so getSessionWords / flushSession remain no-ops.
        if (currentTotalWords <= 0) return;

        this.baselineWords = currentTotalWords;
        this.lastKnownTotal = currentTotalWords;
        this.sessionStart = Date.now();

        // Sanitise: if today's stored value is unreasonably large (≥ 50% of
        // the entire project), it's almost certainly corrupted from the old
        // 0-baseline bug.  Clear it.
        const today = this.todayKey();
        const stored = this.history[today] || 0;
        if (stored > 0 && stored >= currentTotalWords * 0.5) {
            delete this.history[today];
        }
    }

    /** Words written this session (0 if session not started yet) */
    getSessionWords(currentTotalWords: number): number {
        if (this.baselineWords === null) {
            // Lazy-start: if the init call had 0 but now we have a real count
            if (currentTotalWords > 0) this.startSession(currentTotalWords);
            return 0;
        }
        return Math.max(0, currentTotalWords - this.baselineWords);
    }

    /** How long the session has been running (ms) */
    getSessionDuration(): number {
        return Date.now() - this.sessionStart;
    }

    /** Words per minute for this session */
    getWordsPerMinute(currentTotalWords: number): number {
        const minutes = this.getSessionDuration() / 60_000;
        if (minutes < 0.5) return 0;
        return Math.round(this.getSessionWords(currentTotalWords) / minutes);
    }

    // ── Daily history ──────────────────────────────────

    /** Record today's total to history (call periodically or on save) */
    recordToday(sessionWords: number): void {
        const today = this.todayKey();
        this.history[today] = (this.history[today] || 0) + sessionWords;
    }

    /** Flush session words into today's daily total and reset baseline */
    flushSession(currentTotalWords: number): void {
        if (this.baselineWords === null) return;   // session never started
        const sw = this.getSessionWords(currentTotalWords);
        if (sw > 0) {
            this.recordToday(sw);
        }

        // Track revision volume (absolute change since last flush)
        if (this.lastKnownTotal !== null) {
            const delta = Math.abs(currentTotalWords - this.lastKnownTotal);
            if (delta > 0) {
                this.recordRevisionToday(delta);
            }
        }
        this.lastKnownTotal = currentTotalWords;

        this.baselineWords = currentTotalWords;
    }

    /** Record today's revision volume */
    private recordRevisionToday(absChange: number): void {
        const today = this.todayKey();
        this.revisionHistory[today] = (this.revisionHistory[today] || 0) + absChange;
    }

    /** Get words written today */
    getTodayWords(): number {
        return this.history[this.todayKey()] || 0;
    }

    /** Get revision volume for today (absolute word changes — adds + deletes) */
    getTodayRevisions(): number {
        return this.revisionHistory[this.todayKey()] || 0;
    }

    /** Get recent revision history (most recent first) */
    getRecentRevisionDays(count: number): DailyEntry[] {
        const entries: DailyEntry[] = [];
        const d = new Date();
        for (let i = 0; i < count; i++) {
            const key = this.dateKey(d);
            entries.push({ date: key, words: this.revisionHistory[key] || 0 });
            d.setDate(d.getDate() - 1);
        }
        return entries;
    }

    /** Return the raw daily revision history record (date→words) */
    getFullRevisionHistory(): Record<string, number> {
        return { ...this.revisionHistory };
    }

    /** Get the last N days of history (most recent first) */
    getRecentDays(count: number): DailyEntry[] {
        const entries: DailyEntry[] = [];
        const d = new Date();
        for (let i = 0; i < count; i++) {
            const key = this.dateKey(d);
            entries.push({ date: key, words: this.history[key] || 0 });
            d.setDate(d.getDate() - 1);
        }
        return entries;
    }

    /** Current writing streak (consecutive days with > 0 words) */
    getStreak(): number {
        let streak = 0;
        const d = new Date();
        // If today has no words yet, start checking from yesterday
        if (!this.history[this.dateKey(d)]) {
            d.setDate(d.getDate() - 1);
        }
        while (true) {
            const key = this.dateKey(d);
            if ((this.history[key] || 0) > 0) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    }

    /** Return the raw daily history record (date→words) */
    getFullHistory(): Record<string, number> {
        return { ...this.history };
    }

    // ── Persistence ────────────────────────────────────

    /** Export data for saving */
    exportData(): WritingTrackerData {
        return {
            history: { ...this.history },
            revisionHistory: { ...this.revisionHistory },
        };
    }

    /** Import previously saved data */
    importData(data: WritingTrackerData | undefined): void {
        if (data?.history) {
            this.history = { ...data.history };
        }
        if (data?.revisionHistory) {
            this.revisionHistory = { ...data.revisionHistory };
        }
    }

    // ── Helpers ────────────────────────────────────────

    private todayKey(): string {
        return this.dateKey(new Date());
    }

    private dateKey(d: Date): string {
        return d.toISOString().split('T')[0];
    }
}

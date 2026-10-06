// Alternative non-overlapping ("split") encoding at the Timesheet level.
//
// Overlapping availability groups (a CLOSED exception layered over a NORMAL
// H24 schedule) can equivalently be encoded as non-overlapping Timesheets:
// NORMAL 00:00–04:00 / CLOSED 04:00–07:00 / NORMAL 07:00–24:00, with an
// exception date of the closure becoming an explicit full NORMAL row.
// splitGroups() computes that form: timesheets of a later group carve those
// of earlier groups (the exception layer prevails, whatever its status).
//
// Constraints (pieces are left unsplit when they do not hold):
//  - midnight-crossing times are not subtracted;
//  - `excluded` timesheets of a later group are treated as lifting that group
//    on their whole date window (exact for full-day exclusions).

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON_FIRST = (a, b) => ((a + 6) % 7) - ((b + 6) % 7);

function daySet(code) {
  if (!code || code === 'ANY') return new Set([0, 1, 2, 3, 4, 5, 6]);
  if (code === 'WORK_DAY') return new Set([1, 2, 3, 4, 5]);
  const i = DAY_NAMES.indexOf(code);
  return new Set(i >= 0 ? [i] : []);
}

function collapseDaySet(set) {
  if (set.size === 7) return ['ANY'];
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return ['WORK_DAY'];
  return [...set].sort(MON_FIRST).map((i) => DAY_NAMES[i]);
}

// Annual DD-MM windows as day-of-year ranges over a reference leap year, so
// complements/intersections can do date±1 arithmetic (29-02 included).
const REF = Date.UTC(2000, 0, 1);
const N_DAYS = 366;

function doyOf(ddmm) {
  const [d, m] = ddmm.split('-').map(Number);
  return Math.round((Date.UTC(2000, m - 1, d) - REF) / 86400000) + 1;
}

function mdOf(doy) {
  const t = new Date(REF + (doy - 1) * 86400000);
  return `${String(t.getUTCDate()).padStart(2, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** A timesheet's date window as linear [start, end] doy ranges (wrap split in two). */
function windowRanges(ts) {
  if (!ts.startDate || !ts.endDate) return [[1, N_DAYS]];
  const s = doyOf(ts.startDate);
  const e = doyOf(ts.endDate);
  return s <= e ? [[s, e]] : [[s, N_DAYS], [1, e]];
}

function intersectRanges(a, b) {
  const out = [];
  for (const [s1, e1] of a) {
    for (const [s2, e2] of b) {
      const s = Math.max(s1, s2);
      const e = Math.min(e1, e2);
      if (s <= e) out.push([s, e]);
    }
  }
  return out;
}

function subtractRanges(a, b) {
  let cur = a;
  for (const [s2, e2] of b) {
    const next = [];
    for (const [s1, e1] of cur) {
      if (e2 < s1 || s2 > e1) {
        next.push([s1, e1]);
        continue;
      }
      if (s1 < s2) next.push([s1, s2 - 1]);
      if (e1 > e2) next.push([e2 + 1, e1]);
    }
    cur = next;
  }
  return cur;
}

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** [start, end] minutes of a non-crossing timesheet; null when it crosses midnight. */
function timeRange(ts) {
  const s = toMin(ts.startTime ?? '00:00');
  let e = toMin(ts.endTime ?? '24:00');
  if (e <= s) {
    if (s !== 0) return null; // crosses midnight — not splittable here
    e = 1440; // 00:00–00:00 / 00:00–24:00 = full day
  }
  return [s, e];
}

const toHHMM = (min) =>
  min === 1440 ? '24:00' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Carve one working piece by a later-group timesheet. Untouched pieces pass by reference. */
function subtractPiece(p, lDays, lRanges, [ls, le]) {
  const dayI = new Set([...p.days].filter((d) => lDays.has(d)));
  if (!dayI.size) return [p];
  const dateI = intersectRanges(p.ranges, lRanges);
  if (!dateI.length) return [p];
  const os = Math.max(p.s, ls);
  const oe = Math.min(p.e, le);
  if (os >= oe) return [p];

  const out = [];
  const dayC = new Set([...p.days].filter((d) => !lDays.has(d)));
  if (dayC.size) out.push({ ...p, days: dayC });
  const dateC = subtractRanges(p.ranges, lRanges);
  if (dateC.length) out.push({ ...p, days: dayI, ranges: dateC });
  if (p.s < os) out.push({ ...p, days: dayI, ranges: dateI, e: os });
  if (oe < p.e) out.push({ ...p, days: dayI, ranges: dateI, s: oe });
  return out;
}

function pieceToSheets(p, orig) {
  const fullYear = p.ranges.length === 1 && p.ranges[0][0] === 1 && p.ranges[0][1] === N_DAYS;
  const sheets = [];
  for (const day of collapseDaySet(p.days)) {
    for (const [s, e] of p.ranges) {
      sheets.push({
        ...orig,
        day,
        startDate: fullYear && !orig.startDate ? null : mdOf(s),
        endDate: fullYear && !orig.endDate ? null : mdOf(e),
        startTime: toHHMM(p.s),
        endTime: toHHMM(p.e),
        split: true,
      });
    }
  }
  return sheets;
}

/**
 * Compute the alternative non-overlapping encoding of a normalized slice's
 * groups (see schedule.js): the timesheets of every group are carved by the
 * included timesheets of all later groups (minus their exclusions). Groups
 * without later overlap are returned as-is; derived sheets carry
 * `split: true` and keep the original's source/annotation.
 */
export function splitGroups(groups) {
  return groups.map((g, gi) => {
    const later = groups.slice(gi + 1).flatMap((lg) => {
      const exclusions = lg.timesheets.filter((ts) => ts.excluded).flatMap(windowRanges);
      return lg.timesheets
        .filter((ts) => !ts.excluded)
        .map((ts) => ({ time: timeRange(ts), days: daySet(ts.day), ranges: subtractRanges(windowRanges(ts), exclusions) }))
        .filter((l) => l.time && l.ranges.length);
    });
    if (!later.length) return g;

    const timesheets = [];
    let anySplit = false;
    for (const ts of g.timesheets) {
      const time = ts.excluded ? null : timeRange(ts);
      if (!time) {
        timesheets.push(ts); // exclusions and midnight-crossing sheets stay as-is
        continue;
      }
      const initial = { days: daySet(ts.day), ranges: windowRanges(ts), s: time[0], e: time[1] };
      let pieces = [initial];
      for (const l of later) {
        pieces = pieces.flatMap((p) => subtractPiece(p, l.days, l.ranges, l.time));
      }
      if (pieces.length === 1 && pieces[0] === initial) {
        timesheets.push(ts);
      } else {
        anySplit = true;
        for (const p of pieces) timesheets.push(...pieceToSheets(p, ts));
      }
    }
    return anySplit ? { ...g, timesheets, split: true } : g;
  });
}

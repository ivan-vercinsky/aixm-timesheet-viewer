// Expansion of AIXM 5.1 Timesheet properties into concrete UTC intervals.
//
// Supported Timesheet fields (simplified subset of the AIXM 5.1 Timesheet object):
//   timeReference : only "UTC" is supported
//   startDate / endDate : annual window, "DD-MM" (e.g. "01-01" .. "31-12"), may wrap year end
//   day : MON..SUN | WORK_DAY | ANY
//   startTime / endTime : "HH:MM" UTC; endTime "24:00" allowed; endTime < startTime
//                         is treated as crossing midnight into the next day

const DAY_TO_DOW = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

export function parseIso(s) {
  return s == null ? null : new Date(s);
}

function matchesDay(day, date) {
  const dow = date.getUTCDay();
  if (!day || day === 'ANY') return true;
  if (day === 'WORK_DAY') return dow >= 1 && dow <= 5;
  return DAY_TO_DOW[day] === dow;
}

function inAnnualWindow(ts, date) {
  if (!ts.startDate || !ts.endDate) return true;
  const [sd, sm] = ts.startDate.split('-').map(Number);
  const [ed, em] = ts.endDate.split('-').map(Number);
  const v = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const s = sm * 100 + sd;
  const e = em * 100 + ed;
  return s <= e ? v >= s && v <= e : v >= s || v <= e; // wrap across 31-12
}

function timeOnDay(dayStart, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(dayStart.getTime() + (h * 60 + m) * 60000);
}

export function utcMidnight(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

/**
 * Expand a list of Timesheets into concrete intervals within [rangeStart, rangeEnd),
 * clipped to the owning TimeSlice validTime {begin, end}.
 * Returns [{ start: Date, end: Date, timesheet, timesheetIndex }]
 */
export function expandTimesheets(timesheets, validTime, rangeStart, rangeEnd) {
  const clipStart = validTime?.begin ? new Date(validTime.begin) : null;
  const clipEnd = validTime?.end ? new Date(validTime.end) : null;
  const out = [];

  // Start a day early so overnight timesheets from the previous day are included.
  for (let day = addDays(utcMidnight(rangeStart), -1); day < rangeEnd; day = addDays(day, 1)) {
    for (let i = 0; i < timesheets.length; i++) {
      const ts = timesheets[i];
      if (!matchesDay(ts.day, day) || !inAnnualWindow(ts, day)) continue;

      let start = timeOnDay(day, ts.startTime ?? '00:00');
      let end = timeOnDay(day, ts.endTime ?? '24:00');
      if (end <= start) end = addDays(end, 1); // crosses midnight

      if (clipStart && start < clipStart) start = clipStart;
      if (clipEnd && end > clipEnd) end = clipEnd;
      if (start < rangeStart) start = new Date(Math.max(start, rangeStart));
      if (end > rangeEnd) end = new Date(Math.min(end, rangeEnd));
      if (end <= start) continue;

      out.push({ start, end, timesheet: ts, timesheetIndex: i });
    }
  }
  return out;
}

/**
 * Subtract `holes` from `intervals` (both [{start, end, ...}]).
 * Interval properties are carried onto the surviving fragments.
 */
export function subtractIntervals(intervals, holes) {
  if (!holes.length) return intervals;
  const out = [];
  for (const iv of intervals) {
    let parts = [iv];
    for (const h of holes) {
      const next = [];
      for (const p of parts) {
        if (h.end <= p.start || h.start >= p.end) {
          next.push(p);
          continue;
        }
        if (h.start > p.start) next.push({ ...p, end: h.start });
        if (h.end < p.end) next.push({ ...p, start: h.end });
      }
      parts = next;
    }
    out.push(...parts);
  }
  return out;
}

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartOf(date) {
  const d = utcMidnight(date);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  return addDays(d, -shift);
}

export function fmtTime(date) {
  return date.toISOString().slice(11, 16);
}

export function fmtDate(date) {
  return date.toISOString().slice(0, 10);
}

export function fmtDateTime(date) {
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'UFN';
}

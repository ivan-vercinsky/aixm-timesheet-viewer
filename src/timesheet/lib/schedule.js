// ScheduleEntry — the normalized input contract of the calendar component.
//
// The calendar never interprets AIXM Timesheet rules or DNOTAM coding rules;
// it only renders concrete, provenance-tagged UTC intervals:
//
//   ScheduleEntry {
//     start, end        : Date (UTC interval)
//     state             : 'ACTIVE' | 'INACTIVE'  (explicit INACTIVE is a state
//                         change, not missing schedule data)
//     status            : raw AIXM status (NORMAL, CLOSED, ACTIVE, ...)
//     source            : SOURCE.* provenance
//     sourceTimesheet   : the originating (simplified) Timesheet
//     note              : free-text remark, if any
//     inherited         : true on result-lane entries surviving from BASELINE
//   }
//
// This module is the DNOTAM schedule-resolution layer: it normalizes
// TimeSlices (simplified JSON or AIXM-JSON "aixm:availability"), derives
// provenance of TEMPDELTA content, expands Timesheets into ScheduleEntry
// lists and composes the effective (RESULT) schedule.

import { asArray, parseAvailabilityList } from './aixm.js';
import { expandTimesheets, subtractIntervals } from './timesheet.js';

export const SOURCE = {
  BASELINE: 'BASELINE',
  TEMPDELTA_EVENT: 'TEMPDELTA_EVENT',
  TEMPDELTA_BASELINE_COPY: 'TEMPDELTA_BASELINE_COPY',
};

export const SOURCE_LABELS = {
  [SOURCE.BASELINE]: 'From BASELINE',
  [SOURCE.TEMPDELTA_EVENT]: 'Introduced by the Event (TEMPDELTA)',
  [SOURCE.TEMPDELTA_BASELINE_COPY]: 'TEMPDELTA copy of BASELINE (AIXM temporality)',
};

const INACTIVE_STATUSES = new Set(['CLOSED', 'INACTIVE', 'UNAVAILABLE', 'OUT_OF_SERVICE']);

export function stateOf(status) {
  return status && INACTIVE_STATUSES.has(status) ? 'INACTIVE' : 'ACTIVE';
}

/**
 * Normalize a TimeSlice into { ...slice, groups }, where each group is
 * { gmlId, status, note, timesheets } — one group per availability/activation
 * object, since the operational status lives at that level.
 * Accepts the simplified example shape (activation/availability with
 * timeInterval — a single object or an array of such groups) and the
 * AIXM-JSON shape ("aixm:availability"). Always returns fresh objects.
 */
export function normalizeSlice(slice) {
  if (!slice) return null;
  const aixmAvail = slice['aixm:availability'];
  const groups = aixmAvail
    ? parseAvailabilityList(aixmAvail)
    : asArray(slice.activation ?? slice.availability).map((sched) => ({
        gmlId: null,
        status: sched.status ?? null,
        note: sched.note ?? null,
        timesheets: (sched.timeInterval ?? []).map((ts) => ({ excluded: false, ...ts })),
      }));
  return { ...slice, groups };
}

const tsKey = (ts) =>
  [ts.day ?? 'ANY', ts.startDate ?? '', ts.endDate ?? '', ts.startTime ?? '', ts.endTime ?? '', ts.excluded ? 'EX' : ''].join('|');
const groupKey = (g) => [g.status ?? '', ...g.timesheets.map(tsKey).sort()].join('§');

const HAND_TAGS = {
  BASELINE_COPY: SOURCE.TEMPDELTA_BASELINE_COPY,
  NEW: SOURCE.TEMPDELTA_EVENT,
  [SOURCE.TEMPDELTA_BASELINE_COPY]: SOURCE.TEMPDELTA_BASELINE_COPY,
  [SOURCE.TEMPDELTA_EVENT]: SOURCE.TEMPDELTA_EVENT,
};

/** True when a baseline day code covers a (possibly narrowed) delta day code. */
function dayCovers(baseDay, deltaDay) {
  const b = baseDay ?? 'ANY';
  const d = deltaDay ?? 'ANY';
  if (b === 'ANY' || b === d) return true;
  if (b === 'WORK_DAY') return ['MON', 'TUE', 'WED', 'THU', 'FRI'].includes(d);
  return false;
}

/**
 * Tag every TEMPDELTA timesheet with its provenance. Hand-authored `source`
 * tags win; otherwise AIXM carries no provenance marker, so copies are
 * identified by structural matching against the BASELINE:
 *  - a whole group with identical status + timesheet set, or an individual
 *    timesheet identical under the same status, is a copy;
 *  - so is a date-narrowed copy: same status, same times, same excluded flag
 *    and a day code covered by the baseline's (e.g. TUE within WORK_DAY) —
 *    ER-06 copies are typically narrowed to the Event validity like this.
 * Heuristic by design: an Event period that exactly reproduces baseline
 * content is operationally indistinguishable from a copy.
 */
export function deriveProvenance(baselineNorm, deltaNorm) {
  if (!deltaNorm) return deltaNorm;
  const baseGroups = new Set((baselineNorm?.groups ?? []).map(groupKey));
  const baseSheets = new Set();
  const baseLoose = [];
  for (const g of baselineNorm?.groups ?? []) {
    for (const ts of g.timesheets) {
      baseSheets.add(`${g.status ?? ''}|${tsKey(ts)}`);
      baseLoose.push({
        status: g.status ?? '',
        day: ts.day ?? 'ANY',
        startTime: ts.startTime,
        endTime: ts.endTime,
        excluded: !!ts.excluded,
      });
    }
  }
  for (const g of deltaNorm.groups) {
    const groupCopied = baseGroups.has(groupKey(g));
    const status = g.status ?? '';
    for (const ts of g.timesheets) {
      const copied =
        groupCopied ||
        baseSheets.has(`${status}|${tsKey(ts)}`) ||
        baseLoose.some(
          (b) =>
            b.status === status &&
            b.startTime === ts.startTime &&
            b.endTime === ts.endTime &&
            b.excluded === !!ts.excluded &&
            dayCovers(b.day, ts.day)
        );
      ts.source =
        HAND_TAGS[ts.source] ??
        (copied ? SOURCE.TEMPDELTA_BASELINE_COPY : SOURCE.TEMPDELTA_EVENT);
    }
  }
  return deltaNorm;
}

/**
 * Expand a normalized TimeSlice into ScheduleEntry[] within [rangeStart,
 * rangeEnd). Timesheets with excluded=YES subtract their intervals from the
 * other timesheets of the same group (AIXM exception semantics).
 */
export function entriesForSlice(normSlice, defaultSource, rangeStart, rangeEnd) {
  if (!normSlice) return [];
  const out = [];
  normSlice.groups.forEach((g, groupIndex) => {
    const included = g.timesheets.filter((ts) => !ts.excluded);
    const holes = expandTimesheets(
      g.timesheets.filter((ts) => ts.excluded),
      normSlice.validTime,
      rangeStart,
      rangeEnd
    );
    const ivs = expandTimesheets(included, normSlice.validTime, rangeStart, rangeEnd);
    for (const iv of subtractIntervals(ivs, holes)) {
      const ts = iv.timesheet;
      out.push({
        start: iv.start,
        end: iv.end,
        state: stateOf(g.status),
        status: g.status,
        source: ts.source ?? defaultSource,
        sourceTimesheet: ts,
        note: ts.annotation ?? g.note ?? null,
        groupIndex,
      });
    }
  });
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Compute the alternative non-overlapping ("split") encoding of a lane.
 *
 * AIXM availability groups may legitimately overlap (a CLOSED exception
 * layered over a NORMAL H24 schedule). The equally valid alternative encodes
 * the same meaning as non-overlapping fragments (NORMAL 00:00–04:00, CLOSED
 * 04:00–07:00, NORMAL 07:00–24:00). This computes that form: entries of a
 * later group carve those of earlier groups — the exception layer prevails,
 * whatever its status (so a NORMAL window over a CLOSED day also works).
 * Within one group nothing is carved. Fragments that were actually cut are
 * marked `splitFragment: true`.
 */
export function splitEntries(entries) {
  const out = [];
  for (const e of entries) {
    const holes = entries.filter(
      (o) => (o.groupIndex ?? 0) > (e.groupIndex ?? 0) && o.start < e.end && o.end > e.start
    );
    for (const frag of subtractIntervals([e], holes)) {
      out.push(frag === e ? frag : { ...frag, splitFragment: true });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

const FOREVER = new Date(8640000000000000);

/**
 * Compose the effective operational schedule from BASELINE + TEMPDELTA
 * ScheduleEntry lists.
 *
 * supersedes=true (AIXM temporality: the TEMPDELTA replaces the whole
 * property during its validity, e.g. SAA.ACT with ER-06 copies): BASELINE
 * survives only outside the validity window.
 * supersedes=false (overlay reading): BASELINE survives except where a
 * TEMPDELTA entry overlaps it.
 *
 * Overlaps between TEMPDELTA groups are first resolved by layer order
 * (splitEntries), then explicit INACTIVE entries carve their interval out of
 * ACTIVE entries but stay in the result as visible state-change blocks.
 */
export function resolveResult(baselineEntries, deltaEntries, validity, supersedes = true) {
  const delta = splitEntries(deltaEntries);
  const vBegin = validity?.begin ? new Date(validity.begin) : null;
  const holes = supersedes
    ? vBegin
      ? [{ start: vBegin, end: validity?.end ? new Date(validity.end) : FOREVER }]
      : []
    : delta;
  const inherited = subtractIntervals(baselineEntries, holes).map((e) => ({
    ...e,
    inherited: true,
  }));
  const combined = [...inherited, ...delta.map((e) => ({ ...e }))];
  const actives = combined.filter((e) => e.state === 'ACTIVE');
  const inactives = combined.filter((e) => e.state === 'INACTIVE');
  return [...subtractIntervals(actives, inactives), ...inactives].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
}

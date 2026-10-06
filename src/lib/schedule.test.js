// The 14 schedule cases from the ECTL/DNOTAM requirement analysis, each
// tested through the full resolution pipeline (normalize → derive provenance
// → expand → resolve) against the example scenarios in src/data/examples.
import { describe, expect, it } from 'vitest';
import {
  SOURCE,
  deriveProvenance,
  entriesForSlice,
  normalizeSlice,
  resolveResult,
  splitEntries,
  stateOf,
} from './schedule.js';
import { weekStartOf, addDays } from './timesheet.js';

import saaActExtension from '../data/examples/01-saa-act-extension.json';
import saaActNight from '../data/examples/02-saa-act-night.json';
import adClsRunway from '../data/examples/03-ad-cls-runway.json';
import svcHrsReduced from '../data/examples/04-svc-hrs-reduced.json';
import saaNewTda from '../data/examples/05-saa-new-tda.json';
import adAhpHospital from '../data/examples/06-ad-ahp-hospital.json';
import saaActCopyOnly from '../data/examples/07-saa-act-copy-only.json';
import svcHrsIntermittent from '../data/examples/08-svc-hrs-intermittent.json';

const iso = (d) => d.toISOString().slice(0, 16);
const span = (e) => `${iso(e.start)}→${iso(e.end)}`;
const onDay = (entries, dd) => entries.filter((e) => iso(e.start).startsWith(dd));

/** Run the full resolution pipeline over the NOTAM week of an example. */
function pipeline(ex, weeks = 1) {
  const slices = ex.feature.timeSlices;
  const baseline = normalizeSlice(slices.find((s) => s.interpretation === 'BASELINE') ?? null);
  const tempdelta = deriveProvenance(
    baseline,
    normalizeSlice(slices.find((s) => s.interpretation === 'TEMPDELTA'))
  );
  const start = weekStartOf(new Date(ex.event.validTime.begin));
  const end = addDays(start, 7 * weeks);
  const baselineEntries = entriesForSlice(baseline, SOURCE.BASELINE, start, end);
  const deltaEntries = entriesForSlice(tempdelta, SOURCE.TEMPDELTA_EVENT, start, end);
  const result = resolveResult(
    baselineEntries,
    deltaEntries,
    tempdelta?.validTime,
    ex.supersedesBaseline !== false
  );
  return { baseline, tempdelta, baselineEntries, deltaEntries, result };
}

/** Result invariant: ACTIVE entries never overlap each other or an INACTIVE entry. */
function expectNoActiveOverlap(result) {
  const actives = result.filter((e) => e.state === 'ACTIVE');
  for (const a of actives) {
    for (const b of result) {
      if (a === b) continue;
      if (b.state === 'ACTIVE' && !(a.end <= b.start || a.start >= b.end) && a.start <= b.start) {
        throw new Error(`overlapping ACTIVE entries: ${span(a)} / ${span(b)}`);
      }
      if (b.state === 'INACTIVE' && !(a.end <= b.start || a.start >= b.end)) {
        throw new Error(`ACTIVE ${span(a)} overlaps INACTIVE ${span(b)}`);
      }
    }
  }
}

describe('case 1 — no BASELINE schedule (SAA.NEW, example 05)', () => {
  it('shows the newly introduced Event schedule alone', () => {
    const { baselineEntries, deltaEntries, result } = pipeline(saaNewTda);
    expect(baselineEntries).toEqual([]);
    expect(result).toHaveLength(deltaEntries.length);
    expect(result.every((e) => e.source === SOURCE.TEMPDELTA_EVENT)).toBe(true);
    // MON-WED 07:00-16:00 + THU-FRI 07:00-12:00
    expect(result.map(span)).toEqual([
      '2026-11-02T07:00→2026-11-02T16:00',
      '2026-11-03T07:00→2026-11-03T16:00',
      '2026-11-04T07:00→2026-11-04T16:00',
      '2026-11-05T07:00→2026-11-05T12:00',
      '2026-11-06T07:00→2026-11-06T12:00',
    ]);
  });
});

describe('case 2 — BASELINE copied unchanged (example 07, no hand tags)', () => {
  it('derives TEMPDELTA_BASELINE_COPY for the identical timesheet', () => {
    const { deltaEntries } = pipeline(saaActCopyOnly);
    expect(deltaEntries.length).toBeGreaterThan(0);
    expect(deltaEntries.every((e) => e.source === SOURCE.TEMPDELTA_BASELINE_COPY)).toBe(true);
  });

  it('the resulting schedule equals the baseline schedule (no operational change)', () => {
    const { baselineEntries, result } = pipeline(saaActCopyOnly);
    expect(result.map(span)).toEqual(baselineEntries.map(span));
    expect(result.every((e) => e.state === 'ACTIVE')).toBe(true);
  });
});

describe('case 3 — BASELINE schedule fully replaced (SVC.HRS, example 04)', () => {
  it('inside the validity only the Event hours apply; the weekend baseline survives', () => {
    const { result } = pipeline(svcHrsReduced);
    for (const dd of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) {
      expect(onDay(result, dd).map(span)).toEqual([`${dd}T08:00→${dd}T14:00`]);
      expect(onDay(result, dd)[0].source).toBe(SOURCE.TEMPDELTA_EVENT);
    }
    const sat = onDay(result, '2026-10-31');
    expect(sat.map(span)).toEqual(['2026-10-31T08:00→2026-10-31T16:00']);
    expect(sat[0].inherited).toBe(true);
    expect(sat[0].source).toBe(SOURCE.BASELINE);
  });
});

describe('case 4 — BASELINE partially replaced (SAA.ACT ER-06, example 01)', () => {
  it('distinguishes extended periods from copied baseline periods in the result', () => {
    const { result } = pipeline(saaActExtension);
    const mon = onDay(result, '2026-10-05');
    expect(mon.map(span)).toEqual(['2026-10-05T07:00→2026-10-05T22:00']);
    expect(mon[0].source).toBe(SOURCE.TEMPDELTA_EVENT);

    const tue = onDay(result, '2026-10-06');
    expect(tue.map(span)).toEqual(['2026-10-06T07:00→2026-10-06T15:00']);
    expect(tue[0].source).toBe(SOURCE.TEMPDELTA_BASELINE_COPY);
  });
});

describe('case 5 — additional Event period (SAA.ACT night, example 02)', () => {
  it('keeps the copied baseline nights and adds the new FRI/SAT nights', () => {
    const { deltaEntries } = pipeline(saaActNight);
    const copies = deltaEntries.filter((e) => e.source === SOURCE.TEMPDELTA_BASELINE_COPY);
    const added = deltaEntries.filter((e) => e.source === SOURCE.TEMPDELTA_EVENT);
    expect(copies.map(span)).toEqual([
      '2026-10-13T20:00→2026-10-14T02:00',
      '2026-10-15T20:00→2026-10-16T02:00',
    ]);
    expect(added.map(span)).toEqual([
      '2026-10-16T21:00→2026-10-17T03:00',
      '2026-10-17T21:00→2026-10-18T03:00',
    ]);
  });
});

describe('case 6 — Event suppresses a BASELINE period (AD.CLS, example 03)', () => {
  it('carves the closure out of the availability and keeps it visible as INACTIVE', () => {
    const { result } = pipeline(adClsRunway);
    expect(onDay(result, '2026-10-19').map((e) => `${span(e)} ${e.state}`)).toEqual([
      '2026-10-19T05:00→2026-10-19T08:00 ACTIVE',
      '2026-10-19T08:00→2026-10-19T12:00 INACTIVE',
      '2026-10-19T12:00→2026-10-19T22:00 ACTIVE',
    ]);
  });

  it('the TEMPDELTA carries the remaining hours as a derived, date-narrowed baseline copy', () => {
    const { deltaEntries } = pipeline(adClsRunway);
    const copies = deltaEntries.filter((e) => e.source === SOURCE.TEMPDELTA_BASELINE_COPY);
    const closures = deltaEntries.filter((e) => e.state === 'INACTIVE');
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.every((e) => e.status === 'OPERATIONAL')).toBe(true);
    expect(closures.length).toBe(3);
    expect(closures.every((e) => e.source === SOURCE.TEMPDELTA_EVENT)).toBe(true);
  });
});

describe('case 7 — Event applies only to part of its validity (example 08)', () => {
  it('keeps the untouched baseline on days without Event periods', () => {
    const { result } = pipeline(svcHrsIntermittent);
    const tue = onDay(result, '2026-11-10');
    expect(tue.map(span)).toEqual(['2026-11-10T06:00→2026-11-10T14:00']);
    expect(tue[0].inherited).toBe(true);
  });
});

describe('case 8 — overlapping BASELINE and Event schedules (example 08)', () => {
  it('gives the Event precedence over the overlapped portion, without double-counting', () => {
    const { result } = pipeline(svcHrsIntermittent);
    expect(onDay(result, '2026-11-09').map((e) => `${span(e)} ${e.source}`)).toEqual([
      '2026-11-09T06:00→2026-11-09T12:00 BASELINE',
      '2026-11-09T12:00→2026-11-09T20:00 TEMPDELTA_EVENT',
    ]);
    expectNoActiveOverlap(result);
  });

  it('the no-active-overlap invariant holds for every example', () => {
    for (const ex of [
      saaActExtension,
      saaActNight,
      adClsRunway,
      svcHrsReduced,
      saaNewTda,
      adAhpHospital,
      saaActCopyOnly,
      svcHrsIntermittent,
    ]) {
      expectNoActiveOverlap(pipeline(ex, 2).result);
    }
  });
});

describe('case 9 — multiple Timesheets / availability groups (example 06)', () => {
  it('merges entries from several groups into one ordered list', () => {
    const { tempdelta, deltaEntries } = pipeline(adAhpHospital);
    expect(tempdelta.groups).toHaveLength(2);
    expect(deltaEntries.length).toBeGreaterThan(7);
    for (let i = 1; i < deltaEntries.length; i++) {
      expect(deltaEntries[i].start >= deltaEntries[i - 1].start).toBe(true);
    }
  });
});

describe('case 10 — date-specific exception to a recurring pattern (example 06)', () => {
  it('the excluded Timesheet lifts the closure on 08 OCT only', () => {
    const { result } = pipeline(adAhpHospital);
    const exceptionDay = onDay(result, '2026-10-08');
    expect(exceptionDay.some((e) => e.state === 'INACTIVE')).toBe(false);
    const normalDay = onDay(result, '2026-10-07');
    expect(normalDay.map((e) => `${span(e)} ${e.state}`)).toContain(
      '2026-10-07T04:00→2026-10-07T07:00 INACTIVE'
    );
  });
});

describe('case 11 — schedule spanning midnight (example 02)', () => {
  it('expands 20:00–02:00 into an interval ending on the next calendar day', () => {
    const { deltaEntries } = pipeline(saaActNight);
    const night = deltaEntries.find((e) => iso(e.start) === '2026-10-13T20:00');
    expect(night).toBeDefined();
    expect(iso(night.end)).toBe('2026-10-14T02:00');
  });
});

describe('case 12 — schedule clipped to Event validity (example 06)', () => {
  it('keeps every TEMPDELTA entry inside the validity window', () => {
    const { tempdelta, deltaEntries } = pipeline(adAhpHospital, 2);
    const begin = new Date(tempdelta.validTime.begin);
    const end = new Date(tempdelta.validTime.end);
    expect(deltaEntries.length).toBeGreaterThan(0);
    for (const e of deltaEntries) {
      expect(e.start >= begin).toBe(true);
      expect(e.end <= end).toBe(true);
    }
    // the H24 copy is clipped to the validity begin, not the calendar day
    expect(iso(deltaEntries[0].start)).toBe('2026-10-05T04:00');
  });
});

describe('case 13 — TEMPDELTA content copied for AIXM compliance (example 06)', () => {
  it('derives provenance structurally on real AIXM-JSON without hand tags', () => {
    const { tempdelta } = pipeline(adAhpHospital);
    const [copyGroup, closureGroup] = tempdelta.groups;
    expect(copyGroup.timesheets.every((ts) => ts.source === SOURCE.TEMPDELTA_BASELINE_COPY)).toBe(
      true
    );
    expect(closureGroup.timesheets.every((ts) => ts.source === SOURCE.TEMPDELTA_EVENT)).toBe(true);
  });

  it('detects a date-narrowed copy (specific weekday within WORK_DAY)', () => {
    const baseline = normalizeSlice({
      interpretation: 'BASELINE',
      validTime: { begin: '2026-01-01T00:00:00Z', end: null },
      activation: {
        status: 'ACTIVE',
        timeInterval: [
          { day: 'WORK_DAY', startDate: '01-01', endDate: '31-12', startTime: '07:00', endTime: '15:00' },
        ],
      },
    });
    const delta = deriveProvenance(
      baseline,
      normalizeSlice({
        interpretation: 'TEMPDELTA',
        validTime: { begin: '2026-10-05T06:00:00Z', end: '2026-10-09T20:00:00Z' },
        activation: {
          status: 'ACTIVE',
          timeInterval: [
            { day: 'TUE', startDate: '06-10', endDate: '06-10', startTime: '07:00', endTime: '15:00' },
            { day: 'MON', startDate: '05-10', endDate: '05-10', startTime: '07:00', endTime: '22:00' },
          ],
        },
      })
    );
    expect(delta.groups[0].timesheets[0].source).toBe(SOURCE.TEMPDELTA_BASELINE_COPY);
    expect(delta.groups[0].timesheets[1].source).toBe(SOURCE.TEMPDELTA_EVENT);
  });

  it('does not classify as copy when the operational status differs', () => {
    const baseline = normalizeSlice({
      interpretation: 'BASELINE',
      validTime: { begin: '2026-01-01T00:00:00Z', end: null },
      availability: { status: 'NORMAL', timeInterval: [{ day: 'ANY', startTime: '06:00', endTime: '14:00' }] },
    });
    const delta = deriveProvenance(
      baseline,
      normalizeSlice({
        interpretation: 'TEMPDELTA',
        validTime: { begin: '2026-10-05T00:00:00Z', end: '2026-10-09T00:00:00Z' },
        availability: { status: 'CLOSED', timeInterval: [{ day: 'ANY', startTime: '06:00', endTime: '14:00' }] },
      })
    );
    expect(delta.groups[0].timesheets[0].source).toBe(SOURCE.TEMPDELTA_EVENT);
  });

  it('hand-authored source tags win over structural matching', () => {
    const { tempdelta } = pipeline(saaActExtension);
    const sources = tempdelta.groups[0].timesheets.map((ts) => ts.source);
    expect(sources).toEqual([
      SOURCE.TEMPDELTA_EVENT,
      SOURCE.TEMPDELTA_BASELINE_COPY,
      SOURCE.TEMPDELTA_EVENT,
      SOURCE.TEMPDELTA_BASELINE_COPY,
      SOURCE.TEMPDELTA_BASELINE_COPY,
    ]);
  });
});

describe('splitEntries — alternative non-overlapping encoding', () => {
  const aixmSheet = (over) => ({
    'aixm:Timesheet': { 'aixm:timeReference': 'UTC', 'aixm:day': 'ANY', ...over },
  });
  const availability = (status, sheets) => ({
    'aixm:AirportHeliportAvailability': {
      'aixm:operationalStatus': status,
      'aixm:timeInterval': sheets,
    },
  });

  it('splits the hospital TEMPDELTA into non-overlapping fragments (later group wins)', () => {
    const { deltaEntries } = pipeline(adAhpHospital);
    const split = splitEntries(deltaEntries);
    for (let i = 0; i < split.length; i++) {
      for (let j = i + 1; j < split.length; j++) {
        expect(split[i].start < split[j].end && split[j].start < split[i].end).toBe(false);
      }
    }
    // NORMAL H24 copy on 06 OCT is cut around the CLOSED window
    expect(onDay(split, '2026-10-06').map((e) => `${span(e)} ${e.state}`)).toEqual([
      '2026-10-06T00:00→2026-10-06T04:00 ACTIVE',
      '2026-10-06T04:00→2026-10-06T07:00 INACTIVE',
      '2026-10-06T07:00→2026-10-07T00:00 ACTIVE',
    ]);
    // cut fragments are marked, the untouched CLOSED entry is not
    expect(onDay(split, '2026-10-06').map((e) => !!e.splitFragment)).toEqual([true, false, true]);
  });

  it('leaves non-overlapping lanes unchanged', () => {
    const { deltaEntries } = pipeline(svcHrsReduced);
    expect(splitEntries(deltaEntries).map(span)).toEqual(deltaEntries.map(span));
  });

  it('handles the reverse pattern: a NORMAL window layered over a CLOSED day', () => {
    const slice = normalizeSlice({
      interpretation: 'TEMPDELTA',
      validTime: { begin: '2026-10-05T00:00:00Z', end: '2026-10-06T00:00:00Z' },
      'aixm:availability': [
        availability('CLOSED', aixmSheet({ 'aixm:startTime': '00:00', 'aixm:endTime': '24:00' })),
        availability('NORMAL', aixmSheet({ 'aixm:startTime': '10:00', 'aixm:endTime': '12:00' })),
      ],
    });
    const entries = entriesForSlice(
      slice,
      SOURCE.TEMPDELTA_EVENT,
      new Date('2026-10-05T00:00:00Z'),
      new Date('2026-10-06T00:00:00Z')
    );
    expect(splitEntries(entries).map((e) => `${span(e)} ${e.state}`)).toEqual([
      '2026-10-05T00:00→2026-10-05T10:00 INACTIVE',
      '2026-10-05T10:00→2026-10-05T12:00 ACTIVE',
      '2026-10-05T12:00→2026-10-06T00:00 INACTIVE',
    ]);
    // resolveResult applies the same layering, so the NORMAL window survives
    const result = resolveResult([], entries, slice.validTime, true);
    expect(result.find((e) => e.state === 'ACTIVE')).toBeDefined();
    expect(span(result.find((e) => e.state === 'ACTIVE'))).toBe(
      '2026-10-05T10:00→2026-10-05T12:00'
    );
  });
});

describe('case 14 — explicit INACTIVE is a state change, not missing data', () => {
  it('maps CLOSED/INACTIVE statuses to state INACTIVE', () => {
    expect(stateOf('CLOSED')).toBe('INACTIVE');
    expect(stateOf('INACTIVE')).toBe('INACTIVE');
    expect(stateOf('NORMAL')).toBe('ACTIVE');
    expect(stateOf('ACTIVE')).toBe('ACTIVE');
    expect(stateOf(null)).toBe('ACTIVE');
  });

  it('keeps explicit INACTIVE entries in the result with their status', () => {
    const { result } = pipeline(adAhpHospital);
    const closed = result.filter((e) => e.state === 'INACTIVE');
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.every((e) => e.status === 'CLOSED')).toBe(true);
    expect(closed.every((e) => e.source === SOURCE.TEMPDELTA_EVENT)).toBe(true);
  });

  it('an INACTIVE period differs from absent data: actives are carved around it', () => {
    const { result } = pipeline(adAhpHospital);
    expect(onDay(result, '2026-10-06').map((e) => `${span(e)} ${e.state}`)).toEqual([
      '2026-10-06T00:00→2026-10-06T04:00 ACTIVE',
      '2026-10-06T04:00→2026-10-06T07:00 INACTIVE',
      '2026-10-06T07:00→2026-10-07T00:00 ACTIVE',
    ]);
  });
});

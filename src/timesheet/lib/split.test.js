import { describe, expect, it } from 'vitest';
import { splitGroups } from './split.js';
import {
  SOURCE,
  deriveProvenance,
  entriesForSlice,
  normalizeSlice,
  splitEntries,
} from './schedule.js';
import adAhpHospital from '../../data/examples/06-ad-ahp-hospital.json';

const row = (ts) =>
  `${ts.startDate ?? 'any'}..${ts.endDate ?? 'any'} ${ts.day} ${ts.startTime}-${ts.endTime}`;

function hospitalDelta() {
  const slices = adAhpHospital.feature.timeSlices;
  const baseline = normalizeSlice(slices.find((s) => s.interpretation === 'BASELINE'));
  return deriveProvenance(
    baseline,
    normalizeSlice(slices.find((s) => s.interpretation === 'TEMPDELTA'))
  );
}

describe('splitGroups — alternative encoding at the Timesheet level', () => {
  it('splits the hospital NORMAL copy around the CLOSED windows, honoring the exclusion date', () => {
    const { groups } = hospitalDelta();
    const [normal, closed] = splitGroups(groups);

    expect(normal.split).toBe(true);
    expect(normal.timesheets.map(row).sort()).toEqual(
      [
        // around the closure, on the dates where the closure applies
        '01-01..07-10 ANY 00:00-04:00',
        '01-01..07-10 ANY 07:00-24:00',
        '09-10..31-12 ANY 00:00-04:00',
        '09-10..31-12 ANY 07:00-24:00',
        // the closure's excluded date becomes an explicit full NORMAL day
        '08-10..08-10 ANY 00:00-24:00',
      ].sort()
    );
    // derived rows are marked and keep the original provenance
    expect(normal.timesheets.every((ts) => ts.split === true)).toBe(true);
    expect(normal.timesheets.every((ts) => ts.source === SOURCE.TEMPDELTA_BASELINE_COPY)).toBe(
      true
    );

    // the top layer is untouched (same group object)
    expect(closed).toBe(groups[1]);
    expect(closed.split).toBeUndefined();
    expect(closed.timesheets.map(row)).toEqual([
      'any..any ANY 04:00-07:00',
      '08-10..08-10 ANY 00:00-00:00',
    ]);
  });

  it('expanding the split timesheets equals splitting the expanded intervals', () => {
    const delta = hospitalDelta();
    const splitSlice = { ...delta, groups: splitGroups(delta.groups) };
    const ws = new Date('2026-10-05T00:00:00Z');
    const we = new Date('2026-10-19T00:00:00Z');
    const key = (e) =>
      `${e.start.toISOString()}→${e.end.toISOString()} ${e.state} ${e.source}`;
    const fromSheets = entriesForSlice(splitSlice, SOURCE.TEMPDELTA_EVENT, ws, we).map(key).sort();
    const fromIntervals = splitEntries(entriesForSlice(delta, SOURCE.TEMPDELTA_EVENT, ws, we))
      .map(key)
      .sort();
    expect(fromSheets).toEqual(fromIntervals);
  });

  it('splits day codes: a MON-only closure carves only Mondays out of ANY', () => {
    const groups = [
      {
        status: 'NORMAL',
        note: null,
        timesheets: [{ day: 'ANY', startTime: '00:00', endTime: '24:00', excluded: false }],
      },
      {
        status: 'CLOSED',
        note: null,
        timesheets: [{ day: 'MON', startTime: '04:00', endTime: '07:00', excluded: false }],
      },
    ];
    const [normal] = splitGroups(groups);
    expect(normal.timesheets.map(row).sort()).toEqual(
      [
        'any..any TUE 00:00-24:00',
        'any..any WED 00:00-24:00',
        'any..any THU 00:00-24:00',
        'any..any FRI 00:00-24:00',
        'any..any SAT 00:00-24:00',
        'any..any SUN 00:00-24:00',
        'any..any MON 00:00-04:00',
        'any..any MON 07:00-24:00',
      ].sort()
    );
  });

  it('collapses a WORK_DAY remainder back to the WORK_DAY code', () => {
    const groups = [
      {
        status: 'NORMAL',
        note: null,
        timesheets: [{ day: 'ANY', startTime: '08:00', endTime: '16:00', excluded: false }],
      },
      {
        status: 'CLOSED',
        note: null,
        timesheets: [
          { day: 'SAT', startTime: '08:00', endTime: '16:00', excluded: false },
          { day: 'SUN', startTime: '08:00', endTime: '16:00', excluded: false },
        ],
      },
    ];
    const [normal] = splitGroups(groups);
    expect(normal.timesheets.map(row)).toEqual(['any..any WORK_DAY 08:00-16:00']);
  });

  it('leaves midnight-crossing timesheets unsplit', () => {
    const groups = [
      {
        status: 'ACTIVE',
        note: null,
        timesheets: [{ day: 'ANY', startTime: '20:00', endTime: '02:00', excluded: false }],
      },
      {
        status: 'INACTIVE',
        note: null,
        timesheets: [{ day: 'ANY', startTime: '21:00', endTime: '22:00', excluded: false }],
      },
    ];
    const [active] = splitGroups(groups);
    expect(active.timesheets.map(row)).toEqual(['any..any ANY 20:00-02:00']);
    expect(active.split).toBeUndefined();
  });

  it('splits the AD.CLS runway copy around the closure (date-windowed groups)', () => {
    const groups = [
      {
        status: 'OPERATIONAL',
        note: null,
        timesheets: [
          { startDate: '19-10', endDate: '21-10', day: 'ANY', startTime: '05:00', endTime: '22:00', excluded: false },
        ],
      },
      {
        status: 'CLOSED',
        note: null,
        timesheets: [
          { startDate: '19-10', endDate: '21-10', day: 'ANY', startTime: '08:00', endTime: '12:00', excluded: false },
        ],
      },
    ];
    const [operational, closed] = splitGroups(groups);
    expect(operational.timesheets.map(row).sort()).toEqual(
      ['19-10..21-10 ANY 05:00-08:00', '19-10..21-10 ANY 12:00-22:00'].sort()
    );
    expect(closed).toBe(groups[1]);
  });

  it('returns groups untouched when nothing overlaps', () => {
    const groups = [
      {
        status: 'NORMAL',
        note: null,
        timesheets: [{ day: 'ANY', startTime: '06:00', endTime: '14:00', excluded: false }],
      },
      {
        status: 'CLOSED',
        note: null,
        timesheets: [{ day: 'ANY', startTime: '16:00', endTime: '18:00', excluded: false }],
      },
    ];
    const out = splitGroups(groups);
    expect(out[0]).toBe(groups[0]);
    expect(out[1]).toBe(groups[1]);
  });
});

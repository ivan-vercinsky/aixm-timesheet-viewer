import { describe, expect, it } from 'vitest';
import { expandTimesheets, subtractIntervals, weekStartOf } from './timesheet.js';

const D = (s) => new Date(s);
const iso = (d) => d.toISOString().slice(0, 16);
// Monday 2026-10-05 .. Sunday 2026-10-11
const WEEK = [D('2026-10-05T00:00:00Z'), D('2026-10-12T00:00:00Z')];
const OPEN = { begin: '2026-01-01T00:00:00Z', end: null };

const ts = (over = {}) => ({
  timeReference: 'UTC',
  day: 'ANY',
  startTime: '00:00',
  endTime: '24:00',
  ...over,
});

describe('expandTimesheets — day codes', () => {
  it('ANY matches every day of the week', () => {
    expect(expandTimesheets([ts()], OPEN, ...WEEK)).toHaveLength(7);
  });

  it('WORK_DAY matches Monday to Friday only', () => {
    const out = expandTimesheets([ts({ day: 'WORK_DAY' })], OPEN, ...WEEK);
    expect(out).toHaveLength(5);
    expect(out.map((iv) => iv.start.getUTCDay())).toEqual([1, 2, 3, 4, 5]);
  });

  it('a specific weekday matches exactly once per week', () => {
    const out = expandTimesheets([ts({ day: 'SAT', startTime: '08:00', endTime: '12:00' })], OPEN, ...WEEK);
    expect(out).toHaveLength(1);
    expect(iso(out[0].start)).toBe('2026-10-10T08:00');
    expect(iso(out[0].end)).toBe('2026-10-10T12:00');
  });
});

describe('expandTimesheets — annual DD-MM windows', () => {
  const winter = ts({ startDate: '15-12', endDate: '15-01', startTime: '10:00', endTime: '12:00' });

  it('a window wrapping the year end matches January days', () => {
    const jan = [D('2027-01-04T00:00:00Z'), D('2027-01-11T00:00:00Z')];
    expect(expandTimesheets([winter], OPEN, ...jan)).toHaveLength(7);
  });

  it('a window wrapping the year end does not match June days', () => {
    const jun = [D('2026-06-01T00:00:00Z'), D('2026-06-08T00:00:00Z')];
    expect(expandTimesheets([winter], OPEN, ...jun)).toHaveLength(0);
  });

  it('a single-date window matches only that date', () => {
    const out = expandTimesheets([ts({ startDate: '07-10', endDate: '07-10' })], OPEN, ...WEEK);
    expect(out).toHaveLength(1);
    expect(iso(out[0].start)).toBe('2026-10-07T00:00');
  });
});

describe('expandTimesheets — times (case 11: midnight crossing)', () => {
  it('endTime before startTime continues into the next day', () => {
    const out = expandTimesheets([ts({ day: 'TUE', startTime: '20:00', endTime: '02:00' })], OPEN, ...WEEK);
    expect(out).toHaveLength(1);
    expect(iso(out[0].start)).toBe('2026-10-06T20:00');
    expect(iso(out[0].end)).toBe('2026-10-07T02:00');
  });

  it('an overnight block from the day before the range is included', () => {
    const out = expandTimesheets(
      [ts({ day: 'SUN', startTime: '22:00', endTime: '03:00' })],
      OPEN,
      ...WEEK
    );
    // Sunday 04 Oct 22:00 → Monday 05 Oct 03:00, clipped to the range start
    expect(iso(out[0].start)).toBe('2026-10-05T00:00');
    expect(iso(out[0].end)).toBe('2026-10-05T03:00');
  });

  it('00:00–24:00 and 00:00–00:00 both cover the full day', () => {
    for (const endTime of ['24:00', '00:00']) {
      const out = expandTimesheets([ts({ day: 'WED', endTime })], OPEN, ...WEEK);
      expect(iso(out[0].start)).toBe('2026-10-07T00:00');
      expect(iso(out[0].end)).toBe('2026-10-08T00:00');
    }
  });
});

describe('expandTimesheets — clipping to validTime (case 12)', () => {
  it('drops and trims intervals outside the TimeSlice validity', () => {
    const validTime = { begin: '2026-10-07T10:00:00Z', end: '2026-10-09T11:00:00Z' };
    const out = expandTimesheets([ts({ startTime: '08:00', endTime: '12:00' })], validTime, ...WEEK);
    expect(out.map((iv) => `${iso(iv.start)}→${iso(iv.end)}`)).toEqual([
      '2026-10-07T10:00→2026-10-07T12:00',
      '2026-10-08T08:00→2026-10-08T12:00',
      '2026-10-09T08:00→2026-10-09T11:00',
    ]);
  });
});

describe('subtractIntervals', () => {
  const iv = (s, e, extra = {}) => ({ start: D(s), end: D(e), ...extra });

  it('leaves disjoint intervals untouched', () => {
    const a = [iv('2026-10-05T08:00:00Z', '2026-10-05T12:00:00Z')];
    const holes = [iv('2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z')];
    expect(subtractIntervals(a, holes)).toEqual(a);
  });

  it('splits around a hole and carries interval properties', () => {
    const a = [iv('2026-10-05T06:00:00Z', '2026-10-05T18:00:00Z', { tag: 'x' })];
    const out = subtractIntervals(a, [iv('2026-10-05T10:00:00Z', '2026-10-05T12:00:00Z')]);
    expect(out.map((p) => `${iso(p.start)}→${iso(p.end)}`)).toEqual([
      '2026-10-05T06:00→2026-10-05T10:00',
      '2026-10-05T12:00→2026-10-05T18:00',
    ]);
    expect(out.every((p) => p.tag === 'x')).toBe(true);
  });

  it('removes an interval fully covered by a hole', () => {
    const a = [iv('2026-10-05T08:00:00Z', '2026-10-05T12:00:00Z')];
    expect(subtractIntervals(a, [iv('2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z')])).toEqual([]);
  });
});

describe('weekStartOf', () => {
  it('returns the Monday 00:00 UTC of the containing week', () => {
    expect(iso(weekStartOf(D('2026-10-08T15:30:00Z')))).toBe('2026-10-05T00:00');
    expect(iso(weekStartOf(D('2026-10-05T00:00:00Z')))).toBe('2026-10-05T00:00');
    expect(iso(weekStartOf(D('2026-10-11T23:59:00Z')))).toBe('2026-10-05T00:00');
  });
});

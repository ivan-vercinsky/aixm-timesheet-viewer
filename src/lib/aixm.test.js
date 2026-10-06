import { describe, expect, it } from 'vitest';
import { asArray, parseAixmTimesheet, parseAvailabilityList } from './aixm.js';
import adAhpHospital from '../data/examples/06-ad-ahp-hospital.json';

const tempdelta = adAhpHospital.feature.timeSlices.find((s) => s.interpretation === 'TEMPDELTA');
const baseline = adAhpHospital.feature.timeSlices.find((s) => s.interpretation === 'BASELINE');

describe('asArray', () => {
  it('wraps a single value, passes arrays through, maps null to []', () => {
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });
});

describe('parseAixmTimesheet', () => {
  it('maps aixm:-prefixed fields and defaults', () => {
    const out = parseAixmTimesheet({
      'aixm:Timesheet': {
        '-gml:id': 'id1',
        'aixm:timeReference': 'UTC',
        'aixm:day': 'MON',
        'aixm:startTime': '04:00',
        'aixm:endTime': '07:00',
        'aixm:daylightSavingAdjust': 'NO',
        'aixm:excluded': 'NO',
      },
    });
    expect(out).toMatchObject({
      timeReference: 'UTC',
      day: 'MON',
      startTime: '04:00',
      endTime: '07:00',
      excluded: false,
      startDate: null,
      endDate: null,
    });
  });

  it('marks aixm:excluded YES', () => {
    const out = parseAixmTimesheet({
      'aixm:Timesheet': {
        'aixm:startDate': '08-10',
        'aixm:endDate': '08-10',
        'aixm:day': 'ANY',
        'aixm:startTime': '00:00',
        'aixm:endTime': '00:00',
        'aixm:excluded': 'YES',
      },
    });
    expect(out.excluded).toBe(true);
    expect(out.startDate).toBe('08-10');
  });
});

describe('parseAvailabilityList (real AIXM-JSON sample)', () => {
  it('parses both availability groups of the TEMPDELTA', () => {
    const groups = parseAvailabilityList(tempdelta['aixm:availability']);
    expect(groups).toHaveLength(2);

    const [copy, closure] = groups;
    expect(copy.status).toBe('NORMAL');
    expect(copy.gmlId).toBe('id_6fe877b3-606b-4790-b3c0-9c3f20619b17_6_0_B_13');
    expect(copy.timesheets).toHaveLength(1);
    expect(copy.timesheets[0]).toMatchObject({ day: 'ANY', startTime: '00:00', endTime: '24:00' });

    expect(closure.status).toBe('CLOSED');
    expect(closure.timesheets).toHaveLength(2);
    expect(closure.timesheets[0]).toMatchObject({ startTime: '04:00', endTime: '07:00', excluded: false });
    expect(closure.timesheets[1]).toMatchObject({ startDate: '08-10', excluded: true });
  });

  it('handles single-object aixm:timeInterval (not wrapped in an array)', () => {
    const groups = parseAvailabilityList(baseline['aixm:availability']);
    expect(groups).toHaveLength(1);
    expect(groups[0].timesheets).toHaveLength(1);
  });

  it('extracts the remark note from the usage annotation and strips txtRmk:', () => {
    const [g] = parseAvailabilityList(baseline['aixm:availability']);
    expect(g.note).toMatch(/^PPR\./);
    expect(g.note).not.toMatch(/txtRmk/);
  });
});

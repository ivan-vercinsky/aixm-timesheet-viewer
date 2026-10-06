// Mapping of AIXM 5.1(.1) JSON (XML-derived, "aixm:"-prefixed keys) into the
// simplified timesheet model used by the viewer.
//
// Input shape (see src/data/examples/06-*.json): an "aixm:availability" list
// whose entries wrap one *Availability / *Activation object carrying
// aixm:timeInterval (one or many aixm:Timesheet), an operational status and
// optional usage / annotation structures.

export function asArray(x) {
  return x == null ? [] : Array.isArray(x) ? x : [x];
}

function prop(obj, name) {
  return obj?.[`aixm:${name}`] ?? obj?.[name];
}

/** One aixm:Timesheet (or its {aixm:Timesheet: {...}} wrapper) → simplified timesheet. */
export function parseAixmTimesheet(wrapper) {
  const ts = prop(wrapper, 'Timesheet') ?? wrapper;
  return {
    timeReference: prop(ts, 'timeReference') ?? 'UTC',
    startDate: prop(ts, 'startDate') ?? null,
    endDate: prop(ts, 'endDate') ?? null,
    day: prop(ts, 'day') ?? 'ANY',
    dayTil: prop(ts, 'dayTil') ?? null,
    startTime: prop(ts, 'startTime') ?? '00:00',
    // "00:00" as end of a 00:00-start sheet means the full day (handled by the
    // midnight-crossing rule in expandTimesheets)
    endTime: prop(ts, 'endTime') ?? '24:00',
    daylightSavingAdjust: prop(ts, 'daylightSavingAdjust') ?? 'NO',
    excluded: prop(ts, 'excluded') === 'YES',
  };
}

function noteOf(obj) {
  for (const ann of asArray(prop(obj, 'annotation'))) {
    const note = prop(ann, 'Note');
    const ling = prop(prop(note, 'translatedNote'), 'LinguisticNote');
    const txt = prop(ling, 'note');
    if (txt) return txt.replace(/^txtRmk:\s*/, '').trim();
  }
  return null;
}

/**
 * Parse an "aixm:availability" property value into schedule groups:
 *   [{ gmlId, status, note, timesheets: [simplified timesheet] }]
 * Works for AirportHeliportAvailability and, by key suffix, for other
 * *Availability / *Activation members (e.g. AirspaceActivation).
 */
export function parseAvailabilityList(availList) {
  return asArray(availList).map((entry) => {
    const key = Object.keys(entry).find((k) => /(Availability|Activation)$/.test(k));
    const av = key ? entry[key] : entry;
    const usages = asArray(prop(av, 'usage')).map((u) => prop(u, 'AirportHeliportUsage') ?? u);
    return {
      gmlId: av['-gml:id'] ?? null,
      status: prop(av, 'operationalStatus') ?? prop(av, 'status') ?? null,
      note: noteOf(av) ?? usages.map(noteOf).find(Boolean) ?? null,
      timesheets: asArray(prop(av, 'timeInterval')).map(parseAixmTimesheet),
    };
  });
}

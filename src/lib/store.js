// Scenario management on top of localStorage.
//
// The bundled example scenarios are bootstrapped into localStorage on first
// load; from then on the stored list is the source of truth, so scenarios can
// be added, duplicated, deleted and have their BASELINE/TEMPDELTA TimeSlices
// overwritten. List mutations are pure functions (list in, list out) so they
// can be tested without a browser.

import { examples } from '../data/examples/index.js';

export const STORAGE_KEY = 'timesheet.scenarios.v1';

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function defaultScenarios() {
  return structuredClone(examples);
}

/**
 * Load the scenario list from storage; bootstrap the bundled defaults when
 * nothing (valid) is stored yet. An empty stored list is respected — the user
 * deleted everything and can use "Restore defaults".
 */
export function loadScenarios(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw != null) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.every((s) => s && typeof s.id === 'string' && s.feature)) {
        return list;
      }
    }
  } catch {
    // unreadable storage → bootstrap below
  }
  const defaults = defaultScenarios();
  persistScenarios(defaults, storage);
  return defaults;
}

export function persistScenarios(list, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private mode, quota) — keep working in memory
  }
}

/** Template for a newly added scenario (simplified shape, closure over a copy). */
export function createScenario() {
  return {
    id: uuid(),
    title: 'New scenario',
    note: 'Edit the BASELINE / TEMPDELTA TimeSlices in the editor above the calendar.',
    event: {
      scenario: 'CUSTOM',
      validTime: { begin: '2026-10-12T00:00:00Z', end: '2026-10-16T18:00:00Z' },
    },
    feature: {
      featureType: 'Custom',
      designator: 'NEW',
      name: 'NEW SCENARIO',
      type: '—',
      upperLimit: '—',
      lowerLimit: '—',
      timeSlices: [
        {
          interpretation: 'BASELINE',
          validTime: { begin: '2026-01-01T00:00:00Z', end: null },
          availability: {
            status: 'NORMAL',
            timeInterval: [
              { timeReference: 'UTC', day: 'ANY', startTime: '06:00', endTime: '18:00' },
            ],
          },
        },
        {
          interpretation: 'TEMPDELTA',
          validTime: { begin: '2026-10-12T00:00:00Z', end: '2026-10-16T18:00:00Z' },
          availability: [
            {
              status: 'NORMAL',
              note: 'Copied from BASELINE (AIXM temporality)',
              timeInterval: [
                {
                  timeReference: 'UTC',
                  startDate: '12-10',
                  endDate: '16-10',
                  day: 'ANY',
                  startTime: '06:00',
                  endTime: '18:00',
                },
              ],
            },
            {
              status: 'CLOSED',
              timeInterval: [
                {
                  timeReference: 'UTC',
                  startDate: '12-10',
                  endDate: '16-10',
                  day: 'ANY',
                  startTime: '08:00',
                  endTime: '12:00',
                  annotation: 'Closure (edit me)',
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

/** Insert a deep copy right after the original. Returns { list, id } of the copy. */
export function duplicateScenario(list, id) {
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return { list, id: null };
  const copy = structuredClone(list[i]);
  copy.id = uuid();
  copy.title = `Copy of ${list[i].title}`;
  return { list: [...list.slice(0, i + 1), copy, ...list.slice(i + 1)], id: copy.id };
}

export function removeScenario(list, id) {
  return list.filter((s) => s.id !== id);
}

export function updateScenario(list, id, patch) {
  return list.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Re-add/overwrite the bundled defaults, keeping user-created scenarios. */
export function restoreDefaults(list) {
  const defaults = defaultScenarios();
  const defaultIds = new Set(defaults.map((d) => d.id));
  return [...defaults, ...list.filter((s) => !defaultIds.has(s.id))];
}

/**
 * Parse one TimeSlice from user JSON. Also accepts a whole example file,
 * a feature or a timeSlices array and picks the slice by `interpretation`.
 * Returns { slice, error } — a non-null slice with an error is a soft warning.
 */
export function parseSliceText(text, interpretation) {
  if (!text.trim()) return { slice: null, error: null };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    return { slice: null, error: `Invalid JSON: ${err.message}` };
  }
  const slices = obj?.feature?.timeSlices ?? obj?.timeSlices ?? (Array.isArray(obj) ? obj : null);
  const slice = slices
    ? (slices.find((s) => s?.interpretation === interpretation) ?? null)
    : obj;
  if (slices && !slice) {
    return { slice: null, error: `No TimeSlice with interpretation "${interpretation}" found` };
  }
  if (typeof slice !== 'object' || slice === null) {
    return { slice: null, error: 'Expected a JSON object holding one TimeSlice' };
  }
  if (!slice.activation && !slice.availability && !slice['aixm:availability']) {
    return {
      slice,
      error:
        'No "activation", "availability" or "aixm:availability" property found — nothing to display',
    };
  }
  if (interpretation === 'TEMPDELTA' && !slice.validTime?.begin) {
    return {
      slice,
      error: 'Warning: no validTime.begin — the TEMPDELTA will not be clipped to a validity window',
    };
  }
  return { slice, error: null };
}

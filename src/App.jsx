import { useMemo, useState } from 'react';
import { examples } from './data/examples/index.js';
import adAhpHospital from './data/examples/06-ad-ahp-hospital.json';
import CalendarWeek from './components/CalendarWeek.jsx';
import TimesheetPanel from './components/TimesheetPanel.jsx';
import { addDays, fmtDate, fmtDateTime, weekStartOf } from './lib/timesheet.js';
import {
  SOURCE,
  deriveProvenance,
  entriesForSlice,
  normalizeSlice,
  resolveResult,
  splitEntries,
} from './lib/schedule.js';
import { splitGroups } from './lib/split.js';
import './App.css';

const findSlice = (slices, interpretation) =>
  slices?.find((s) => s?.interpretation === interpretation) ?? null;

/**
 * Parse one TimeSlice from user JSON. Also accepts a whole example file,
 * a feature or a timeSlices array and picks the slice by `interpretation`.
 * Returns { slice, error } — a non-null slice with an error is a soft warning.
 */
function parseSliceText(text, interpretation) {
  if (!text.trim()) return { slice: null, error: null };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    return { slice: null, error: `Invalid JSON: ${err.message}` };
  }
  const slices = obj?.feature?.timeSlices ?? obj?.timeSlices ?? (Array.isArray(obj) ? obj : null);
  const slice = slices ? findSlice(slices, interpretation) : obj;
  if (slices && !slice) {
    return { slice: null, error: `No TimeSlice with interpretation "${interpretation}" found` };
  }
  if (typeof slice !== 'object' || slice === null) {
    return { slice: null, error: 'Expected a JSON object holding one TimeSlice' };
  }
  if (!slice.activation && !slice.availability && !slice['aixm:availability']) {
    return {
      slice,
      error: 'No "activation", "availability" or "aixm:availability" property found — nothing to display',
    };
  }
  if (interpretation === 'TEMPDELTA' && !slice.validTime?.begin) {
    return { slice, error: 'Warning: no validTime.begin — the TEMPDELTA will not be clipped to a validity window' };
  }
  return { slice, error: null };
}

const CUSTOM_PREFILL = {
  baseline: JSON.stringify(findSlice(adAhpHospital.feature.timeSlices, 'BASELINE'), null, 2),
  delta: JSON.stringify(findSlice(adAhpHospital.feature.timeSlices, 'TEMPDELTA'), null, 2),
};

const CUSTOM_FEATURE = {
  featureType: 'Custom',
  designator: 'CUSTOM',
  name: 'USER-PROVIDED TIMESLICES',
  type: '—',
  upperLimit: '—',
  lowerLimit: '—',
};

export default function App() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const data = examples[exampleIdx];
  const isCustom = !!data.custom;

  const [weekStart, setWeekStart] = useState(() =>
    weekStartOf(new Date(data.event.validTime.begin))
  );
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [showResult, setShowResult] = useState(true);
  const [splitOverlaps, setSplitOverlaps] = useState(false);

  // Custom scenario inputs
  const [baselineText, setBaselineText] = useState(CUSTOM_PREFILL.baseline);
  const [deltaText, setDeltaText] = useState(CUSTOM_PREFILL.delta);
  const [customSupersedes, setCustomSupersedes] = useState(true);

  const parsedBaseline = useMemo(
    () => (isCustom ? parseSliceText(baselineText, 'BASELINE') : null),
    [isCustom, baselineText]
  );
  const parsedDelta = useMemo(
    () => (isCustom ? parseSliceText(deltaText, 'TEMPDELTA') : null),
    [isCustom, deltaText]
  );

  const rawBaseline = isCustom
    ? parsedBaseline.slice
    : findSlice(data.feature.timeSlices, 'BASELINE');
  const rawDelta = isCustom ? parsedDelta.slice : findSlice(data.feature.timeSlices, 'TEMPDELTA');

  const feature = isCustom ? CUSTOM_FEATURE : data.feature;
  const event = isCustom
    ? { scenario: 'CUSTOM', validTime: rawDelta?.validTime ?? {} }
    : data.event;
  const supersedes = isCustom ? customSupersedes : data.supersedesBaseline !== false;

  const selectExample = (i) => {
    setExampleIdx(i);
    const ex = examples[i];
    if (!ex.custom) setWeekStart(weekStartOf(new Date(ex.event.validTime.begin)));
  };

  // In custom mode, snap the calendar to the pasted TEMPDELTA validity
  // whenever it changes (state adjustment during render, per React docs).
  const customBegin = isCustom ? (rawDelta?.validTime?.begin ?? null) : null;
  const [prevCustomBegin, setPrevCustomBegin] = useState(null);
  if (customBegin !== prevCustomBegin) {
    setPrevCustomBegin(customBegin);
    if (customBegin) setWeekStart(weekStartOf(new Date(customBegin)));
  }

  const weekEnd = addDays(weekStart, 7);

  // Resolution layer: normalize slices, derive TEMPDELTA provenance, expand
  // to ScheduleEntry lists and compose the effective (RESULT) schedule.
  const baseline = useMemo(() => normalizeSlice(rawBaseline), [rawBaseline]);
  const tempdelta = useMemo(
    () => deriveProvenance(baseline, normalizeSlice(rawDelta)),
    [baseline, rawDelta]
  );
  const baselineEntries = useMemo(
    () => entriesForSlice(baseline, SOURCE.BASELINE, weekStart, weekEnd),
    [baseline, weekStart, weekEnd]
  );
  const deltaEntries = useMemo(
    () => entriesForSlice(tempdelta, SOURCE.TEMPDELTA_EVENT, weekStart, weekEnd),
    [tempdelta, weekStart, weekEnd]
  );
  const resultEntries = useMemo(
    () => resolveResult(baselineEntries, deltaEntries, tempdelta?.validTime, supersedes),
    [baselineEntries, deltaEntries, tempdelta, supersedes]
  );

  // Optional alternative view: resolve overlaps between availability groups
  // of the encoded lanes into non-overlapping fragments (later group wins).
  const shownBaseline = useMemo(
    () => (splitOverlaps ? splitEntries(baselineEntries) : baselineEntries),
    [baselineEntries, splitOverlaps]
  );
  const shownDelta = useMemo(
    () => (splitOverlaps ? splitEntries(deltaEntries) : deltaEntries),
    [deltaEntries, splitOverlaps]
  );

  // The same split computed at the Timesheet level (the alternative AIXM
  // encoding), shown in the raw timesheet panels.
  const panelBaseline = useMemo(
    () =>
      splitOverlaps && baseline ? { ...baseline, groups: splitGroups(baseline.groups) } : baseline,
    [baseline, splitOverlaps]
  );
  const panelDelta = useMemo(
    () =>
      splitOverlaps && tempdelta
        ? { ...tempdelta, groups: splitGroups(tempdelta.groups) }
        : tempdelta,
    [tempdelta, splitOverlaps]
  );

  const lanes = [
    { key: 'baseline', title: 'BASELINE schedule', entries: shownBaseline, visible: showBaseline && !!baseline },
    { key: 'delta', title: 'TEMPDELTA (NOTAM)', entries: shownDelta, visible: showDelta && !!tempdelta },
    { key: 'result', title: 'RESULT (effective)', entries: resultEntries, visible: showResult },
  ];

  return (
    <div className="app">
      <div className="example-bar">
        <label htmlFor="example-select">Scenario</label>
        <select
          id="example-select"
          value={exampleIdx}
          onChange={(e) => selectExample(Number(e.target.value))}
        >
          {examples.map((ex, i) => (
            <option key={ex.id} value={i}>
              {ex.title}
            </option>
          ))}
        </select>
      </div>

      {isCustom && (
        <section className="editor-grid">
          <div className="editor-field">
            <label htmlFor="baseline-json">BASELINE TimeSlice · JSON (optional)</label>
            <textarea
              id="baseline-json"
              spellCheck={false}
              value={baselineText}
              onChange={(e) => setBaselineText(e.target.value)}
            />
            {parsedBaseline.error && <div className="editor-error">{parsedBaseline.error}</div>}
          </div>
          <div className="editor-field">
            <label htmlFor="delta-json">TEMPDELTA TimeSlice · JSON</label>
            <textarea
              id="delta-json"
              spellCheck={false}
              value={deltaText}
              onChange={(e) => setDeltaText(e.target.value)}
            />
            {parsedDelta.error && <div className="editor-error">{parsedDelta.error}</div>}
          </div>
          <label className="editor-supersedes" title="AIXM temporality: during its validity the TEMPDELTA replaces the whole availability property. Untick to read the TEMPDELTA as an overlay where the BASELINE survives outside the overlapped periods (for encodings without baseline copies).">
            <input
              type="checkbox"
              checked={customSupersedes}
              onChange={(e) => setCustomSupersedes(e.target.checked)}
            />
            TEMPDELTA supersedes BASELINE during its validity (AIXM temporality)
          </label>
        </section>
      )}

      <header className="app-head">
        <div>
          <h1>
            {feature.designator} — {feature.name}
          </h1>
          <p className="app-sub">
            {feature.featureType} type {feature.type} · {feature.lowerLimit}–{feature.upperLimit} ·
            scenario {event.scenario}
          </p>
        </div>
        <div className="notam-card">
          {event.notam ? (
            <>
              <div className="notam-id">
                NOTAM {event.notam.series}{event.notam.number}/{event.notam.year.slice(2)}
              </div>
              <div className="notam-text">{event.notam.text}</div>
            </>
          ) : (
            <div className="notam-id">TEMPDELTA validity</div>
          )}
          <div className="notam-validity">
            {event.validTime?.begin ? (
              <>
                {fmtDateTime(new Date(event.validTime.begin))} →{' '}
                {fmtDateTime(event.validTime.end ? new Date(event.validTime.end) : null)}
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="weeknav">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ prev</button>
          <span className="weeknav-label">
            Week {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))} (UTC)
          </span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}>next ›</button>
          <button
            disabled={!event.validTime?.begin}
            onClick={() => setWeekStart(weekStartOf(new Date(event.validTime.begin)))}
          >
            NOTAM week
          </button>
        </div>
        <div className="legend">
          {baseline && (
            <label className="legend-item">
              <input
                type="checkbox"
                checked={showBaseline}
                onChange={(e) => setShowBaseline(e.target.checked)}
              />
              <span className="swatch swatch-baseline" /> BASELINE
            </label>
          )}
          <label className="legend-item">
            <input
              type="checkbox"
              checked={showDelta}
              onChange={(e) => setShowDelta(e.target.checked)}
            />
            <span className="swatch swatch-delta" /> TEMPDELTA
          </label>
          <label className="legend-item">
            <input
              type="checkbox"
              checked={showResult}
              onChange={(e) => setShowResult(e.target.checked)}
            />
            <span className="swatch swatch-result" /> RESULT (effective)
          </label>
          <label
            className="legend-item"
            title="Show the encoded lanes in the alternative non-overlapping form: overlapping availability groups are split into fragments, the later (exception) group prevailing"
          >
            <input
              type="checkbox"
              checked={splitOverlaps}
              onChange={(e) => setSplitOverlaps(e.target.checked)}
            />
            split overlapping groups
          </label>
          <span className="legend-item">
            <span className="swatch swatch-copied" /> copied from BASELINE
          </span>
          <span className="legend-item">
            <span className="swatch swatch-inactive" /> explicitly INACTIVE / CLOSED
          </span>
          <span className="legend-item">
            <span className="swatch swatch-validity" /> NOTAM validity
          </span>
        </div>
      </div>

      <CalendarWeek
        weekStart={weekStart}
        lanes={lanes}
        validity={tempdelta?.validTime}
        supersedes={supersedes}
      />

      {data.note && <p className="hint">{data.note}</p>}

      <div className="panels">
        {panelBaseline && (
          <TimesheetPanel title="BASELINE · timesheets" kind="baseline" slice={panelBaseline} />
        )}
        {panelDelta && (
          <TimesheetPanel title="TEMPDELTA · timesheets" kind="delta" slice={panelDelta} />
        )}
      </div>
    </div>
  );
}

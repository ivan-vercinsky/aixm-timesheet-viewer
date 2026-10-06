import { useMemo, useState } from 'react';
import { examples } from './data/examples/index.js';
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

export default function App() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const data = examples[exampleIdx];
  const { event, feature } = data;
  const supersedes = data.supersedesBaseline !== false;

  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date(event.validTime.begin)));
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [showResult, setShowResult] = useState(true);
  const [splitOverlaps, setSplitOverlaps] = useState(false);

  const selectExample = (i) => {
    setExampleIdx(i);
    setWeekStart(weekStartOf(new Date(examples[i].event.validTime.begin)));
  };

  const weekEnd = addDays(weekStart, 7);

  // Resolution layer: normalize slices, derive TEMPDELTA provenance, expand
  // to ScheduleEntry lists and compose the effective (RESULT) schedule.
  const baseline = useMemo(
    () => normalizeSlice(feature.timeSlices.find((s) => s.interpretation === 'BASELINE')),
    [feature]
  );
  const tempdelta = useMemo(
    () =>
      deriveProvenance(
        baseline,
        normalizeSlice(feature.timeSlices.find((s) => s.interpretation === 'TEMPDELTA'))
      ),
    [feature, baseline]
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
          <div className="notam-id">
            NOTAM {event.notam.series}{event.notam.number}/{event.notam.year.slice(2)}
          </div>
          <div className="notam-text">{event.notam.text}</div>
          <div className="notam-validity">
            {fmtDateTime(new Date(event.validTime.begin))} →{' '}
            {fmtDateTime(event.validTime.end ? new Date(event.validTime.end) : null)}
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
          <button onClick={() => setWeekStart(weekStartOf(new Date(event.validTime.begin)))}>
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

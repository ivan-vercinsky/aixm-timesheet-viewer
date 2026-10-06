import { useMemo, useState } from 'react';
import CalendarWeek from './components/CalendarWeek.jsx';
import ScenarioEditor from './components/ScenarioEditor.jsx';
import ScenarioList from './components/ScenarioList.jsx';
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
import {
  createScenario,
  duplicateScenario,
  loadScenarios,
  parseImportedScenario,
  persistScenarios,
  removeScenario,
  restoreDefaults,
  serializeScenario,
  updateScenario,
} from './lib/store.js';
import './App.css';

const SIDEBAR_KEY = 'timesheet.sidebar.collapsed';

const findSlice = (slices, interpretation) =>
  slices?.find((s) => s?.interpretation === interpretation) ?? null;

export default function App() {
  const [scenarios, setScenariosRaw] = useState(loadScenarios);
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setScenarios = (next) => {
    setScenariosRaw(next);
    persistScenarios(next);
  };
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '0' : '1');
    } catch {
      // per-viewer convenience only
    }
  };

  const scenario = scenarios.find((s) => s.id === selectedId) ?? scenarios[0] ?? null;
  const rawBaseline = scenario ? findSlice(scenario.feature.timeSlices, 'BASELINE') : null;
  const rawDelta = scenario ? findSlice(scenario.feature.timeSlices, 'TEMPDELTA') : null;
  const supersedes = scenario?.supersedesBaseline !== false;
  const event = scenario?.event;
  const validityBegin = rawDelta?.validTime?.begin ?? event?.validTime?.begin ?? null;

  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [showResult, setShowResult] = useState(true);
  const [splitOverlaps, setSplitOverlaps] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  // Snap the calendar to the scenario's validity when the selection or the
  // edited validity changes (state adjustment during render, per React docs).
  const snapKey = `${scenario?.id ?? ''}|${validityBegin ?? ''}`;
  const [prevSnapKey, setPrevSnapKey] = useState('');
  if (snapKey !== prevSnapKey) {
    setPrevSnapKey(snapKey);
    if (validityBegin) setWeekStart(weekStartOf(new Date(validityBegin)));
  }

  // Scenario management
  const selectScenario = (id) => setSelectedId(id);
  const addScenario = () => {
    const s = createScenario();
    setScenarios([...scenarios, s]);
    setSelectedId(s.id);
  };
  const duplicate = (id) => {
    const { list, id: copyId } = duplicateScenario(scenarios, id);
    setScenarios(list);
    if (copyId) setSelectedId(copyId);
  };
  const remove = (id) => {
    const title = scenarios.find((s) => s.id === id)?.title ?? id;
    if (!window.confirm(`Delete scenario "${title}"?`)) return;
    const next = removeScenario(scenarios, id);
    setScenarios(next);
    if (scenario?.id === id) setSelectedId(next[0]?.id ?? null);
  };
  const restore = () => setScenarios(restoreDefaults(scenarios));
  const exportScenario = (id) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
    const url = URL.createObjectURL(
      new Blob([serializeScenario(s)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importScenario = async (file) => {
    const { scenario: imported, error } = parseImportedScenario(
      await file.text(),
      file.name.replace(/\.json$/i, '')
    );
    if (error) {
      window.alert(`Import failed: ${error}`);
      return;
    }
    setScenarios([...scenarios, imported]);
    setSelectedId(imported.id);
  };
  const updateSelected = (patch) => setScenarios(updateScenario(scenarios, scenario.id, patch));
  const saveEdits = ({ title, baselineSlice, deltaSlice }) => {
    const timeSlices = [
      baselineSlice && { ...baselineSlice, interpretation: 'BASELINE' },
      deltaSlice && { ...deltaSlice, interpretation: 'TEMPDELTA' },
    ].filter(Boolean);
    updateSelected({ title, feature: { ...scenario.feature, timeSlices } });
    setEditorOpen(false);
  };

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

  const validity = tempdelta?.validTime ?? event?.validTime;

  return (
    <div className="layout">
      <ScenarioList
        scenarios={scenarios}
        selectedId={scenario?.id ?? null}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onSelect={selectScenario}
        onAdd={addScenario}
        onDuplicate={duplicate}
        onDelete={remove}
        onExport={exportScenario}
        onImport={importScenario}
        onRestoreDefaults={restore}
      />

      <div className="detail">
        {!scenario ? (
          <p className="hint">No scenarios — add one or restore the defaults from the list.</p>
        ) : (
          <>
            <header className="app-head">
              <div>
                <h1>
                  {scenario.feature.designator} — {scenario.feature.name}
                </h1>
                <p className="app-sub">
                  {scenario.feature.featureType} type {scenario.feature.type} ·{' '}
                  {scenario.feature.lowerLimit}–{scenario.feature.upperLimit} · scenario{' '}
                  {event?.scenario ?? 'CUSTOM'} · v{__APP_VERSION__}
                </p>
              </div>
              <div className="notam-card">
                {event?.notam ? (
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
                  {validityBegin ? (
                    <>
                      {fmtDateTime(new Date(validityBegin))} →{' '}
                      {fmtDateTime(validity?.end ? new Date(validity.end) : null)}
                    </>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            </header>

            {editorOpen ? (
              <ScenarioEditor
                key={scenario.id}
                scenario={scenario}
                onSave={saveEdits}
                onCancel={() => setEditorOpen(false)}
              />
            ) : (
              <div className="edit-bar">
                <button className="btn-primary" onClick={() => setEditorOpen(true)}>
                  Edit
                </button>
              </div>
            )}

            <div className="toolbar">
              <div className="weeknav">
                <button onClick={() => setWeekStart(addDays(weekStart, -7))}>‹ prev</button>
                <span className="weeknav-label">
                  Week {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))} (UTC)
                </span>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))}>next ›</button>
                <button
                  disabled={!validityBegin}
                  onClick={() => setWeekStart(weekStartOf(new Date(validityBegin)))}
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

            {scenario.note && <p className="hint">{scenario.note}</p>}

            <div className="panels">
              {panelBaseline && (
                <TimesheetPanel
                  title="BASELINE · timesheets"
                  kind="baseline"
                  slice={panelBaseline}
                />
              )}
              {panelDelta && (
                <TimesheetPanel title="TEMPDELTA · timesheets" kind="delta" slice={panelDelta} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import ScenarioEditor from './components/ScenarioEditor.jsx';
import ScenarioList from './components/ScenarioList.jsx';
import { Timesheet, fmtDateTime } from './timesheet/index.js';
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
  const [editorOpen, setEditorOpen] = useState(false);
  // Live preview while the editor is open: the last valid parse of each
  // edited TimeSlice field. Only Save writes to the scenario store; Cancel
  // (or switching scenarios) simply drops the draft.
  const [draft, setDraft] = useState(null);
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

  // Drop any draft when the selection changes (state adjustment during
  // render, per React docs) — the editor remounts via key={scenario.id}.
  const [prevScenarioId, setPrevScenarioId] = useState(null);
  if ((scenario?.id ?? null) !== prevScenarioId) {
    setPrevScenarioId(scenario?.id ?? null);
    setDraft(null);
  }

  const savedBaseline = scenario ? findSlice(scenario.feature.timeSlices, 'BASELINE') : null;
  const savedDelta = scenario ? findSlice(scenario.feature.timeSlices, 'TEMPDELTA') : null;

  // What the Timesheet shows: the draft (instant preview) while editing,
  // the saved scenario otherwise.
  const previewing = editorOpen && draft != null;
  const rawBaseline =
    previewing && 'baselineSlice' in draft ? draft.baselineSlice : savedBaseline;
  const rawDelta = previewing && 'deltaSlice' in draft ? draft.deltaSlice : savedDelta;

  const supersedes = scenario?.supersedesBaseline !== false;
  const event = scenario?.event;
  const validityBegin = rawDelta?.validTime?.begin ?? event?.validTime?.begin ?? null;
  const validity = rawDelta?.validTime ?? event?.validTime;

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
  const closeEditor = () => {
    setEditorOpen(false);
    setDraft(null);
  };
  const saveEdits = ({ title, baselineSlice, deltaSlice }) => {
    const timeSlices = [
      baselineSlice && { ...baselineSlice, interpretation: 'BASELINE' },
      deltaSlice && { ...deltaSlice, interpretation: 'TEMPDELTA' },
    ].filter(Boolean);
    setScenarios(
      updateScenario(scenarios, scenario.id, {
        title,
        feature: { ...scenario.feature, timeSlices },
      })
    );
    closeEditor();
  };

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
                onPreview={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                onSave={saveEdits}
                onCancel={closeEditor}
              />
            ) : (
              <div className="edit-bar">
                <button className="btn-primary" onClick={() => setEditorOpen(true)}>
                  Edit
                </button>
              </div>
            )}

            <Timesheet
              baselineSlice={rawBaseline}
              deltaSlice={rawDelta}
              supersedes={supersedes}
              defaultValidity={event?.validTime}
              snapKey={scenario.id}
            >
              {scenario.note && <p className="hint">{scenario.note}</p>}
            </Timesheet>
          </>
        )}
      </div>
    </div>
  );
}

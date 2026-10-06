import { useMemo, useState } from 'react';
import { parseSliceText } from '../lib/store.js';

const findSlice = (scenario, interpretation) =>
  scenario.feature.timeSlices?.find((s) => s?.interpretation === interpretation) ?? null;

const sliceText = (scenario, interpretation) => {
  const slice = findSlice(scenario, interpretation);
  return slice ? JSON.stringify(slice, null, 2) : '';
};

/**
 * Per-scenario editor: title and BASELINE/TEMPDELTA TimeSlice JSON.
 * Changes are local until Save writes them to the scenario store;
 * Cancel discards them. Mount with key={scenario.id} so the inputs
 * reset when another scenario is selected.
 */
export default function ScenarioEditor({ scenario, onSave, onCancel }) {
  const [title, setTitle] = useState(scenario.title);
  const [baselineText, setBaselineText] = useState(() => sliceText(scenario, 'BASELINE'));
  const [deltaText, setDeltaText] = useState(() => sliceText(scenario, 'TEMPDELTA'));

  const parsedBaseline = useMemo(() => parseSliceText(baselineText, 'BASELINE'), [baselineText]);
  const parsedDelta = useMemo(() => parseSliceText(deltaText, 'TEMPDELTA'), [deltaText]);

  const valid =
    (parsedBaseline.slice || !baselineText.trim()) && (parsedDelta.slice || !deltaText.trim());

  const save = () => {
    if (!valid) return;
    onSave({
      title,
      baselineSlice: parsedBaseline.slice,
      deltaSlice: parsedDelta.slice,
    });
  };

  return (
    <section className="scenario-editor">
      <div className="editor-grid">
        <label className="editor-title">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
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
        <div className="editor-actions">
          <button className="btn-primary" disabled={!valid} onClick={save}>
            Save
          </button>
          <button onClick={onCancel}>Cancel</button>
          {!valid && <span className="editor-status editor-status-dirty">invalid JSON</span>}
        </div>
      </div>
    </section>
  );
}

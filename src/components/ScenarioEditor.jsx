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
 *
 * Every keystroke that parses to a valid TimeSlice (or clears the field) is
 * reported through onPreview, so the host can feed the draft straight into
 * the Timesheet control — the calendar updates instantly while typing.
 * While a field is invalid, the last valid value stays on screen.
 * The scenario store is only written on Save; Cancel discards the draft.
 * Mount with key={scenario.id} so the inputs reset when another scenario
 * is selected.
 */
export default function ScenarioEditor({ scenario, onPreview, onSave, onCancel }) {
  const [title, setTitle] = useState(scenario.title);
  const [baselineText, setBaselineText] = useState(() => sliceText(scenario, 'BASELINE'));
  const [deltaText, setDeltaText] = useState(() => sliceText(scenario, 'TEMPDELTA'));

  const parsedBaseline = useMemo(() => parseSliceText(baselineText, 'BASELINE'), [baselineText]);
  const parsedDelta = useMemo(() => parseSliceText(deltaText, 'TEMPDELTA'), [deltaText]);

  const valid =
    (parsedBaseline.slice || !baselineText.trim()) && (parsedDelta.slice || !deltaText.trim());

  const editSlice = (text, interpretation, setText, patchKey) => {
    setText(text);
    const { slice } = parseSliceText(text, interpretation);
    if (slice) {
      onPreview?.({ [patchKey]: { ...slice, interpretation } });
    } else if (!text.trim()) {
      onPreview?.({ [patchKey]: null });
    }
    // invalid JSON mid-edit: keep previewing the last valid value
  };

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
            onChange={(e) =>
              editSlice(e.target.value, 'BASELINE', setBaselineText, 'baselineSlice')
            }
          />
          {parsedBaseline.error && <div className="editor-error">{parsedBaseline.error}</div>}
        </div>
        <div className="editor-field">
          <label htmlFor="delta-json">TEMPDELTA TimeSlice · JSON</label>
          <textarea
            id="delta-json"
            spellCheck={false}
            value={deltaText}
            onChange={(e) => editSlice(e.target.value, 'TEMPDELTA', setDeltaText, 'deltaSlice')}
          />
          {parsedDelta.error && <div className="editor-error">{parsedDelta.error}</div>}
        </div>
        <div className="editor-actions">
          <button className="btn-primary" disabled={!valid} onClick={save}>
            Save
          </button>
          <button onClick={onCancel}>Cancel</button>
          <span className={`editor-status${valid ? '' : ' editor-status-dirty'}`}>
            {valid ? 'live preview — Save to keep, Cancel to discard' : 'invalid JSON'}
          </span>
        </div>
      </div>
    </section>
  );
}

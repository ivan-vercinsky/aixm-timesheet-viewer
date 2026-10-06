import { useMemo, useState } from 'react';
import { parseSliceText } from '../lib/store.js';

const findSlice = (scenario, interpretation) =>
  scenario.feature.timeSlices?.find((s) => s?.interpretation === interpretation) ?? null;

const sliceText = (scenario, interpretation) => {
  const slice = findSlice(scenario, interpretation);
  return slice ? JSON.stringify(slice, null, 2) : '';
};

/**
 * Per-scenario editor: title, BASELINE/TEMPDELTA TimeSlice JSON and the
 * supersedes flag. Valid edits are pushed up immediately (the parent persists
 * them to localStorage); invalid JSON shows an inline error and is not saved.
 * Mount with key={scenario.id} so the texts reset on selection change.
 */
export default function ScenarioEditor({
  scenario,
  open,
  onOpenChange,
  onRename,
  onSupersedesChange,
  onSlicesChange,
}) {
  const [title, setTitle] = useState(scenario.title);
  const [baselineText, setBaselineText] = useState(() => sliceText(scenario, 'BASELINE'));
  const [deltaText, setDeltaText] = useState(() => sliceText(scenario, 'TEMPDELTA'));

  const parsedBaseline = useMemo(() => parseSliceText(baselineText, 'BASELINE'), [baselineText]);
  const parsedDelta = useMemo(() => parseSliceText(deltaText, 'TEMPDELTA'), [deltaText]);

  const pushSlices = (bText, dText) => {
    const b = parseSliceText(bText, 'BASELINE');
    const d = parseSliceText(dText, 'TEMPDELTA');
    const bOk = b.slice || !bText.trim();
    const dOk = d.slice || !dText.trim();
    if (bOk && dOk) onSlicesChange(b.slice, d.slice);
  };

  const saved =
    (parsedBaseline.slice || !baselineText.trim()) && (parsedDelta.slice || !deltaText.trim());

  return (
    <details
      className="scenario-editor"
      open={open}
      onToggle={(e) => onOpenChange(e.target.open)}
    >
      <summary>
        Edit scenario — BASELINE / TEMPDELTA TimeSlices (JSON)
        <span className={`editor-status ${saved ? '' : 'editor-status-dirty'}`}>
          {saved ? 'saved to this browser' : 'invalid JSON — not saved'}
        </span>
      </summary>
      <div className="editor-grid">
        <label className="editor-title">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              onRename(e.target.value);
            }}
          />
        </label>
        <div className="editor-field">
          <label htmlFor="baseline-json">BASELINE TimeSlice · JSON (optional)</label>
          <textarea
            id="baseline-json"
            spellCheck={false}
            value={baselineText}
            onChange={(e) => {
              setBaselineText(e.target.value);
              pushSlices(e.target.value, deltaText);
            }}
          />
          {parsedBaseline.error && <div className="editor-error">{parsedBaseline.error}</div>}
        </div>
        <div className="editor-field">
          <label htmlFor="delta-json">TEMPDELTA TimeSlice · JSON</label>
          <textarea
            id="delta-json"
            spellCheck={false}
            value={deltaText}
            onChange={(e) => {
              setDeltaText(e.target.value);
              pushSlices(baselineText, e.target.value);
            }}
          />
          {parsedDelta.error && <div className="editor-error">{parsedDelta.error}</div>}
        </div>
        <label
          className="editor-supersedes"
          title="AIXM temporality: during its validity the TEMPDELTA replaces the whole availability property. Untick to read the TEMPDELTA as an overlay where the BASELINE survives outside the overlapped periods (for encodings without baseline copies)."
        >
          <input
            type="checkbox"
            checked={scenario.supersedesBaseline !== false}
            onChange={(e) => onSupersedesChange(e.target.checked)}
          />
          TEMPDELTA supersedes BASELINE during its validity (AIXM temporality)
        </label>
      </div>
    </details>
  );
}

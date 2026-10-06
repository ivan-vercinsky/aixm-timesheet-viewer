import { useRef } from 'react';

/**
 * Collapsible scenario list (left pane): select, add, duplicate, delete,
 * export one scenario as a JSON file, import such a file.
 */
export default function ScenarioList({
  scenarios,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
  onRestoreDefaults,
}) {
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = ''; // allow re-importing the same file
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-head">
        {!collapsed && <span className="sidebar-title">Scenarios</span>}
        <button
          className="icon-btn"
          title={collapsed ? 'Expand scenario list' : 'Collapse scenario list'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed && (
        <>
          <ul className="scenario-list">
            {scenarios.map((s) => (
              <li key={s.id} className={s.id === selectedId ? 'selected' : ''}>
                <button className="scenario-select" title={s.title} onClick={() => onSelect(s.id)}>
                  {s.title}
                </button>
                <span className="scenario-actions">
                  <button
                    className="icon-btn"
                    title="Export scenario as JSON file"
                    onClick={() => onExport(s.id)}
                  >
                    ⤓
                  </button>
                  <button className="icon-btn" title="Duplicate scenario" onClick={() => onDuplicate(s.id)}>
                    ⧉
                  </button>
                  <button className="icon-btn" title="Delete scenario" onClick={() => onDelete(s.id)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
            {scenarios.length === 0 && <li className="scenario-empty">No scenarios</li>}
          </ul>
          <div className="sidebar-foot">
            <button onClick={onAdd}>＋ Add scenario</button>
            <button onClick={() => fileRef.current?.click()} title="Import a scenario exported as JSON">
              Import…
            </button>
            <button
              onClick={onRestoreDefaults}
              title="Re-add the bundled default scenarios (overwrites edited defaults, keeps your own)"
            >
              Restore defaults
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </div>
        </>
      )}
    </aside>
  );
}

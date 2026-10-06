/** Collapsible scenario list (left pane): select, add, duplicate, delete. */
export default function ScenarioList({
  scenarios,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onRestoreDefaults,
}) {
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
            <button
              onClick={onRestoreDefaults}
              title="Re-add the bundled default scenarios (overwrites edited defaults, keeps your own)"
            >
              Restore defaults
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

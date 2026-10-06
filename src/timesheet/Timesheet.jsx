import { useMemo, useState } from 'react';
import CalendarWeek from './CalendarWeek.jsx';
import TimesheetPanel from './TimesheetPanel.jsx';
import { addDays, fmtDate, weekStartOf } from './lib/timesheet.js';
import {
  SOURCE,
  deriveProvenance,
  entriesForSlice,
  normalizeSlice,
  resolveResult,
  splitEntries,
} from './lib/schedule.js';
import { splitGroups } from './lib/split.js';
import './timesheet.css';

/**
 * Timesheet — standalone schedule-visualization control (future EDS
 * component). It is a pure function of its props and carries no application
 * state: feed it raw AIXM-style TimeSlices and it renders the week calendar
 * (BASELINE / TEMPDELTA / RESULT lanes), the legend/toolbar and the raw
 * timesheet tables. Re-rendering with different slices updates the view
 * immediately, which is what makes live editor previews work.
 *
 * Props:
 *   baselineSlice   raw BASELINE TimeSlice (simplified or AIXM-JSON), or null
 *   deltaSlice      raw TEMPDELTA TimeSlice, or null
 *   supersedes      AIXM temporality: TEMPDELTA replaces BASELINE during
 *                   validity (default true); false = overlay reading
 *   defaultValidity fallback {begin, end} when the TEMPDELTA has no validTime
 *   snapKey         external identity (e.g. scenario id); when it or the
 *                   validity begin changes, the calendar snaps to that week
 *   children        rendered between the calendar and the timesheet panels
 */
export default function Timesheet({
  baselineSlice,
  deltaSlice,
  supersedes = true,
  defaultValidity = null,
  snapKey = '',
  children,
}) {
  const validityBegin = deltaSlice?.validTime?.begin ?? defaultValidity?.begin ?? null;

  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [showResult, setShowResult] = useState(true);
  const [splitOverlaps, setSplitOverlaps] = useState(false);

  // Snap the calendar to the validity week when the external identity or the
  // validity begin changes (state adjustment during render, per React docs).
  const key = `${snapKey}|${validityBegin ?? ''}`;
  const [prevKey, setPrevKey] = useState('');
  if (key !== prevKey) {
    setPrevKey(key);
    if (validityBegin) setWeekStart(weekStartOf(new Date(validityBegin)));
  }

  const weekEnd = addDays(weekStart, 7);

  // Resolution layer: normalize slices, derive TEMPDELTA provenance, expand
  // to ScheduleEntry lists and compose the effective (RESULT) schedule.
  const baseline = useMemo(() => normalizeSlice(baselineSlice), [baselineSlice]);
  const tempdelta = useMemo(
    () => deriveProvenance(baseline, normalizeSlice(deltaSlice)),
    [baseline, deltaSlice]
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
    <div className="timesheet">
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

      {children}

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

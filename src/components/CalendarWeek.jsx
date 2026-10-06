import { useState } from 'react';
import { addDays, fmtDate, fmtTime } from '../lib/timesheet.js';
import { SOURCE, SOURCE_LABELS } from '../lib/schedule.js';

const HOUR_PX = 26;
const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function pct(from, dayStart) {
  return ((from - dayStart) / 86400000) * 100;
}

/** Fragment of an interval falling on a given UTC day, as top/height percentages. */
function dayFragment(interval, dayStart) {
  const dayEnd = addDays(dayStart, 1);
  const start = interval.start < dayStart ? dayStart : interval.start;
  const end = interval.end > dayEnd ? dayEnd : interval.end;
  if (end <= start) return null;
  return { top: pct(start, dayStart), height: pct(end, dayStart) - pct(start, dayStart) };
}

function Block({ entry, dayStart, lane, geometry, superseded, onHover, onLeave }) {
  const frag = dayFragment(entry, dayStart);
  if (!frag) return null;
  const cls = [
    'cal-block',
    `cal-block-${lane.key}`,
    entry.source === SOURCE.TEMPDELTA_BASELINE_COPY && lane.key !== 'result'
      ? 'cal-block-copied'
      : '',
    entry.state === 'INACTIVE' ? 'cal-block-inactive' : '',
    superseded ? 'cal-block-superseded' : '',
  ].join(' ');
  const prov =
    lane.key === 'result'
      ? entry.source === SOURCE.TEMPDELTA_EVENT
        ? 'var(--delta)'
        : 'var(--baseline)'
      : null;
  return (
    <div
      className={cls}
      style={{
        top: `${frag.top}%`,
        height: `${frag.height}%`,
        left: `${geometry.left}%`,
        width: `${geometry.width}%`,
        ...(prov ? { '--prov': prov } : {}),
      }}
      onMouseMove={(e) => onHover(e, entry, lane, superseded)}
      onMouseLeave={onLeave}
    >
      {frag.height > 5 && (
        <span className="cal-block-label">
          {fmtTime(entry.start)}–{fmtTime(entry.end)}
        </span>
      )}
    </div>
  );
}

/**
 * Week calendar for normalized ScheduleEntry lists (see lib/schedule.js).
 * `lanes`: [{ key, title, entries, visible }] — rendered side by side per day.
 * The component carries no AIXM/DNOTAM business logic; provenance, state and
 * composition are given in the entries.
 */
export default function CalendarWeek({ weekStart, lanes, validity, supersedes = true }) {
  const [tip, setTip] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const vBegin = validity?.begin ? new Date(validity.begin) : null;
  const vEnd = validity?.end ? new Date(validity.end) : null;
  const visible = lanes.filter((l) => l.visible && l.entries);
  const slot = 96 / Math.max(visible.length, 1);

  const onHover = (e, entry, lane, superseded) => {
    const ts = entry.sourceTimesheet;
    setTip({
      x: e.clientX,
      y: e.clientY,
      lines: [
        `${lane.title} · ${entry.status ?? entry.state}`,
        `${fmtDate(entry.start)}  ${fmtTime(entry.start)}–${fmtTime(entry.end)} UTC` +
          (entry.state === 'INACTIVE' ? ' — explicitly INACTIVE' : ''),
        lane.key === 'result' && entry.inherited
          ? 'Inherited from BASELINE (outside Event scope)'
          : SOURCE_LABELS[entry.source] ?? entry.source,
        ...(ts
          ? [
              `Timesheet: day=${ts.day} ${ts.startTime}–${ts.endTime}` +
                (ts.startDate ? ` (${ts.startDate}…${ts.endDate})` : ''),
            ]
          : []),
        ...(entry.note ? [entry.note] : []),
        ...(entry.splitFragment
          ? ['Split view: fragment remaining after an overlapping later group was carved out']
          : []),
        ...(superseded ? ['Superseded by TEMPDELTA during NOTAM validity'] : []),
      ],
    });
  };
  const onLeave = () => setTip(null);

  return (
    <div className="cal-wrap">
      <div className="cal-grid" style={{ '--hour-px': `${HOUR_PX}px` }}>
        {/* hour axis */}
        <div className="cal-axis">
          <div className="cal-head" />
          <div className="cal-axis-body">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="cal-axis-tick" style={{ top: i * 2 * HOUR_PX }}>
                {String(i * 2).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {days.map((day, di) => {
          const dayEnd = addDays(day, 1);
          const inValidity = vBegin && vBegin < dayEnd && (!vEnd || vEnd > day);
          const vFrag = inValidity && dayFragment({ start: vBegin, end: vEnd ?? dayEnd }, day);
          return (
            <div key={di} className={`cal-day ${inValidity ? 'cal-day-validity' : ''}`}>
              <div className="cal-head">
                <span className="cal-head-dow">{DAY_NAMES[di]}</span>
                <span className="cal-head-date">{fmtDate(day).slice(5)}</span>
                {inValidity && <span className="cal-head-badge">NOTAM</span>}
              </div>
              <div className="cal-day-body" style={{ height: 24 * HOUR_PX }}>
                {Array.from({ length: 11 }, (_, i) => (
                  <div key={i} className="cal-gridline" style={{ top: (i + 1) * 2 * HOUR_PX }} />
                ))}
                {vFrag && (
                  <div
                    className="cal-validity"
                    style={{ top: `${vFrag.top}%`, height: `${vFrag.height}%` }}
                  />
                )}
                {visible.map((lane, li) => {
                  const geometry = { left: 2 + li * slot, width: slot - 4 };
                  return lane.entries.map((entry, ei) => (
                    <Block
                      key={`${lane.key}${ei}`}
                      entry={entry}
                      dayStart={day}
                      lane={lane}
                      geometry={geometry}
                      superseded={
                        lane.key === 'baseline' &&
                        supersedes &&
                        visible.some((l) => l.key === 'delta') &&
                        vBegin &&
                        entry.start < (vEnd ?? dayEnd) &&
                        entry.end > vBegin
                      }
                      onHover={onHover}
                      onLeave={onLeave}
                    />
                  ));
                })}
              </div>
            </div>
          );
        })}
      </div>

      {tip && (
        <div className="cal-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          {tip.lines.map((l, i) => (
            <div key={i} className={i === 0 ? 'cal-tip-title' : undefined}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

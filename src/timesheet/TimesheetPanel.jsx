import { SOURCE, stateOf } from './lib/schedule.js';

export default function TimesheetPanel({ title, kind, slice }) {
  return (
    <section className={`panel panel-${kind}`}>
      <header className="panel-head">
        <span className={`dot dot-${kind}`} />
        <h2>{title}</h2>
        {slice.sequenceNumber != null && (
          <span className="panel-meta">
            SEQ {slice.sequenceNumber}
            {slice.correctionNumber != null && ` / COR ${slice.correctionNumber}`}
          </span>
        )}
      </header>
      {slice.groups.map((g, gi) => (
        <div key={gi} className="ts-group">
          <div className="ts-group-head">
            <span className={`ts-status ts-status-${stateOf(g.status).toLowerCase()}`}>
              {g.status ?? '—'}
            </span>
            {g.split && (
              <span className="ts-split-chip" title="Alternative non-overlapping encoding: timesheets carved by later availability groups">
                split encoding
              </span>
            )}
            {g.note && <span className="ts-group-note">{g.note}</span>}
          </div>
          <table className="ts-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Dates (DD-MM)</th>
                <th>Day</th>
                <th>Time (UTC)</th>
                {kind === 'delta' && <th>Source</th>}
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {g.timesheets.map((ts, i) => (
                <tr
                  key={i}
                  className={[
                    ts.source === SOURCE.TEMPDELTA_BASELINE_COPY ? 'row-copied' : '',
                    ts.excluded ? 'row-excluded' : '',
                  ].join(' ')}
                >
                  <td>{i + 1}</td>
                  <td>
                    {ts.startDate ?? 'any'}
                    {ts.endDate !== ts.startDate && ` … ${ts.endDate}`}
                  </td>
                  <td>{ts.day}</td>
                  <td>
                    {ts.startTime}–{ts.endTime}
                    {ts.excluded && <span className="ts-excluded-badge">EXCL</span>}
                    {ts.split && <span className="ts-split-badge">SPLIT</span>}
                  </td>
                  {kind === 'delta' && (
                    <td>{ts.source === SOURCE.TEMPDELTA_BASELINE_COPY ? 'BL copy' : 'Event'}</td>
                  )}
                  <td>{ts.annotation ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

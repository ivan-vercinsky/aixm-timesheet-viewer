// Render smoke test: the whole tree (App → Timesheet control) renders the
// bundled example scenarios without a browser (no localStorage, no window).
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App.jsx';
import { Timesheet } from './timesheet/index.js';
import { examples } from './data/examples/index.js';

const slice = (scenario, interpretation) =>
  scenario.feature.timeSlices.find((s) => s.interpretation === interpretation) ?? null;

describe('App', () => {
  it('renders the first bundled scenario', () => {
    const html = renderToString(<App />);
    expect(html).toContain('RESULT (effective)');
    expect(html).toContain('cal-grid');
    expect(html).toContain(examples[0].feature.designator);
  });
});

describe('Timesheet control', () => {
  it('renders standalone from raw TimeSlices for every example', () => {
    for (const scenario of examples) {
      const html = renderToString(
        <Timesheet
          baselineSlice={slice(scenario, 'BASELINE')}
          deltaSlice={slice(scenario, 'TEMPDELTA')}
          supersedes={scenario.supersedesBaseline !== false}
          defaultValidity={scenario.event?.validTime ?? null}
          snapKey={scenario.id}
        />
      );
      expect(html).toContain('TEMPDELTA · timesheets');
      expect(html).toContain('cal-grid');
    }
  });
});

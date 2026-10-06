// Public surface of the Timesheet control. The application imports only from
// here (and from nothing else inside src/timesheet/), so the whole directory
// can be lifted into the EDS component kit unchanged.

export { default as Timesheet } from './Timesheet.jsx';

// Resolution-layer exports for hosts that need them (formatting, provenance
// constants). Framework-free, see ./lib/.
export { SOURCE, SOURCE_LABELS, stateOf } from './lib/schedule.js';
export { fmtDate, fmtDateTime, fmtTime, weekStartOf, addDays } from './lib/timesheet.js';

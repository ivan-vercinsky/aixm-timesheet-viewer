import saaActExtension from './01-saa-act-extension.json';
import saaActNight from './02-saa-act-night.json';
import adClsRunway from './03-ad-cls-runway.json';
import svcHrsReduced from './04-svc-hrs-reduced.json';
import saaNewTda from './05-saa-new-tda.json';
import adAhpHospital from './06-ad-ahp-hospital.json';
import saaActCopyOnly from './07-saa-act-copy-only.json';
import svcHrsIntermittent from './08-svc-hrs-intermittent.json';

export const examples = [
  saaActExtension,
  saaActNight,
  adClsRunway,
  svcHrsReduced,
  saaNewTda,
  adAhpHospital,
  saaActCopyOnly,
  svcHrsIntermittent,
  {
    id: 'custom',
    custom: true,
    title: 'Custom — paste your own BASELINE / TEMPDELTA TimeSlices (JSON)',
    note: 'Paste one TimeSlice per input, either in the simplified example shape ("activation"/"availability" with "timeInterval" — a single group or an array of groups) or in the AIXM 5.1.1 JSON shape ("aixm:availability"). A whole example file or feature can also be pasted — the matching TimeSlice is picked by its "interpretation". The inputs are pre-filled with the hospital heliport example; provenance of TEMPDELTA content is derived by structural matching unless timesheets carry explicit "source" tags.',
  },
];

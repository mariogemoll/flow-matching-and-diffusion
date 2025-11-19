import { setUpConditionalProbabilityPathTfjsImpl } from './conditional-tfjs';
import { makeLinearNoiseScheduler } from './math/noise-scheduler';

function run(): void {
  const linearNoiseScheduler = makeLinearNoiseScheduler();
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-no-contours',
    '#playBtnTfjsNoContours',
    '#timeSliderTfjsNoContours',
    '#timeValueTfjsNoContours',
    '#wallTimeTfjsNoContours',
    '#sampleBtnTfjsNoContours',
    false,
    'TF.js on-the-fly (no contours)',
    linearNoiseScheduler,
    '#conditional-vector-field-canvas',
    '#sampleBtnVectorField',
    '#clearBtnVectorField',
    '#sampleContinuouslyTfjsNoContours'
  );
}

run();

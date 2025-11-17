import { setUpConditionalProbabilityPathTfjsImpl } from './conditional-tfjs';
import { linearNoiseScheduler, linearNoiseSchedulerDerivative } from './noise-schedulers';

function run(): void {
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
    linearNoiseSchedulerDerivative,
    '#conditional-vector-field-canvas',
    '#sampleBtnVectorField',
    '#clearBtnVectorField',
    '#sampleContinuouslyTfjsNoContours'
  );
}

run();

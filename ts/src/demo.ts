import {
  setUpConditionalProbabilityPath,
  setUpConditionalProbabilityPathCpuOnTheFly
} from './conditional-probability-cpu';
import { setUpConditionalProbabilityPathTfjsImpl } from './conditional-tfjs';
import { setUpFrameExample } from './frame-example';
import { setUpGaussianCpu } from './gaussian-cpu';
import { setUpGaussian } from './gaussian-tf';
import { makeLinearNoiseScheduler } from './math/noise-scheduler';

function run(): void {
  setUpFrameExample();
  setUpGaussianCpu();
  setUpGaussian();

  const linearNoiseScheduler = makeLinearNoiseScheduler();
  setUpConditionalProbabilityPathCpuOnTheFly(linearNoiseScheduler);
  setUpConditionalProbabilityPath(linearNoiseScheduler);
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs',
    '#playBtnTfjs',
    '#timeSliderTfjs',
    '#timeValueTfjs',
    '#wallTimeTfjs',
    null,
    true,
    'TF.js on-the-fly',
    linearNoiseScheduler
  );
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-precompute',
    '#playBtnTfjsPrecompute',
    '#timeSliderTfjsPrecompute',
    '#timeValueTfjsPrecompute',
    '#wallTimeTfjsPrecompute',
    null,
    true,
    'TF.js with precomputation',
    linearNoiseScheduler
  );
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
    null,
    null,
    '#sampleContinuouslyTfjsNoContours'
  );
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-precompute-no-contours',
    '#playBtnTfjsPrecomputeNoContours',
    '#timeSliderTfjsPrecomputeNoContours',
    '#timeValueTfjsPrecomputeNoContours',
    '#wallTimeTfjsPrecomputeNoContours',
    null,
    false,
    'TF.js with precomputation (no contours)',
    linearNoiseScheduler
  );
}

run();

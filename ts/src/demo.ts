import {
  setUpConditionalProbabilityPath,
  setUpConditionalProbabilityPathCpuOnTheFly
} from './conditional-probability-cpu';
import { setUpConditionalProbabilityPathTfjsImpl } from './conditional-tfjs';
import { setUpFrameExample } from './frame-example';
import { setUpGaussianCpu } from './gaussian-cpu';
import { setUpGaussian } from './gaussian-tf';
import { linearNoiseScheduler, linearNoiseSchedulerDerivative } from './noise-schedulers';

function run(): void {
  setUpFrameExample();
  setUpGaussianCpu();
  setUpGaussian();
  setUpConditionalProbabilityPathCpuOnTheFly(linearNoiseScheduler);
  setUpConditionalProbabilityPath(linearNoiseScheduler);
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs',
    '#playBtnTfjs',
    '#timeSliderTfjs',
    '#timeValueTfjs',
    '#wallTimeTfjs',
    null,
    false,
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
    false,
    'TF.js on-the-fly (no contours)',
    linearNoiseScheduler,
    linearNoiseSchedulerDerivative,
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
    true,
    false,
    'TF.js with precomputation (no contours)',
    linearNoiseScheduler
  );
}

run();

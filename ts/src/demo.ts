import {
  setUpConditionalProbabilityPath,
  setUpConditionalProbabilityPathCpuOnTheFly
} from './conditional-probability-cpu';
import {
  setUpConditionalProbabilityPathTfjs,
  setUpConditionalProbabilityPathTfjsNoContours,
  setUpConditionalProbabilityPathTfjsPrecompute,
  setUpConditionalProbabilityPathTfjsPrecomputeNoContours
} from './conditional-probability-tfjs';
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
  setUpConditionalProbabilityPathTfjs(linearNoiseScheduler);
  setUpConditionalProbabilityPathTfjsPrecompute(linearNoiseScheduler);
  setUpConditionalProbabilityPathTfjsNoContours(
    linearNoiseScheduler,
    linearNoiseSchedulerDerivative,
    '#conditional-vector-field-canvas'
  );
  setUpConditionalProbabilityPathTfjsPrecomputeNoContours(linearNoiseScheduler);
}

run();

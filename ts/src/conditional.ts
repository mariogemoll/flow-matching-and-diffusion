import { setUpConditionalProbabilityPathTfjsNoContours } from './conditional-probability-tfjs';
import { linearNoiseScheduler, linearNoiseSchedulerDerivative } from './noise-schedulers';

function run(): void {
  setUpConditionalProbabilityPathTfjsNoContours(
    linearNoiseScheduler,
    linearNoiseSchedulerDerivative,
    '#conditional-vector-field-canvas'
  );
}

run();

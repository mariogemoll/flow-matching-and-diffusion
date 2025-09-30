import { setUpConditionalProbabilityPathTfjsNoContours } from './conditional-probability-tfjs';
import { linearNoiseScheduler } from './noise-schedulers';

function run(): void {
  setUpConditionalProbabilityPathTfjsNoContours(linearNoiseScheduler);
}

run();

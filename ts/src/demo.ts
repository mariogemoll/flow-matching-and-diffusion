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

function run(): void {
  setUpFrameExample();
  setUpGaussianCpu();
  setUpGaussian();
  setUpConditionalProbabilityPathCpuOnTheFly();
  setUpConditionalProbabilityPath();
  setUpConditionalProbabilityPathTfjs();
  setUpConditionalProbabilityPathTfjsPrecompute();
  setUpConditionalProbabilityPathTfjsNoContours();
  setUpConditionalProbabilityPathTfjsPrecomputeNoContours();
}

run();

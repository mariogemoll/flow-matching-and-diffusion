import type { Points2D } from '../types';
import { makePoints2D } from '../util/points';
import { fillWithSamplesFromStdGaussian } from './gaussian';

export interface SdeNoises extends Points2D {
  count: number;
  stepsPerSample: number;
}

export function createSdeNoises(count: number, stepsPerSample: number): SdeNoises {
  const totalNoise = count * stepsPerSample;
  const noises = makePoints2D(totalNoise);
  fillWithSamplesFromStdGaussian(noises);
  return { xs: noises.xs, ys: noises.ys, count, stepsPerSample, version: 0 };
}

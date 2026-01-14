import type { GaussianComponent, GaussianMixture, Pair } from '../types';
import { randomPosition } from '../util/misc';
import { axisToCovariance } from './linalg';

export function makeGmm(numComponents: number): GaussianMixture {
  if (numComponents < 0) {
    throw new Error('makeGmm expects numComponents to be >= 0');
  }
  if (numComponents === 0) {
    return { components: [], version: 0 };
  }

  const weight = 1 / numComponents;
  return {
    components: Array.from({ length: numComponents }, () => ({
      mean: [0, 0],
      weight,
      covariance: [[1, 0], [0, 1]]
    })),
    version: 0
  };
}

export function makeRandomGmm(numComponents: number): GaussianMixture {
  if (numComponents < 0) {
    throw new Error('makeRandomGmm expects numComponents to be >= 0');
  }
  const components: GaussianComponent[] = [];

  const rawWeights = Array.from({ length: numComponents }, () => Math.random());
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);
  const weights = rawWeights.map((w) => w / totalWeight);

  for (let i = 0; i < numComponents; i++) {
    const mean = randomPosition(0.8);

    const angle = Math.random() * 2 * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const majorScale = Math.sqrt(0.1 + Math.random() * 2.5);
    const minorScale = Math.sqrt(0.1 + Math.random() * 2.5);

    const majorAxis: Pair<number> = [majorScale * cos, majorScale * sin];
    const minorAxis: Pair<number> = [minorScale * -sin, minorScale * cos];

    const covariance = axisToCovariance(majorAxis, minorAxis);

    components.push({
      mean,
      weight: weights[i],
      covariance
    });
  }

  return {
    components,
    version: 0
  };
}

import type { GaussianComponent, GaussianMixture, Points2D } from '../types';
import { makePoints2D } from '../util/points';
import { fillWithSamplesFromStdGaussian } from './gaussian';
import { covarianceToAxes } from './linalg';
import { type AlphaBetaScheduleName, getAlpha, getBeta } from './schedules/alpha-beta';

export function writeGmm(
  targetGmm: GaussianMixture,
  schedule: AlphaBetaScheduleName,
  t: number,
  out: GaussianMixture
): void {
  const components = targetGmm.components;
  if (components.length === 0) {
    out.components.length = 0;
    return;
  }
  if (out.components.length !== components.length) {
    throw new Error('writeGmm expects number of components in out to match targetGmm');
  }

  const alpha = getAlpha(t, schedule);
  const beta = getBeta(t, schedule);
  const alpha2 = alpha * alpha;
  const beta2 = beta * beta;

  for (let i = 0; i < components.length; i++) {
    const source = components[i];
    const dest = out.components[i];

    dest.mean[0] = alpha * source.mean[0];
    dest.mean[1] = alpha * source.mean[1];
    dest.weight = source.weight;

    const cov = source.covariance;
    dest.covariance[0][0] = alpha2 * cov[0][0] + beta2;
    dest.covariance[0][1] = alpha2 * cov[0][1];
    dest.covariance[1][0] = alpha2 * cov[1][0];
    dest.covariance[1][1] = alpha2 * cov[1][1] + beta2;
  }

  out.version++;
}

export function sampleFromGmmMargProbPath(
  components: GaussianComponent[],
  sampleCount: number,
  t: number,
  schedule: AlphaBetaScheduleName,
  out: Points2D,
  startIndex = 0,
  count = sampleCount
): void {
  if (count <= 0) { return; }
  if (components.length === 0) { return; }

  const alpha = getAlpha(t, schedule);
  const beta = getBeta(t, schedule);

  const xs = out.xs;
  const ys = out.ys;
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);

  const componentNoise = makePoints2D(count);
  const sourceNoise = makePoints2D(count);
  fillWithSamplesFromStdGaussian(componentNoise);
  fillWithSamplesFromStdGaussian(sourceNoise);

  const axes = components.map((component) => covarianceToAxes(component.covariance));

  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalWeight;
    let componentIndex = components.length - 1;

    for (let cIdx = 0; cIdx < components.length; cIdx++) {
      r -= components[cIdx].weight;
      if (r <= 0) {
        componentIndex = cIdx;
        break;
      }
    }

    const component = components[componentIndex];
    const componentAxes = axes[componentIndex];
    const z1 = componentNoise.xs[i];
    const z2 = componentNoise.ys[i];

    const x1x = component.mean[0] +
      componentAxes.majorAxis[0] * z1 +
      componentAxes.minorAxis[0] * z2;
    const x1y = component.mean[1] +
      componentAxes.majorAxis[1] * z1 +
      componentAxes.minorAxis[1] * z2;

    const z0x = sourceNoise.xs[i];
    const z0y = sourceNoise.ys[i];

    const outputIndex = startIndex + i;
    xs[outputIndex] = alpha * x1x + beta * z0x;
    ys[outputIndex] = alpha * x1y + beta * z0y;
  }

  out.version++;
}

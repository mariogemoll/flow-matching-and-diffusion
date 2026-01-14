import type { GaussianMixture } from '../types';
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

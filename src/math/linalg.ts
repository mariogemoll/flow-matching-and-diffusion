import type { Pair } from '../types';

// Convert orthogonal axis vectors into a covariance matrix.
// Axis lengths represent sqrt(variance) along each principal direction.
export function axisToCovariance(
  majorAxis: Pair<number>,
  minorAxis: Pair<number>
): [[number, number], [number, number]] {
  const xx = majorAxis[0] * majorAxis[0] + minorAxis[0] * minorAxis[0];
  const xy = majorAxis[0] * majorAxis[1] + minorAxis[0] * minorAxis[1];
  const yy = majorAxis[1] * majorAxis[1] + minorAxis[1] * minorAxis[1];

  return [[xx, xy], [xy, yy]];
}

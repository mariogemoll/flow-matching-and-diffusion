// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { Points2D } from '../types';
import { makePoints2D } from '../util/points';
import { sampleTwoFromStandardGaussian } from './gaussian';

/**
 * Generate a 2D moons dataset (two interleaving half circles)
 * Similar to sklearn.datasets.make_moons
 */
export function makeMoons(nSamples: number, noise = 0.05): Points2D {
  const points = makePoints2D(nSamples);
  const samplesPerMoon = Math.floor(nSamples / 2);

  // Generate outer moon (top half circle)
  for (let i = 0; i < samplesPerMoon; i++) {
    const angle = (i / (samplesPerMoon - 1)) * Math.PI;
    points.xs[i] = Math.cos(angle);
    points.ys[i] = Math.sin(angle);
  }

  // Generate inner moon (bottom half circle, flipped and shifted)
  const innerSamples = nSamples - samplesPerMoon;
  for (let i = 0; i < innerSamples; i++) {
    const angle = (i / (innerSamples - 1)) * Math.PI;
    const idx = samplesPerMoon + i;
    points.xs[idx] = 1 - Math.cos(angle);
    points.ys[idx] = -Math.sin(angle) + 0.5;
  }

  // Add noise if specified
  if (noise > 0) {
    for (let i = 0; i < nSamples; i += 2) {
      const [n1, n2] = sampleTwoFromStandardGaussian();
      points.xs[i] += n1 * noise;
      points.ys[i] += n2 * noise;
      if (i + 1 < nSamples) {
        const [n3, n4] = sampleTwoFromStandardGaussian();
        points.xs[i + 1] += n3 * noise;
        points.ys[i + 1] += n4 * noise;
      }
    }
  }

  // Shuffle points using Fisher-Yates
  for (let i = nSamples - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Swap x
    const tmpX = points.xs[i];
    points.xs[i] = points.xs[j];
    points.xs[j] = tmpX;
    // Swap y
    const tmpY = points.ys[i];
    points.ys[i] = points.ys[j];
    points.ys[j] = tmpY;
  }

  points.version++;
  return points;
}

// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

/**
 * Gaussian sampling utilities
 */

import type { Points2D } from '../types';

/**
 * Sample two independent values from standard Gaussian N(0,1) using Box-Muller transform.
 * Returns [sample1, sample2].
 */
export function sampleTwoFromStandardGaussian(): [number, number] {
  const u1 = Math.random();
  const u2 = Math.random();
  const r = Math.sqrt(-2.0 * Math.log(u1));
  const theta = 2.0 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

/**
 * Fill a Points2D buffer with independent standard Gaussian samples for x/y.
 * Uses Box-Muller to generate two independent values per iteration.
 */
export function fillWithSamplesFromStdGaussian(out: Points2D): void {
  const xs = out.xs;
  const ys = out.ys;
  const count = xs.length;

  for (let i = 0; i < count; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    const nx = r * Math.cos(theta);
    const ny = r * Math.sin(theta);
    xs[i] = nx;
    ys[i] = ny;
  }

  out.version++;
  return;
}

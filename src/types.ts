// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

export type Pair<T> = [T, T];

export type Point2D = Pair<number>;

export interface Points2D {
  xs: Float32Array;
  ys: Float32Array;
  version: number;
}

/**
 * Structure of Arrays for multiple trajectories with uniform length.
 * All trajectories have the same number of points.
 */
export interface Trajectories {
  xs: Float32Array;
  ys: Float32Array;
  /** Number of trajectories */
  count: number;
  /** Points per trajectory (uniform) */
  pointsPerTrajectory: number;
  /** Bump when xs/ys are mutated in-place to refresh GPU buffers. */
  version: number;
}

export interface GaussianComponent {
  mean: Point2D;
  weight: number;
  covariance: [[number, number], [number, number]];
}

export interface GaussianMixture {
  components: GaussianComponent[];
  version: number;
}

export type RGBA = [number, number, number, number];

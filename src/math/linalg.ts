// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { Pair } from '../types';

export interface Matrix2x2 {
  data: [[number, number], [number, number]];
}

export function matScale(m: Matrix2x2, s: number): Matrix2x2 {
  return {
    data: [
      [m.data[0][0] * s, m.data[0][1] * s],
      [m.data[1][0] * s, m.data[1][1] * s]
    ]
  };
}

export function matAddScalarDiagonal(m: Matrix2x2, s: number): Matrix2x2 {
  return {
    data: [
      [m.data[0][0] + s, m.data[0][1]],
      [m.data[1][0], m.data[1][1] + s]
    ]
  };
}

export function invertMatrix2x2(m: Matrix2x2): Matrix2x2 {
  const [[a, b], [c, d]] = m.data;
  const det = a * d - b * c;
  const invDet = 1 / det;
  return {
    data: [
      [d * invDet, -b * invDet],
      [-c * invDet, a * invDet]
    ]
  };
}

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

// Convert a 2x2 covariance matrix to major and minor axes
// Performs eigendecomposition
export function covarianceToAxes(
  cov: [[number, number], [number, number]]
): { majorAxis: Pair<number>; minorAxis: Pair<number> } {
  const a = cov[0][0];
  const b = cov[0][1]; // symmetric, cov[1][0] should be same
  const d = cov[1][1];

  // Trace and Determinant
  const trace = a + d;
  const det = a * d - b * b;

  // Eigenvalues: lambda^2 - trace*lambda + det = 0
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  const l1 = (trace + discriminant) / 2;
  const l2 = (trace - discriminant) / 2;

  // Sort so l1 is major (larger)
  // Actually l1 is always >= l2 because discriminant >= 0

  // Eigenvectors
  // For each lambda, (A - lambda I)v = 0 => (a-l)x + by = 0

  let v1: Pair<number>;
  let v2: Pair<number>;

  // Handle degenerate case (isotropic or zero)
  if (Math.abs(b) < 1e-10 && Math.abs(a - d) < 1e-10) {
    // Identity-like, arbitrary axes
    v1 = [1, 0];
    v2 = [0, 1];
  } else {
    // v1 corresponding to l1
    if (Math.abs(b) > 1e-10) {
      v1 = [1, (l1 - a) / b];
    } else {
      // b is small, so matrix is essentially diagonal
      // eigenvalues are approx a and d
      // if l1 corresponds to a, vector is (1,0), else (0,1)
      if (Math.abs(l1 - a) < Math.abs(l1 - d)) {
        v1 = [1, 0];
      } else {
        v1 = [0, 1];
      }
    }

    // Normalize v1
    const mag1 = Math.hypot(v1[0], v1[1]);
    v1 = [v1[0] / mag1, v1[1] / mag1];

    // v2 is orthogonal to v1
    v2 = [-v1[1], v1[0]];
  }

  // Scale by sqrt(eigenvalue)
  const s1 = Math.sqrt(Math.max(0, l1));
  const s2 = Math.sqrt(Math.max(0, l2));

  return {
    majorAxis: [v1[0] * s1, v1[1] * s1],
    minorAxis: [v2[0] * s2, v2[1] * s2]
  };
}

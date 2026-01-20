// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { X_DOMAIN, Y_DOMAIN } from '../constants';
import type { Point2D } from '../types';

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

interface Scale {
  (x: number): number;
  inverse(y: number): number;
}

export function makeScale(
  domain: [number, number],
  range: [number, number]
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const scale = (x: number): number => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
  scale.inverse = (y: number): number => d0 + ((y - r0) / (r1 - r0)) * (d1 - d0);
  return scale;
}

export function randomPosition(margin = 0): Point2D {
  const xMin = X_DOMAIN[0] + margin;
  const xMax = X_DOMAIN[1] - margin;
  const yMin = Y_DOMAIN[0] + margin;
  const yMax = Y_DOMAIN[1] - margin;

  const x = xMin + Math.random() * (xMax - xMin);
  const y = yMin + Math.random() * (yMax - yMin);
  return [x, y];
}

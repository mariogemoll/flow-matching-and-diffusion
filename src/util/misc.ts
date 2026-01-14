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

export function randomPosition(): Point2D {
  const x = X_DOMAIN[0] + Math.random() * (X_DOMAIN[1] - X_DOMAIN[0]);
  const y = Y_DOMAIN[0] + Math.random() * (Y_DOMAIN[1] - Y_DOMAIN[0]);
  return [x, y];
}

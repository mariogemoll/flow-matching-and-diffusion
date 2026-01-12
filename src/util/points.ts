import type { Points2D } from '../types';

export function makePoints2D(num: number): Points2D {
  return {
    xs: new Float32Array(num),
    ys: new Float32Array(num),
    version: 0
  };
}

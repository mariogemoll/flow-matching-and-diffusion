export type Pair<T> = [T, T];

export type Point2D = Pair<number>;

export interface Points2D {
  xs: Float32Array;
  ys: Float32Array;
  version: number;
}

export type RGBA = [number, number, number, number];

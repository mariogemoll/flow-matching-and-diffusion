import type { RGBA } from '../types';

export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 300;

export const DEFAULT_ANIMATION_SPEED = 1 / 3;
export const DEFAULT_LOOP_PAUSE = 0.5;

export const X_DOMAIN: [number, number] = [-2, 2];
export const Y_DOMAIN: [number, number] = [-1.5, 1.5];

export const COLORS: Record<string, RGBA> = {
  background: [0.1, 0.1, 0.1, 1.0],
  point: [0.9, 0.9, 0.9, 1.0],
  highlightPoint: [1.0, 0.2, 0.2, 1.0]
};

export const POINT_SIZE = 8;

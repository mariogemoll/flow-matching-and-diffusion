import type { RGBA } from '../types';

export const DEFAULT_ANIMATION_SPEED = 1 / 3;
export const DEFAULT_LOOP_PAUSE = 0.5;

export const X_DOMAIN: [number, number] = [-2, 2];
export const Y_DOMAIN: [number, number] = [-1.5, 1.5];

export const COLORS: Record<string, RGBA> = {
  background: [0.1, 0.1, 0.1, 1.0],
  point: [0.9, 0.9, 0.9, 1.0],
  highlightPoint: [0.0, 1.0, 0.2, 1.0],
  vectorFieldArrow: [1.0, 1.0, 1.0, 0.35],
  vectorField: [1.0, 1.0, 1.0, 0.2],
  trajectorySecondary: [1.0, 1.0, 1.0, 0.4],
  pdf: [1.0, 1.0, 1.0, 0.8],
  dot: [0.2, 0.8, 0.2, 1.0]
};

export const DOT_SIZE = 10;
export const THICK_LINE_THICKNESS = 3;
export const POINT_SIZE = 8;
export const NUM_TRAJECTORY_STEPS = 100;

export const MAX_NUM_SAMPLES = 5000;
export const NUM_SAMPLES = 1000;

export const SCHEDULE_LINE_COLOR = '#aaa';
export const SCHEDULE_DOT_COLOR = '#888';

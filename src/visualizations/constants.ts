import { type AlphaBetaScheduleName } from '../math/schedules/alpha-beta';
import { type SigmaScheduleName } from '../math/schedules/sigma';
import type { RGBA } from '../types';

export const DEFAULT_ANIMATION_SPEED = 1 / 3;
export const DEFAULT_LOOP_PAUSE = 0.5;

export const X_DOMAIN: [number, number] = [-2, 2];
export const Y_DOMAIN: [number, number] = [-1.5, 1.5];

export const COLORS: Record<string, RGBA> = {
  background: [0.1, 0.1, 0.1, 1.0],
  point: [0.0, 1.0, 0.2, 0.4],
  highlightPoint: [0.0, 1.0, 0.2, 1.0],
  vectorFieldArrow: [1.0, 1.0, 1.0, 0.35],
  vectorField: [1.0, 1.0, 1.0, 0.2],
  trajectory: [0.5, 0.5, 0.5, 0.2],
  singleTrajectory: [1.0, 1.0, 1.0, 0.8],
  singleTrajectorySecondary: [1.0, 1.0, 1.0, 0.2],
  pdf: [1.0, 1.0, 1.0, 0.8],
  dot: [0.2, 0.8, 0.2, 1.0]
};

export const DOT_SIZE = 10;
export const THICK_LINE_THICKNESS = 3;
export const POINT_SIZE = 6;
export const NUM_TRAJECTORY_STEPS = 100;

export const MAX_NUM_SAMPLES = 5000;
export const NUM_SAMPLES = 1000;
export const MAX_NUM_SDE_STEPS = 100;

export const SCHEDULE_LINE_COLOR = '#aaa';
export const SCHEDULE_DOT_COLOR = '#888';

export const DEFAULT_ALPHA_BETA_SCHEDULE: AlphaBetaScheduleName = 'ddpm';
export const DEFAULT_SIGMA_SCHEDULE: SigmaScheduleName = 'linear-decay';
export const DEFAULT_NUM_SDE_STEPS = 50;
export const DEFAULT_MAX_SIGMA = 0.8;

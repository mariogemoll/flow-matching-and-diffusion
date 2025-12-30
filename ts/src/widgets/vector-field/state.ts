import { CANVAS_HEIGHT,CANVAS_WIDTH } from '../constants';
import type { VectorFieldWidgetState } from './types';

export function createInitialState(): VectorFieldWidgetState {
  return {
    mode: 'animating',
    showTrajectory: true,
    currentTime: 0,
    lastFrameTime: performance.now(),
    startPos: [Math.random() * CANVAS_WIDTH, Math.random() * CANVAS_HEIGHT],
    trajectory: []
  };
}

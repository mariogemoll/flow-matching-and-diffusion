import type { Point2D } from '../types';
import type { WebGl } from '../webgl';

export interface VectorFieldWidgetElements {
  canvas: HTMLCanvasElement;
  playPauseBtn: HTMLButtonElement;
  showTrajectoryCheckbox: HTMLInputElement;
  timeSlider: HTMLInputElement;
  timeValue: HTMLSpanElement;
}

export interface VectorFieldWidget {
  elements: VectorFieldWidgetElements;
  webgl: WebGl;
}

export type VectorFieldWidgetMode =
  | 'paused'
  | 'animating'
  | 'animatingPausingAtEnd'
  | 'movingDotThenAnimate'
  | 'movingDotThenPause'
  | 'slidingTimeThenAnimate'
  | 'slidingTimeThenPause';

export interface VectorFieldWidgetState {
  mode: VectorFieldWidgetMode;
  showTrajectory: boolean;
  currentTime: number;
  lastFrameTime: number;
  startPos: Point2D;
  trajectory: Point2D[];
}

import { addDot } from 'web-ui-common/canvas';
import type { Pair, Scale } from 'web-ui-common/types';

import {
  type AnimationControlMessage,
  createWorkerAnimationLoop,
  TOTAL_FRAMES,
  type WorkerAnimationLoop
} from './animation-common';
import { calculateTrajectory, createVectorFieldScales, drawVectorField } from './vector-field-core';

interface VectorFieldIncomingState {
  dotX: number;
  dotY: number;
  isDragging: boolean;
  showTrajectory: boolean;
}

interface VectorFieldState {
  dotDataX: number;
  dotDataY: number;
  isDragging: boolean;
  showTrajectory: boolean;
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let xScale: Scale | null = null;
let yScale: Scale | null = null;
let trajectory: Pair<number>[] = [];

let currentState: VectorFieldState = {
  dotDataX: 0,
  dotDataY: 0,
  isDragging: false,
  showTrajectory: true
};

let animation: WorkerAnimationLoop | null = null;

function drawTrajectory(
  canvasCtx: CanvasRenderingContext2D,
  xScaleLocal: Scale,
  yScaleLocal: Scale
): void {
  if (!currentState.showTrajectory || trajectory.length < 2) {
    return;
  }

  canvasCtx.strokeStyle = '#888';
  canvasCtx.lineWidth = 2;
  canvasCtx.globalAlpha = 0.7;
  canvasCtx.beginPath();

  const [x0, y0] = trajectory[0];
  canvasCtx.moveTo(xScaleLocal(x0), yScaleLocal(y0));

  for (let i = 1; i < trajectory.length; i++) {
    const [x, y] = trajectory[i];
    canvasCtx.lineTo(xScaleLocal(x), yScaleLocal(y));
  }

  canvasCtx.stroke();
  canvasCtx.globalAlpha = 1;
}

function recomputeTrajectory(): void {
  if (!xScale || !yScale) {
    return;
  }

  trajectory = calculateTrajectory(
    [currentState.dotDataX, currentState.dotDataY],
    xScale,
    yScale,
    500
  );
}

function applyIncomingState(update: Partial<VectorFieldIncomingState>): void {
  if (!xScale || !yScale) {
    return;
  }

  const nextState: VectorFieldState = { ...currentState };

  if (update.dotX !== undefined && update.dotY !== undefined) {
    nextState.dotDataX = xScale.inverse(update.dotX);
    nextState.dotDataY = yScale.inverse(update.dotY);
  }

  if (update.isDragging !== undefined) {
    nextState.isDragging = update.isDragging;
  }

  if (update.showTrajectory !== undefined) {
    nextState.showTrajectory = update.showTrajectory;
  }

  currentState = nextState;
  recomputeTrajectory();
}

function render(frame: number): void {
  if (!ctx || !xScale || !yScale) {
    return;
  }

  const canvasCtx = ctx as unknown as CanvasRenderingContext2D;
  const time = frame / (TOTAL_FRAMES - 1);

  canvasCtx.clearRect(0, 0, width, height);

  drawVectorField(canvasCtx, xScale, yScale, time, { spacing: 12, displayScale: 0.06 });
  drawTrajectory(canvasCtx, xScale, yScale);
  canvasCtx.strokeStyle = '#333';
  canvasCtx.lineWidth = 1;
  canvasCtx.strokeRect(0, 0, width, height);

  let dotDataPos: Pair<number> = [currentState.dotDataX, currentState.dotDataY];
  if (!currentState.isDragging && trajectory.length > 0) {
    const clampedTime = Math.min(Math.max(time, 0), 1);
    const idx = Math.min(
      Math.floor(clampedTime * (trajectory.length - 1)),
      trajectory.length - 1
    );
    dotDataPos = trajectory[idx];
  }

  const dotColor = currentState.isDragging ? '#FF5722' : '#2196F3';
  addDot(canvasCtx, xScale(dotDataPos[0]), yScale(dotDataPos[1]), 8, dotColor);
}

interface InitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  state?: VectorFieldIncomingState;
}

interface StateUpdateMessage {
  type: 'state-update';
  state: Partial<VectorFieldIncomingState>;
}

type WorkerMessage =
  | InitMessage
  | StateUpdateMessage
  | AnimationControlMessage;

self.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  if (type === 'init') {
    const { canvas: offscreen, width: w, height: h, state } = e.data;
    canvas = offscreen;
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('Failed to get 2D context from OffscreenCanvas');
      return;
    }

    ctx = context;
    width = w;
    height = h;
    ({ xScale, yScale } = createVectorFieldScales(width, height, {
      margins: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      },
      xRange: [180, 420],
      yRange: [135, 315]
    }));
    applyIncomingState(state ?? {
      dotX: width / 2,
      dotY: height / 2,
      isDragging: false,
      showTrajectory: true
    });

    animation = createWorkerAnimationLoop({
      render: (frame: number) => { render(frame); },
      onFrame: (frame: number) => {
        self.postMessage({
          type: 'frame-update',
          frame
        });
      }
    });

    animation.start();
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'state-update') {
    applyIncomingState(e.data.state);
    render(animation?.getFrame() ?? 0);
    return;
  }

  switch (type) {
  case 'set-frame':
    animation?.setFrame(e.data.frame);
    return;
  case 'pause-animation':
    animation?.pause();
    return;
  case 'resume-animation':
    animation?.resume();
    return;
  default:
    throw new Error(`Unknown message type received in vector field worker: ${String(type)}`);
  }
});

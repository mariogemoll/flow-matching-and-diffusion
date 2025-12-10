import { addDot } from 'web-ui-common/canvas';
import type { Scale } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

interface LabState {
  dotX: number;
  dotY: number;
  isDragging: boolean;
}

// View 1 state
let canvas1: OffscreenCanvas | null = null;
let ctx1: OffscreenCanvasRenderingContext2D | null = null;
let xScale1: Scale | null = null;
let yScale1: Scale | null = null;

// View 2 state
let canvas2: OffscreenCanvas | null = null;
let ctx2: OffscreenCanvasRenderingContext2D | null = null;
let xScale2: Scale | null = null;
let yScale2: Scale | null = null;

let width = 0;
let height = 0;

// Current state
let currentState: LabState = {
  dotX: 400,
  dotY: 300,
  isDragging: false
};

// Animation state
let animationFrame = 0;
const TOTAL_FRAMES = 100;
let isPaused = false;

// View 1: Circular orbit (clockwise)
function renderView1(): void {
  if (!ctx1 || !canvas1 || !xScale1 || !yScale1) {
    return;
  }

  const canvasCtx = ctx1 as unknown as CanvasRenderingContext2D;

  // Clear canvas
  ctx1.clearRect(0, 0, width, height);

  // Draw border
  canvasCtx.strokeStyle = '#333';
  canvasCtx.lineWidth = 1;
  canvasCtx.strokeRect(0, 0, width, height);

  // Calculate animated dot position (circular orbit)
  const centerX = currentState.dotX;
  const centerY = currentState.dotY;
  const radius = 50;
  const angle = (animationFrame / TOTAL_FRAMES) * Math.PI * 2;
  const animDotX = centerX + Math.cos(angle) * radius;
  const animDotY = centerY + Math.sin(angle) * radius;

  // Draw the animated dot (green)
  addDot(canvasCtx, animDotX, animDotY, 6, '#4CAF50');

  // Draw the draggable dot
  const dotColor = currentState.isDragging ? '#FF5722' : '#2196F3';
  addDot(canvasCtx, currentState.dotX, currentState.dotY, 8, dotColor);
}

// View 2: Elliptical orbit (counter-clockwise)
function renderView2(): void {
  if (!ctx2 || !canvas2 || !xScale2 || !yScale2) {
    return;
  }

  const canvasCtx = ctx2 as unknown as CanvasRenderingContext2D;

  // Clear canvas
  ctx2.clearRect(0, 0, width, height);

  // Draw border
  canvasCtx.strokeStyle = '#333';
  canvasCtx.lineWidth = 1;
  canvasCtx.strokeRect(0, 0, width, height);

  // Calculate animated dot position (elliptical orbit, counter-clockwise)
  const centerX = currentState.dotX;
  const centerY = currentState.dotY;
  const radiusX = 75;  // Horizontal radius (wider)
  const radiusY = 40;  // Vertical radius (narrower)
  const angle = -(animationFrame / TOTAL_FRAMES) * Math.PI * 2; // Negative for counter-clockwise
  const animDotX = centerX + Math.cos(angle) * radiusX;
  const animDotY = centerY + Math.sin(angle) * radiusY;

  // Draw the animated dot (purple)
  addDot(canvasCtx, animDotX, animDotY, 6, '#9C27B0');

  // Draw the draggable dot
  const dotColor = currentState.isDragging ? '#FF5722' : '#2196F3';
  addDot(canvasCtx, currentState.dotX, currentState.dotY, 8, dotColor);
}

// Main render function - calls all views
function render(): void {
  renderView1();
  renderView2();

  // Increment animation frame only if not paused
  if (!isPaused) {
    animationFrame = (animationFrame + 1) % TOTAL_FRAMES;
    self.postMessage({
      type: 'frame-update',
      frame: animationFrame
    });
  }
}

// Render loop
function renderLoop(): void {
  render();
  setTimeout(() => { renderLoop(); }, 1000 / 60); // ~60fps
}

function startRenderLoop(): void {
  renderLoop();
}

interface InitMessage {
  type: 'init';
  canvas1: OffscreenCanvas;
  canvas2: OffscreenCanvas;
  width: number;
  height: number;
}

interface StateUpdateMessage {
  type: 'state-update';
  state: LabState;
}

interface SetFrameMessage {
  type: 'set-frame';
  frame: number;
}

interface PauseAnimationMessage {
  type: 'pause-animation';
}

interface ResumeAnimationMessage {
  type: 'resume-animation';
}

type WorkerMessage =
  | InitMessage
  | StateUpdateMessage
  | SetFrameMessage
  | PauseAnimationMessage
  | ResumeAnimationMessage;

self.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  if (type === 'init') {
    const { canvas1: offscreen1, canvas2: offscreen2, width: w, height: h } = e.data;

    // Initialize canvas 1
    canvas1 = offscreen1;
    const context1 = canvas1.getContext('2d');
    if (!context1) {
      console.error('Failed to get 2D context from OffscreenCanvas 1');
      return;
    }
    ctx1 = context1;

    // Initialize canvas 2
    canvas2 = offscreen2;
    const context2 = canvas2.getContext('2d');
    if (!context2) {
      console.error('Failed to get 2D context from OffscreenCanvas 2');
      return;
    }
    ctx2 = context2;

    width = w;
    height = h;

    // Set up scales for both views
    const xRange = [0, 100] as [number, number];
    const yRange = [0, 100] as [number, number];
    const margins = { top: 20, right: 20, bottom: 40, left: 40 };

    xScale1 = makeScale(xRange, [margins.left, width - margins.right]);
    yScale1 = makeScale(yRange, [height - margins.bottom, margins.top]);

    xScale2 = makeScale(xRange, [margins.left, width - margins.right]);
    yScale2 = makeScale(yRange, [height - margins.bottom, margins.top]);

    // Start render loop
    startRenderLoop();

    // Notify main thread that we're ready
    self.postMessage({ type: 'ready' });
  } else if (type === 'state-update') {
    // Just update state, the render loop will pick it up
    currentState = e.data.state;
  } else if (type === 'set-frame') {
    // Set animation frame from slider
    animationFrame = e.data.frame;
  } else if (type === 'pause-animation') {
    isPaused = true;
  } else {
    // type === 'resume-animation'
    isPaused = false;
  }
});

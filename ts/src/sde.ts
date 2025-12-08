import { addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import { initTimeSliderWidget } from './time-slider';

// Declare tf as global from TensorFlow.js CDN
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const tf: any;

/**
 * Generate Brownian motion paths using TensorFlow.js
 * Returns a 2D tensor of shape [numPaths, numSteps, 2] where each path has (x, y) coordinates
 */
function generateBrownianMotion(
  numPaths: number,
  numSteps: number,
  dt: number,
  sigma: number
): number[][][] {
  /* eslint-disable @typescript-eslint/no-unsafe-return */
  /* eslint-disable @typescript-eslint/no-unsafe-call */
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  return tf.tidy(() => {
    // Generate random increments for x and y coordinates
    // Shape: [numPaths, numSteps, 2]
    const dW = tf.randomNormal([numPaths, numSteps, 2], 0, Math.sqrt(dt) * sigma);

    // Compute cumulative sum to get Brownian motion paths
    // Start all paths at origin [0, 0]
    const cumulativeSum = tf.cumsum(dW, 1);

    // Convert to array and return
    return cumulativeSum.arraySync() as number[][][];
  });
  /* eslint-enable @typescript-eslint/no-unsafe-return */
  /* eslint-enable @typescript-eslint/no-unsafe-call */
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
}

/**
 * Draw multiple Brownian motion paths
 */
function drawBrownianPaths(
  ctx: CanvasRenderingContext2D,
  paths: number[][][],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
  currentTime: number
): void {
  const numSteps = paths[0].length;
  const currentStep = Math.floor(currentTime * numSteps);

  paths.forEach((path, pathIndex) => {
    // Use different colors for different paths
    const hue = (pathIndex / paths.length) * 360;
    ctx.strokeStyle = `hsla(${hue}, 70%, 50%, 0.6)`;
    ctx.lineWidth = 2;

    ctx.beginPath();
    const [x0, y0] = path[0];
    ctx.moveTo(xScale(x0), yScale(y0));

    // Draw up to current time step
    for (let i = 1; i <= Math.min(currentStep, path.length - 1); i++) {
      const [x, y] = path[i];
      ctx.lineTo(xScale(x), yScale(y));
    }

    ctx.stroke();

    // Draw endpoint as a dot
    if (currentStep < path.length) {
      const [x, y] = path[currentStep];
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      ctx.beginPath();
      ctx.arc(xScale(x), yScale(y), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Set up Brownian motion visualization
 */
function setUpBrownianMotion(canvas: HTMLCanvasElement): void {
  const ctx = getContext(canvas);
  const container = canvas.parentElement;
  if (!container) {
    throw new Error('Canvas must have a parent element');
  }

  // Define coordinate system
  const xRange = [-5, 5] as [number, number];
  const yRange = [-5, 5] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  // Parameters
  const numPaths = 1;
  const numSteps = 200;
  const dt = 0.01;
  const sigma = 1.0;

  let paths = generateBrownianMotion(numPaths, numSteps, dt, sigma);
  let currentTime = 0;

  function render(time: number): void {
    currentTime = time;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Brownian paths
    drawBrownianPaths(ctx, paths, xScale, yScale, currentTime);

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, 10);
  }

  // Create controls container
  const controlsContainer = document.createElement('div');
  controlsContainer.style.marginTop = '16px';
  container.appendChild(controlsContainer);

  // Initialize time slider with looping, autostart, and pause at end
  initTimeSliderWidget(controlsContainer, currentTime, render, {
    loop: true,
    autostart: true,
    pauseAtEnd: 1000, // Pause for 1 second at the end
    onLoopStart: () => {
      // Regenerate new path when loop restarts
      paths = generateBrownianMotion(numPaths, numSteps, dt, sigma);
    }
  });

  // Initial render
  render(0);
}

function run(): void {
  const canvas = el(document, '#wiener-canvas') as HTMLCanvasElement;
  setUpBrownianMotion(canvas);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    run();
  } catch (error) {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  }
});

import {
  addAxesThroughOrigin,
  addFrameUsingScales,
  addGridLines,
  getContext,
  withClippingRegionFromScales
} from 'web-ui-common/canvas';
import { addCanvas, removePlaceholder } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import { computeBrownianMotion, generateBrownianNoise } from './math/brownian-motion';
import { initTimeSliderWidget } from './time-slider';

/**
 * Draw multiple Brownian motion paths
 */
function drawBrownianPaths(
  ctx: CanvasRenderingContext2D,
  paths: number[][][],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
  currentTime: number,
  showFullTrajectory: boolean
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

    // Draw up to current time step, or full path if showFullTrajectory is true
    const endStep = showFullTrajectory ? path.length - 1 : currentStep;
    for (let i = 1; i <= Math.min(endStep, path.length - 1); i++) {
      const [x, y] = path[i];
      ctx.lineTo(xScale(x), yScale(y));
    }

    ctx.stroke();

    // Draw endpoint as a dot at current position
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
function setUpBrownianMotion(canvas: HTMLCanvasElement, container: HTMLElement): void {
  const ctx = getContext(canvas);

  // Define coordinate system
  const xRange = [-2.5, 2.5] as [number, number];
  const yRange = [-2.5, 2.5] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  // Parameters
  const numPaths = 1;
  const numSteps = 200;
  const dt = 0.01;

  // Standard Brownian motion (no sigma parameter)
  let brownianNoise = generateBrownianNoise(numPaths, numSteps, dt);
  let paths = computeBrownianMotion(brownianNoise, 1.0);
  let currentTime = 0;

  function render(time: number): void {
    currentTime = time;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const numTicks = 11;

    addGridLines(ctx, xScale, yScale, numTicks);

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, numTicks);

    addAxesThroughOrigin(ctx, xScale, yScale, {
      showTicks: true,
      showLabels: false,
      numTicks: numTicks
    });

    withClippingRegionFromScales(ctx, xScale, yScale, () => {
      // Draw Brownian paths
      drawBrownianPaths(ctx, paths, xScale, yScale, currentTime, false);
    });
  }

  // Initialize time slider with looping, autostart, and pause at end
  initTimeSliderWidget(container, currentTime, render, {
    loop: true,
    autostart: true,
    pauseAtEnd: 1000, // Pause for 1 second at the end
    onLoopStart: () => {
      // Regenerate noise on each loop for standard Brownian motion
      brownianNoise = generateBrownianNoise(numPaths, numSteps, dt);
      paths = computeBrownianMotion(brownianNoise, 1.0);
    }
  });

  // Initial render
  render(0);
}

export function initBrownianMotionWidget(container: HTMLElement): void {
  removePlaceholder(container);
  const canvas = addCanvas(container, { width: '480', height: '350' });
  setUpBrownianMotion(canvas, container);
}

import {
  addDot, addFrameUsingScales, createMovableDot, defaultMargins, getContext
} from 'web-ui-common/canvas';
import { addCanvas } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import {
  computeGlobalMaxVectorLength,
  computeVectorFieldArrows,
  propagateVectorFieldSamples,
  sampleStandardNormalPoints
} from './conditional-tfjs-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { computeGaussianPdfTfjs } from './gaussian-tf';
import type { NoiseScheduler } from './math/noise-scheduler';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';

export function initVectorFieldView(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number,
  initialScheduler: NoiseScheduler,
  onChange: (position: Pair<number>) => void
): (position: Pair<number>, time: number, scheduler: NoiseScheduler) => void {
  // Add a canvas element to the container
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  // Create controls container
  const controlsDiv = document.createElement('div');
  controlsDiv.style.marginTop = '8px';
  container.appendChild(controlsDiv);

  // Create sample button
  const sampleBtn = document.createElement('button');
  sampleBtn.textContent = 'Sample';
  controlsDiv.appendChild(sampleBtn);

  // Create clear button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.marginLeft = '8px';
  controlsDiv.appendChild(clearBtn);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let currentPosition = initialPosition;
  let currentTime = initialTime;
  let currentScheduler = initialScheduler;
  let vectorFieldSampledPoints: { x: number; y: number }[] = [];
  let vectorFieldInitialSamples: [number, number][] = [];
  let globalMaxVectorLength = 0;

  // Create movable dot for the data point
  const dot = createMovableDot(
    canvas,
    ctx,
    xScale,
    yScale,
    initialPosition,
    {
      radius: 5,
      fill: ORANGE,
      onChange: onChange
    }
  );

  function recomputeGlobalMaxVectorLength(): void {
    globalMaxVectorLength = computeGlobalMaxVectorLength({
      xRange,
      yRange,
      dataPoint: currentPosition,
      noiseScheduler: currentScheduler,
      vectorFieldXScale: xScale,
      vectorFieldYScale: yScale
    });
  }

  function update(newPosition: Pair<number>, newTime: number, newScheduler: NoiseScheduler): void {
    const schedulerChanged = newScheduler !== currentScheduler;
    currentPosition = newPosition;
    currentTime = newTime;
    currentScheduler = newScheduler;

    // Recompute global max if scheduler changed
    if (schedulerChanged) {
      recomputeGlobalMaxVectorLength();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw standard normal at t=0
    if (Math.abs(currentTime) < 0.01) {
      const result = computeGaussianPdfTfjs(
        canvas,
        ctx,
        xScale,
        yScale,
        0,
        0,
        1,
        false
      );
      ctx.putImageData(result.imageData, 0, 0);
    }

    addFrameUsingScales(ctx, xScale, yScale, 11);

    // Update and render vector field arrows
    const arrows = computeVectorFieldArrows({
      time: currentTime,
      xRange,
      yRange,
      dataPoint: currentPosition,
      noiseScheduler: currentScheduler,
      vectorFieldXScale: xScale,
      vectorFieldYScale: yScale,
      globalMaxVectorLength
    });

    for (const { startX, startY, dx, dy, normalizedLength } of arrows) {
      const endX = startX + dx;
      const endY = startY + dy;
      const color = viridis(normalizedLength);

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const angle = Math.atan2(dy, dx);
      const headLen = 5;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headLen * Math.cos(angle - Math.PI / 6),
        endY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        endX - headLen * Math.cos(angle + Math.PI / 6),
        endY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    }

    // Render data point (orange dot)
    dot.render(currentPosition);

    // Update and render sampled points
    if (vectorFieldInitialSamples.length > 0) {
      vectorFieldSampledPoints = propagateVectorFieldSamples({
        initialSamples: vectorFieldInitialSamples,
        time: currentTime,
        dataPoint: currentPosition,
        noiseScheduler: currentScheduler,
        vectorFieldXScale: xScale,
        vectorFieldYScale: yScale
      });

      vectorFieldSampledPoints.forEach(({ x, y }) => {
        addDot(ctx, x, y, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
      });
    }
  }

  // Sample button handler
  sampleBtn.addEventListener('click', () => {
    if (Math.abs(currentTime) < 0.01) {
      const { initialSamples, pixelSamples } = sampleStandardNormalPoints({
        count: NUM_SAMPLES,
        xScale,
        yScale
      });
      vectorFieldInitialSamples = initialSamples;
      vectorFieldSampledPoints = pixelSamples;
      update(currentPosition, currentTime, currentScheduler);
    }
  });

  // Clear button handler
  clearBtn.addEventListener('click', () => {
    vectorFieldSampledPoints = [];
    vectorFieldInitialSamples = [];
    update(currentPosition, currentTime, currentScheduler);
  });

  // Update button states
  function updateButtonStates(): void {
    sampleBtn.disabled = Math.abs(currentTime) >= 0.01;
    clearBtn.disabled = vectorFieldInitialSamples.length === 0;
  }

  // Initial computation
  recomputeGlobalMaxVectorLength();
  update(initialPosition, initialTime, initialScheduler);
  updateButtonStates();

  return (newPosition: Pair<number>, newTime: number, newScheduler: NoiseScheduler) => {
    update(newPosition, newTime, newScheduler);
    updateButtonStates();
  };
}

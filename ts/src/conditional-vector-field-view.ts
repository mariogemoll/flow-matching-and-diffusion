import {
  addFrameUsingScales, createMovableDot, defaultMargins, getContext
} from 'web-ui-common/canvas';
import { addCanvas } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import {
  computeGlobalMaxVectorLength,
  computeVectorFieldArrows,
  propagateVectorFieldSamples,
  sampleStandardNormalPoints
} from './conditional-tfjs-logic';
import { NUM_SAMPLES } from './constants';
import type { NoiseScheduler } from './math/noise-scheduler';
import {
  createSampleButtons,
  drawLines,
  drawSamplePoints,
  drawStandardNormalBackground
} from './vector-field-view-common';

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

  // Create sample/clear buttons
  const { updateButtonStates } = createSampleButtons({
    container,
    onSample: () => {
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
    },
    onClear: () => {
      vectorFieldSampledPoints = [];
      vectorFieldInitialSamples = [];
      update(currentPosition, currentTime, currentScheduler);
    }
  });

  function recomputeGlobalMaxVectorLength(): void {
    globalMaxVectorLength = computeGlobalMaxVectorLength({
      xRange,
      yRange,
      dataPoint: currentPosition,
      noiseScheduler: currentScheduler,
      vectorFieldXScale: xScale,
      vectorFieldYScale: yScale,
      gridSpacing: 0.3
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
    drawStandardNormalBackground(canvas, ctx, xScale, yScale, currentTime);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    // Update and render vector field lines
    const lines = computeVectorFieldArrows({
      time: currentTime,
      xRange,
      yRange,
      dataPoint: currentPosition,
      noiseScheduler: currentScheduler,
      vectorFieldXScale: xScale,
      vectorFieldYScale: yScale,
      globalMaxVectorLength,
      gridSpacing: 0.3
    });

    drawLines(ctx, lines);

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

      drawSamplePoints(ctx, vectorFieldSampledPoints);
    }
  }

  // Initial computation
  recomputeGlobalMaxVectorLength();
  update(initialPosition, initialTime, initialScheduler);
  updateButtonStates(currentTime, vectorFieldInitialSamples.length > 0);

  return (newPosition: Pair<number>, newTime: number, newScheduler: NoiseScheduler) => {
    update(newPosition, newTime, newScheduler);
    updateButtonStates(currentTime, vectorFieldInitialSamples.length > 0);
  };
}

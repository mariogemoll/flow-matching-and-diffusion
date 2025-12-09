import {
  addFrameUsingScales, createMovableDot, defaultMargins, getContext
} from 'web-ui-common/canvas';
import { addCanvas } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import {
  computeGlobalMaxVectorLength,
  computeVectorFieldArrows,
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
const NUM_TRAJECTORY_STEPS = 50;

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
  let precomputedTrajectories: Pair<number>[][] = [];
  let globalMaxVectorLength = 0;
  let showTrajectories = false;

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
      precomputedTrajectories = [];
      update(currentPosition, currentTime, currentScheduler);
    }
  });

  // Create checkbox for trajectory display
  const trajectoryCheckboxLabel = document.createElement('label');
  trajectoryCheckboxLabel.style.marginLeft = '12px';
  const trajectoryCheckbox = document.createElement('input');
  trajectoryCheckbox.type = 'checkbox';
  trajectoryCheckbox.checked = showTrajectories;
  trajectoryCheckboxLabel.appendChild(trajectoryCheckbox);
  trajectoryCheckboxLabel.appendChild(document.createTextNode(' Show trajectories'));
  container.appendChild(trajectoryCheckboxLabel);

  trajectoryCheckbox.addEventListener('change', () => {
    showTrajectories = trajectoryCheckbox.checked;
    update(currentPosition, currentTime, currentScheduler);
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

  function computeTrajectories(
    samples: [number, number][],
    dataPoint: Pair<number>,
    scheduler: NoiseScheduler
  ): Pair<number>[][] {
    const trajectories: Pair<number>[][] = [];

    for (const sample of samples) {
      const trajectory: Pair<number>[] = [];

      for (let step = 0; step <= NUM_TRAJECTORY_STEPS; step++) {
        const t = step / NUM_TRAJECTORY_STEPS;
        const alphaT = scheduler.getAlpha(t);
        const betaT = scheduler.getBeta(t);

        const x = alphaT * dataPoint[0] + betaT * sample[0];
        const y = alphaT * dataPoint[1] + betaT * sample[1];

        trajectory.push([x, y]);
      }

      trajectories.push(trajectory);
    }

    return trajectories;
  }

  function drawTrajectories(trajectories: Pair<number>[][]): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
    ctx.lineWidth = 1;

    for (const trajectory of trajectories) {
      if (trajectory.length < 2) {continue;}

      ctx.beginPath();
      const [x0, y0] = trajectory[0];
      ctx.moveTo(xScale(x0), yScale(y0));

      for (let i = 1; i < trajectory.length; i++) {
        const [x, y] = trajectory[i];
        ctx.lineTo(xScale(x), yScale(y));
      }

      ctx.stroke();
    }
    ctx.restore();
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

    // Compute trajectories if we have samples
    if (vectorFieldInitialSamples.length > 0) {
      precomputedTrajectories = computeTrajectories(
        vectorFieldInitialSamples,
        currentPosition,
        currentScheduler
      );

      // Draw trajectories if enabled
      if (showTrajectories) {
        drawTrajectories(precomputedTrajectories);
      }
    }

    // Render data point (orange dot)
    dot.render(currentPosition);

    // Update and render sampled points using trajectory data
    if (precomputedTrajectories.length > 0) {
      const timeStep = Math.round(currentTime * NUM_TRAJECTORY_STEPS);
      vectorFieldSampledPoints = precomputedTrajectories.map(trajectory => {
        const position = trajectory[Math.min(timeStep, trajectory.length - 1)];
        return {
          x: xScale(position[0]),
          y: yScale(position[1])
        };
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

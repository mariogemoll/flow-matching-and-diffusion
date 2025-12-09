import type * as tfType from '@tensorflow/tfjs';
import {
  addDot, addFrameUsingScales, defaultMargins, getContext
} from 'web-ui-common/canvas';
import { addCanvas } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import {
  computeGlobalMaxVectorLength,
  computeVectorFieldArrows,
  sampleStandardNormalPoints,
  type VectorFieldArrowData
} from './conditional-tfjs-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import type { WidgetView } from './framework-controller';
import type { NoiseScheduler } from './math/noise-scheduler';
import { drawLines } from './vector-field-view-common';

declare const tf: typeof tfType;

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';
const NUM_TIME_STEPS = 100;

interface ScoreParamState extends Record<string, unknown> {
  time: number;
  position: Pair<number>;
  scheduler: NoiseScheduler;
  schedulerType: string;
}

export function initPrecomputedVectorFieldView(
  container: HTMLElement
): WidgetView<ScoreParamState> {
  // Initialize WebGPU backend for TensorFlow.js
  void (async(): Promise<void> => {
    try {
      await tf.setBackend('webgpu');
      await tf.ready();
      console.log('WebGPU backend initialized');
    } catch (e) {
      console.warn('WebGPU not available, falling back to default backend:', e);
    }
  })();

  // Add a canvas element to the container
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let initialSamples: [number, number][] = [];
  let showTrajectories = false;
  let showVectorField = true;
  // Store precomputed trajectories: [sampleIndex][timeStep] -> [x, y]
  let precomputedTrajectories: Pair<number>[][] = [];
  // Store precomputed vector field arrows: [timeStep] -> arrows
  let precomputedVectorFields: VectorFieldArrowData[][] = [];
  // Track render version for early exit detection
  let currentRenderVersion = 0;

  // Sample initial points from standard normal
  const { initialSamples: samples } = sampleStandardNormalPoints({
    count: NUM_SAMPLES,
    xScale,
    yScale
  });
  initialSamples = samples;

  function precomputeTrajectories(
    dataPoint: Pair<number>,
    currentScheduler: NoiseScheduler
  ): Promise<void> {
    // Use TensorFlow.js to compute all trajectories at once
    const newTrajectories: Pair<number>[][] = tf.tidy(() => {
      // Create tensor for all samples: shape [NUM_SAMPLES, 2]
      const samplesTensor = tf.tensor2d(initialSamples);

      // Create tensor for data point: shape [2]
      const dataPointTensor = tf.tensor1d(dataPoint);

      // Compute all time steps at once
      const allTrajectories: Pair<number>[][] = initialSamples.map(() => []);

      // For each time step, compute all positions at once
      for (let step = 0; step <= NUM_TIME_STEPS; step++) {
        const t = step / NUM_TIME_STEPS;
        const alphaT = currentScheduler.getAlpha(t);
        const betaT = currentScheduler.getBeta(t);

        // Compute: alphaT * dataPoint + betaT * samples
        // This gives us all positions at this time step: shape [NUM_SAMPLES, 2]
        const positions = dataPointTensor.mul(alphaT).add(samplesTensor.mul(betaT));

        // Extract to sync array (since we're in tidy, this is fine)
        const positionsArray = positions.arraySync() as number[][];

        // Add to each trajectory
        positionsArray.forEach((position, index) => {
          allTrajectories[index].push(position as Pair<number>);
        });
      }

      return allTrajectories;
    });

    // Atomically replace with new trajectories
    precomputedTrajectories = newTrajectories;

    return Promise.resolve();
  }

  async function precomputeVectorFields(
    dataPoint: Pair<number>,
    currentScheduler: NoiseScheduler
  ): Promise<void> {
    // Compute global max vector length once
    const newGlobalMaxVectorLength = computeGlobalMaxVectorLength({
      xRange,
      yRange,
      dataPoint,
      noiseScheduler: currentScheduler,
      vectorFieldXScale: xScale,
      vectorFieldYScale: yScale,
      gridSpacing: 0.3
    });

    // Precompute vector fields for all time steps
    const newVectorFields: VectorFieldArrowData[][] = [];
    const BATCH_SIZE = 10; // Yield every N time steps

    for (let step = 0; step <= NUM_TIME_STEPS; step++) {
      const t = step / NUM_TIME_STEPS;
      const arrows = computeVectorFieldArrows({
        time: t,
        xRange,
        yRange,
        dataPoint,
        noiseScheduler: currentScheduler,
        vectorFieldXScale: xScale,
        vectorFieldYScale: yScale,
        globalMaxVectorLength: newGlobalMaxVectorLength,
        gridSpacing: 0.3
      });
      newVectorFields.push(arrows);

      // Yield control every BATCH_SIZE steps to keep UI responsive
      if ((step + 1) % BATCH_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Atomically replace with new vector fields
    precomputedVectorFields = newVectorFields;
  }

  // Single draw function: draws everything based on current state
  function draw(params: ScoreParamState): void {
    // Save canvas state
    ctx.save();

    // Clear the entire canvas using its actual dimensions
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    // Draw vector field (if enabled and data exists)
    if (showVectorField && precomputedVectorFields.length > 0) {
      const timeStep = Math.round(params.time * NUM_TIME_STEPS);
      if (timeStep < precomputedVectorFields.length) {
        const arrows = precomputedVectorFields[timeStep];
        drawLines(ctx, arrows);
      }
    }

    // Draw trajectories (if enabled and data exists)
    if (showTrajectories && precomputedTrajectories.length > 0) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
      ctx.lineWidth = 1;

      for (const trajectory of precomputedTrajectories) {
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
    }

    // Draw sampled points (if trajectory data exists)
    if (precomputedTrajectories.length > 0) {
      const timeStep = Math.round(params.time * NUM_TIME_STEPS);
      for (const trajectory of precomputedTrajectories) {
        if (timeStep < trajectory.length) {
          const position = trajectory[timeStep];
          const px = xScale(position[0]);
          const py = yScale(position[1]);
          addDot(ctx, px, py, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
        }
      }
    }

    // Draw the data point (always)
    const pixelX = xScale(params.position[0]);
    const pixelY = yScale(params.position[1]);
    addDot(ctx, pixelX, pixelY, 5, ORANGE);

    // Restore canvas state
    ctx.restore();
  }

  // Create controls container
  const controlsDiv = document.createElement('div');
  controlsDiv.style.marginTop = '8px';
  container.appendChild(controlsDiv);

  // Create checkbox for vector field display
  const vectorFieldCheckboxLabel = document.createElement('label');
  const vectorFieldCheckbox = document.createElement('input');
  vectorFieldCheckbox.type = 'checkbox';
  vectorFieldCheckbox.checked = showVectorField;
  vectorFieldCheckboxLabel.appendChild(vectorFieldCheckbox);
  vectorFieldCheckboxLabel.appendChild(document.createTextNode(' Show vector field'));
  controlsDiv.appendChild(vectorFieldCheckboxLabel);

  // Create checkbox for trajectory display
  const trajectoryCheckboxLabel = document.createElement('label');
  trajectoryCheckboxLabel.style.marginLeft = '12px';
  const trajectoryCheckbox = document.createElement('input');
  trajectoryCheckbox.type = 'checkbox';
  trajectoryCheckbox.checked = showTrajectories;
  trajectoryCheckboxLabel.appendChild(trajectoryCheckbox);
  trajectoryCheckboxLabel.appendChild(document.createTextNode(' Show trajectories'));
  controlsDiv.appendChild(trajectoryCheckboxLabel);

  let lastPosition: Pair<number> | null = null;
  let lastScheduler: NoiseScheduler | null = null;

  vectorFieldCheckbox.addEventListener('change', () => {
    showVectorField = vectorFieldCheckbox.checked;
    if (lastPosition && lastScheduler) {
      // If enabling, precompute if needed
      if (showVectorField && precomputedVectorFields.length === 0) {
        void precomputeVectorFields(lastPosition, lastScheduler).then(() => {
          if (lastPosition && lastScheduler) {
            draw({
              time: 0,
              position: lastPosition,
              scheduler: lastScheduler,
              schedulerType: ''
            });
          }
        });
      } else {
        draw({
          time: 0,
          position: lastPosition,
          scheduler: lastScheduler,
          schedulerType: ''
        });
      }
    }
  });

  trajectoryCheckbox.addEventListener('change', () => {
    showTrajectories = trajectoryCheckbox.checked;
    if (lastPosition && lastScheduler) {
      draw({
        time: 0,
        position: lastPosition,
        scheduler: lastScheduler,
        schedulerType: ''
      });
    }
  });

  return {
    render: (params: ScoreParamState): void => {
      // Increment render version for early exit detection
      const renderVersion = ++currentRenderVersion;

      // Recompute trajectories and vector fields if position or scheduler changed
      const positionChanged =
        !lastPosition ||
        lastPosition[0] !== params.position[0] ||
        lastPosition[1] !== params.position[1];
      const schedulerChanged = lastScheduler !== params.scheduler;

      if (positionChanged || schedulerChanged) {
        // Do staged computation and rendering in background
        void (async(): Promise<void> => {
          // Stage 1: Precompute trajectories, then draw
          await precomputeTrajectories(params.position, params.scheduler);

          // Check if a newer render was requested
          if (renderVersion !== currentRenderVersion) {
            return; // Early exit
          }

          lastPosition = params.position;
          lastScheduler = params.scheduler;

          // Draw with new trajectory data (dot, dots, trajectories)
          draw(params);

          // Stage 2: Precompute vector field (if enabled), then draw
          if (showVectorField) {
            await precomputeVectorFields(params.position, params.scheduler);

            // Check if a newer render was requested
            if (renderVersion !== currentRenderVersion) {
              return; // Early exit
            }

            // Draw with new vector field data
            draw(params);
          }
        })();
        // Return immediately - don't wait for any precomputation
      } else {
        // No recomputation needed, just draw with current data
        draw(params);
      }
    }
  };
}

import {
  addDot, addFrameUsingScales, createMovableDot, defaultMargins, getContext
} from 'web-ui-common/canvas';
import { addCanvas } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import {
  computeGaussianParams,
  renderGaussianFrame,
  sampleGaussianPoints
} from './conditional-tfjs-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import type { NoiseScheduler } from './math/noise-scheduler';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';

export function initConditionalProbabilityPathView(
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

  // Create sample continuously checkbox
  const sampleContinuouslyLabel = document.createElement('label');
  sampleContinuouslyLabel.style.marginLeft = '12px';
  const sampleContinuouslyCheckbox = document.createElement('input');
  sampleContinuouslyCheckbox.type = 'checkbox';
  sampleContinuouslyLabel.appendChild(sampleContinuouslyCheckbox);
  sampleContinuouslyLabel.appendChild(document.createTextNode(' Sample continuously'));
  controlsDiv.appendChild(sampleContinuouslyLabel);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let sampledPoints: { x: number; y: number }[] = [];

  let currentPosition = initialPosition;
  let currentTime = initialTime;
  let currentScheduler = initialScheduler;

  // Create movable dot for the data point first
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

  function update(newPosition: Pair<number>, newTime: number, newScheduler: NoiseScheduler): void {
    // Clear samples if position or time changed
    const positionChanged =
      newPosition[0] !== currentPosition[0] || newPosition[1] !== currentPosition[1];
    const timeChanged = newTime !== currentTime;
    const schedulerChanged = newScheduler !== currentScheduler;
    if (positionChanged || timeChanged || schedulerChanged) {
      sampledPoints = [];
    }

    currentPosition = newPosition;
    currentTime = newTime;
    currentScheduler = newScheduler;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute Gaussian parameters based on time
    const { mean, variance } = computeGaussianParams(newScheduler, newPosition, newTime);

    // Sample continuously if checkbox is checked
    if (sampleContinuouslyCheckbox.checked) {
      const sd = Math.sqrt(variance);
      sampledPoints = sampleGaussianPoints({
        mean,
        standardDeviation: sd,
        count: NUM_SAMPLES,
        xScale,
        yScale
      });
    }

    // Render Gaussian PDF
    const imageData = renderGaussianFrame({
      canvas,
      ctx,
      xScale,
      yScale,
      mean,
      variance,
      withContours: false
    });
    ctx.putImageData(imageData, 0, 0);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    // Render the data point
    dot.render(newPosition);

    // Render sampled points
    sampledPoints.forEach(({ x, y }) => {
      addDot(ctx, x, y, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    });
  }

  // Sample button handler
  sampleBtn.addEventListener('click', () => {
    const { mean, variance } = computeGaussianParams(
      currentScheduler, currentPosition, currentTime
    );
    const sd = Math.sqrt(variance);
    sampledPoints = sampleGaussianPoints({
      mean,
      standardDeviation: sd,
      count: NUM_SAMPLES,
      xScale,
      yScale
    });
    update(currentPosition, currentTime, currentScheduler);
  });

  // Sample continuously checkbox handler
  sampleContinuouslyCheckbox.addEventListener('change', () => {
    if (sampleContinuouslyCheckbox.checked) {
      // Trigger a sample when checkbox is enabled
      update(currentPosition, currentTime, currentScheduler);
    }
  });

  // Initial render
  update(initialPosition, initialTime, initialScheduler);

  return update;
}

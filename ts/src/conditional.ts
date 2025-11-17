import {
  addDot, addFrameUsingScales, createMovableDot, defaultMargins,getContext
} from 'web-ui-common/canvas';
import { addCanvas, el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import {
  computeGaussianParams, renderGaussianFrame, sampleGaussianPoints
} from './conditional-tfjs-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { linearNoiseScheduler } from './noise-schedulers';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';

function initMovableDotWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  onChange: (position: Pair<number>) => void
): (position: Pair<number>) => void {
  // Add a canvas element to the container
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  function update(newPosition: Pair<number>): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    addFrameUsingScales(ctx, xScale, yScale, 11);
    dot.render(newPosition);
  }

  // Create movable dot
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

  update(initialPosition);

  return update;
}

function initConditionalProbabilityPathWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  onChange: (position: Pair<number>) => void,
  time: number,
  sampleBtn: HTMLButtonElement,
  sampleContinuouslyCheckbox: HTMLInputElement
): (position: Pair<number>, time: number, clearSamples?: boolean) => void {
  // Add a canvas element to the container
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let sampledPoints: { x: number; y: number }[] = [];

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
      onChange: (newPosition) => {
        sampledPoints = [];
        onChange(newPosition);
      }
    }
  );

  let currentPosition = initialPosition;
  let currentTime = time;

  function update(newPosition: Pair<number>, newTime: number, clearSamples = false): void {
    currentPosition = newPosition;
    currentTime = newTime;

    // Clear samples if requested (e.g., when slider moves)
    if (clearSamples) {
      sampledPoints = [];
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute Gaussian parameters based on time
    const { mean, variance } = computeGaussianParams(linearNoiseScheduler, newPosition, newTime);

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
      linearNoiseScheduler, currentPosition, currentTime
    );
    const sd = Math.sqrt(variance);
    sampledPoints = sampleGaussianPoints({
      mean,
      standardDeviation: sd,
      count: NUM_SAMPLES,
      xScale,
      yScale
    });
    update(currentPosition, currentTime);
  });

  // Sample continuously checkbox handler
  sampleContinuouslyCheckbox.addEventListener('change', () => {
    if (sampleContinuouslyCheckbox.checked) {
      // Trigger a sample when checkbox is enabled
      update(currentPosition, currentTime);
    }
  });

  // Initial render
  update(initialPosition, time);

  return update;
}

function run(): void {
  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;
  const timeSlider = el(document, '#timeSlider') as HTMLInputElement;
  const timeValue = el(document, '#timeValue') as HTMLSpanElement;
  const sampleBtn = el(document, '#sampleBtn') as HTMLButtonElement;
  const sampleContinuouslyCheckbox = el(document, '#sampleContinuously') as HTMLInputElement;

  let currentPosition: Pair<number> = [1, 0.5];
  let currentTime = 0;

  // Initialize widgets first
  // eslint-disable-next-line prefer-const
  let updateWidgetA: (position: Pair<number>) => void;
  // eslint-disable-next-line prefer-const
  let updateWidgetB: (position: Pair<number>, time: number, clearSamples?: boolean) => void;

  function update(newPosition: Pair<number>): void {
    currentPosition = newPosition;
    updateWidgetA(currentPosition);
    updateWidgetB(currentPosition, currentTime);
  }

  function updateTime(newTime: number): void {
    currentTime = newTime;
    timeValue.textContent = newTime.toFixed(2);
    updateWidgetB(currentPosition, currentTime, true); // Always clear samples when slider moves
  }

  updateWidgetA = initMovableDotWidget(containerA, currentPosition, update);
  updateWidgetB = initConditionalProbabilityPathWidget(
    containerB, currentPosition, update, currentTime, sampleBtn, sampleContinuouslyCheckbox
  );

  // Time slider event
  timeSlider.addEventListener('input', () => {
    const newTime = parseFloat(timeSlider.value);
    updateTime(newTime);
  });
}

run();

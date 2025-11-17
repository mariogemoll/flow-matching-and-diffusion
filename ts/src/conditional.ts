import {
  addFrameUsingScales, createMovableDot, defaultMargins,getContext
} from 'web-ui-common/canvas';
import { addCanvas, el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { computeGaussianParams, renderGaussianFrame } from './conditional-tfjs-logic';
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
  time: number
): (position: Pair<number>, time: number) => void {
  // Add a canvas element to the container
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

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

  function update(newPosition: Pair<number>, newTime: number): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute Gaussian parameters based on time
    const { mean, variance } = computeGaussianParams(linearNoiseScheduler, newPosition, newTime);

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

    // Render the data point (blue dot)
    dot.render(newPosition);
  }

  // Initial render
  update(initialPosition, time);

  return update;
}

function run(): void {
  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;
  const timeSlider = el(document, '#timeSlider') as HTMLInputElement;
  const timeValue = el(document, '#timeValue') as HTMLSpanElement;

  let currentPosition: Pair<number> = [1, 0.5];
  let currentTime = 0;

  // Initialize widgets first
  // eslint-disable-next-line prefer-const
  let updateWidgetA: (position: Pair<number>) => void;
  // eslint-disable-next-line prefer-const
  let updateWidgetB: (position: Pair<number>, time: number) => void;

  function update(newPosition: Pair<number>): void {
    currentPosition = newPosition;
    updateWidgetA(currentPosition);
    updateWidgetB(currentPosition, currentTime);
  }

  function updateTime(newTime: number): void {
    currentTime = newTime;
    timeValue.textContent = newTime.toFixed(2);
    updateWidgetB(currentPosition, currentTime);
  }

  updateWidgetA = initMovableDotWidget(containerA, currentPosition, update);
  updateWidgetB = initConditionalProbabilityPathWidget(
    containerB, currentPosition, update, currentTime
  );

  // Time slider event
  timeSlider.addEventListener('input', () => {
    const newTime = parseFloat(timeSlider.value);
    updateTime(newTime);
  });
}

run();

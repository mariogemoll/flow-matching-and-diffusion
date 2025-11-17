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

function initTimeSliderWidget(
  container: HTMLElement,
  initialTime: number,
  onChange: (time: number) => void
): (time: number) => void {
  // Create time slider container
  const sliderDiv = document.createElement('div');
  sliderDiv.style.marginTop = '16px';
  container.appendChild(sliderDiv);

  // Create time slider
  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.min = '0';
  timeSlider.max = '1';
  timeSlider.step = '0.01';
  timeSlider.value = initialTime.toString();
  timeSlider.style.width = '320px';
  sliderDiv.appendChild(timeSlider);

  // Create time value display
  const timeValue = document.createElement('span');
  timeValue.textContent = initialTime.toFixed(2);
  timeValue.style.marginLeft = '8px';
  sliderDiv.appendChild(timeValue);

  let currentTime = initialTime;

  // Time slider event handler
  timeSlider.addEventListener('input', () => {
    const newTime = parseFloat(timeSlider.value);
    currentTime = newTime;
    timeValue.textContent = newTime.toFixed(2);
    onChange(newTime);
  });

  function update(newTime: number): void {
    currentTime = newTime;
    timeSlider.value = newTime.toString();
    timeValue.textContent = newTime.toFixed(2);
  }

  return update;
}

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
  initialTime: number,
  onChange: (position: Pair<number>) => void
): (position: Pair<number>, time: number) => void {
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
    // Clear samples if position or time changed
    const positionChanged = newPosition[0] !== currentPosition[0] || newPosition[1] !== currentPosition[1];
    const timeChanged = newTime !== currentTime;
    if (positionChanged || timeChanged) {
      sampledPoints = [];
    }

    currentPosition = newPosition;
    currentTime = newTime;

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
  update(initialPosition, initialTime);

  return update;
}

function run(): void {
  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;
  const containerC = el(document, '#containerC') as HTMLElement;

  let currentPosition: Pair<number> = [1, 0.5];
  let currentTime = 0;

  // eslint-disable-next-line prefer-const
  let updateWidgetA: (position: Pair<number>) => void;
  // eslint-disable-next-line prefer-const
  let updateWidgetB: (position: Pair<number>, time: number) => void;
  // eslint-disable-next-line prefer-const
  let updateWidgetC: (position: Pair<number>, time: number) => void;
  // eslint-disable-next-line prefer-const
  let updateTimeSliderB: (time: number) => void;
  // eslint-disable-next-line prefer-const
  let updateTimeSliderC: (time: number) => void;

  function onPositionChange(newPosition: Pair<number>): void {
    currentPosition = newPosition;
    updateWidgetA(currentPosition);
    updateWidgetB(currentPosition, currentTime);
    updateWidgetC(currentPosition, currentTime);
  }

  function onTimeChange(newTime: number): void {
    currentTime = newTime;
    updateWidgetB(currentPosition, currentTime);
    updateWidgetC(currentPosition, currentTime);
    updateTimeSliderB(currentTime);
    updateTimeSliderC(currentTime);
  }

  updateWidgetA = initMovableDotWidget(containerA, currentPosition, onPositionChange);
  updateWidgetB = initConditionalProbabilityPathWidget(
    containerB, currentPosition, currentTime, onPositionChange
  );
  updateWidgetC = initConditionalProbabilityPathWidget(
    containerC, currentPosition, currentTime, onPositionChange
  );
  updateTimeSliderB = initTimeSliderWidget(containerB, currentTime, onTimeChange);
  updateTimeSliderC = initTimeSliderWidget(containerC, currentTime, onTimeChange);
}

run();

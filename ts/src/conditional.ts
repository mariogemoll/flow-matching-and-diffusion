import {
  addDot, addFrameUsingScales, createMovableDot, defaultMargins,getContext
} from 'web-ui-common/canvas';
import { addCanvas, el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import {
  computeGaussianParams,
  computeGlobalMaxVectorLength,
  computeVectorFieldArrows,
  propagateVectorFieldSamples,
  renderGaussianFrame,
  sampleGaussianPoints,
  sampleStandardNormalPoints
} from './conditional-tfjs-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { computeGaussianPdfTfjs } from './gaussian-tf';
import { linearNoiseScheduler, linearNoiseSchedulerDerivative } from './noise-schedulers';

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

  // Time slider event handler
  timeSlider.addEventListener('input', () => {
    const newTime = parseFloat(timeSlider.value);
    timeValue.textContent = newTime.toFixed(2);
    onChange(newTime);
  });

  function update(newTime: number): void {
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

function initConditionalProbabilityPathView(
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
    const positionChanged =
      newPosition[0] !== currentPosition[0] || newPosition[1] !== currentPosition[1];
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

function initVectorFieldView(
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
      noiseScheduler: linearNoiseScheduler,
      noiseSchedulerDerivative: linearNoiseSchedulerDerivative,
      vectorFieldXScale: xScale,
      vectorFieldYScale: yScale
    });
  }

  function update(newPosition: Pair<number>, newTime: number): void {
    currentPosition = newPosition;
    currentTime = newTime;

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
      noiseScheduler: linearNoiseScheduler,
      noiseSchedulerDerivative: linearNoiseSchedulerDerivative,
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
        noiseScheduler: linearNoiseScheduler,
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
      update(currentPosition, currentTime);
    }
  });

  // Clear button handler
  clearBtn.addEventListener('click', () => {
    vectorFieldSampledPoints = [];
    vectorFieldInitialSamples = [];
    update(currentPosition, currentTime);
  });

  // Update button states
  function updateButtonStates(): void {
    sampleBtn.disabled = Math.abs(currentTime) >= 0.01;
    clearBtn.disabled = vectorFieldInitialSamples.length === 0;
  }

  // Initial computation
  recomputeGlobalMaxVectorLength();
  update(initialPosition, initialTime);
  updateButtonStates();

  return (newPosition: Pair<number>, newTime: number) => {
    update(newPosition, newTime);
    updateButtonStates();
  };
}

function initConditionalProbPathWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number
): void {
  let currentPosition = initialPosition;
  let currentTime = initialTime;

  const updateView = initConditionalProbabilityPathView(
    container,
    initialPosition,
    initialTime,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateView(currentPosition, currentTime);
    }
  );
  const updateSlider = initTimeSliderWidget(container, initialTime, (newTime: number) => {
    currentTime = newTime;
    updateView(currentPosition, currentTime);
    updateSlider(currentTime);
  });
}

function initConditionalProbPathAndVectorFieldWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number
): void {
  let currentPosition = initialPosition;
  let currentTime = initialTime;

  // Create a container for side-by-side views
  const viewsContainer = document.createElement('div');
  viewsContainer.style.display = 'flex';
  viewsContainer.style.gap = '16px';
  container.appendChild(viewsContainer);

  const leftContainer = document.createElement('div');
  const rightContainer = document.createElement('div');
  viewsContainer.appendChild(leftContainer);
  viewsContainer.appendChild(rightContainer);

  const updateCondProbView = initConditionalProbabilityPathView(
    leftContainer,
    initialPosition,
    initialTime,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateCondProbView(currentPosition, currentTime);
      updateVectorFieldView(currentPosition, currentTime);
    }
  );
  const updateVectorFieldView = initVectorFieldView(
    rightContainer,
    initialPosition,
    initialTime,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateCondProbView(currentPosition, currentTime);
      updateVectorFieldView(currentPosition, currentTime);
    }
  );
  const updateSlider = initTimeSliderWidget(container, initialTime, (newTime: number) => {
    currentTime = newTime;
    updateCondProbView(currentPosition, currentTime);
    updateVectorFieldView(currentPosition, currentTime);
    updateSlider(currentTime);
  });
}

function run(): void {
  const containerA = el(document, '#containerA') as HTMLElement;
  const containerB = el(document, '#containerB') as HTMLElement;
  const containerC = el(document, '#containerC') as HTMLElement;

  const initialPosition: Pair<number> = [1.0, 0.5];
  const initialTime = 0;

  // Widget A with its own controller
  const updateWidgetA = initMovableDotWidget(containerA, initialPosition, (newPosition) => {
    updateWidgetA(newPosition);
  });

  initConditionalProbPathWidget(containerB, initialPosition, initialTime);
  initConditionalProbPathAndVectorFieldWidget(containerC, initialPosition, initialTime);
}

run();

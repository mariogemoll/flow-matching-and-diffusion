import {
  addFrameUsingScales, createMovableDot, defaultMargins,getContext
} from 'web-ui-common/canvas';
import { addCanvas, removePlaceholder } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { initConditionalProbabilityPathView } from './conditional-probability-path-view';
import { initVectorFieldView } from './conditional-vector-field-view';
import {
  makeCircularCircularScheduler,
  makeConstantVarianceScheduler,
  makeInverseSqrtNoiseScheduler,
  makeLinearNoiseScheduler,
  makeSqrtNoiseScheduler,
  makeSqrtSqrtScheduler,
  type NoiseScheduler
} from './math/noise-scheduler';
import { initNoiseSchedulerWidget } from './noise-scheduler-widget';
import { initTimeSliderWidget } from './time-slider';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';

export function initMovableDotWidget(
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

export function initConditionalPathWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number
): void {
  removePlaceholder(container);
  let currentPosition = initialPosition;
  let currentTime = initialTime;
  let currentScheduler: NoiseScheduler = makeConstantVarianceScheduler();

  // Canvas container (view)
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'conditional-path';
  container.appendChild(canvasContainer);

  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls';
  container.appendChild(controlsContainer);

  // Scheduler section
  const schedulerSection = document.createElement('div');
  schedulerSection.className = 'schedule-controls';
  controlsContainer.appendChild(schedulerSection);

  // Initialize combined noise scheduler widget
  const updateScheduler = initNoiseSchedulerWidget(schedulerSection, (schedulerType: string) => {
    if (schedulerType === 'linear') {
      currentScheduler = makeLinearNoiseScheduler();
    } else if (schedulerType === 'sqrt') {
      currentScheduler = makeSqrtNoiseScheduler();
    } else if (schedulerType === 'inverse-sqrt') {
      currentScheduler = makeInverseSqrtNoiseScheduler();
    } else if (schedulerType === 'constant') {
      currentScheduler = makeConstantVarianceScheduler();
    } else if (schedulerType === 'sqrt-sqrt') {
      currentScheduler = makeSqrtSqrtScheduler();
    } else if (schedulerType === 'circular-circular') {
      currentScheduler = makeCircularCircularScheduler();
    }
    updateView(currentPosition, currentTime, currentScheduler);
    updateScheduler(currentScheduler, currentTime);
  });

  const updateView = initConditionalProbabilityPathView(
    canvasContainer,
    initialPosition,
    initialTime,
    currentScheduler,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateView(currentPosition, currentTime, currentScheduler);
    }
  );
  void initTimeSliderWidget(container, initialTime, (newTime: number) => {
    currentTime = newTime;
    updateView(currentPosition, currentTime, currentScheduler);
    updateScheduler(currentScheduler, currentTime);
  });

  // Initial render
  updateScheduler(currentScheduler, currentTime);
}

export function initConditionalPathOdeWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number
): void {
  removePlaceholder(container);
  let currentPosition = initialPosition;
  let currentTime = initialTime;
  let currentScheduler: NoiseScheduler = makeConstantVarianceScheduler();

  // Canvas containers (views)
  const leftContainer = document.createElement('div');
  leftContainer.className = 'conditional-path';
  container.appendChild(leftContainer);

  const rightContainer = document.createElement('div');
  rightContainer.className = 'conditional-vector-field';
  container.appendChild(rightContainer);

  // Scheduler section
  const schedulerSection = document.createElement('div');
  schedulerSection.className = 'schedule-controls';
  container.appendChild(schedulerSection);

  // Initialize combined noise scheduler widget
  const updateScheduler = initNoiseSchedulerWidget(schedulerSection, (schedulerType: string) => {
    if (schedulerType === 'linear') {
      currentScheduler = makeLinearNoiseScheduler();
    } else if (schedulerType === 'sqrt') {
      currentScheduler = makeSqrtNoiseScheduler();
    } else if (schedulerType === 'inverse-sqrt') {
      currentScheduler = makeInverseSqrtNoiseScheduler();
    } else if (schedulerType === 'constant') {
      currentScheduler = makeConstantVarianceScheduler();
    } else if (schedulerType === 'sqrt-sqrt') {
      currentScheduler = makeSqrtSqrtScheduler();
    } else if (schedulerType === 'circular-circular') {
      currentScheduler = makeCircularCircularScheduler();
    }
    updateCondProbView(currentPosition, currentTime, currentScheduler);
    updateVectorFieldView(currentPosition, currentTime, currentScheduler);
    updateScheduler(currentScheduler, currentTime);
  });

  const updateCondProbView = initConditionalProbabilityPathView(
    leftContainer,
    initialPosition,
    initialTime,
    currentScheduler,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateCondProbView(currentPosition, currentTime, currentScheduler);
      updateVectorFieldView(currentPosition, currentTime, currentScheduler);
    }
  );
  const updateVectorFieldView = initVectorFieldView(
    rightContainer,
    initialPosition,
    initialTime,
    currentScheduler,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateCondProbView(currentPosition, currentTime, currentScheduler);
      updateVectorFieldView(currentPosition, currentTime, currentScheduler);
    }
  );
  void initTimeSliderWidget(container, initialTime, (newTime: number) => {
    currentTime = newTime;
    updateCondProbView(currentPosition, currentTime, currentScheduler);
    updateVectorFieldView(currentPosition, currentTime, currentScheduler);
    updateScheduler(currentScheduler, currentTime);
  });

  // Initial render
  updateScheduler(currentScheduler, currentTime);
}

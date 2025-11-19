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
import { initSchedulerSelectionWidget } from './scheduler-selection';
import { initSchedulerVisualizationWidget } from './scheduler-visualization';
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

export function initConditionalProbPathWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number,
  radioGroupName?: string
): void {
  removePlaceholder(container);
  let currentPosition = initialPosition;
  let currentTime = initialTime;
  let currentScheduler: NoiseScheduler = makeConstantVarianceScheduler();

  // Create main layout structure
  const mainDiv = document.createElement('div');
  mainDiv.style.display = 'flex';
  mainDiv.style.gap = '20px';
  container.appendChild(mainDiv);

  // Left section (view)
  const leftSection = document.createElement('div');
  mainDiv.appendChild(leftSection);

  // Right section (scheduler visualization and selection)
  const rightSection = document.createElement('div');
  rightSection.style.display = 'flex';
  rightSection.style.flexDirection = 'column';
  rightSection.style.gap = '10px';
  mainDiv.appendChild(rightSection);

  // Initialize scheduler visualization
  const updateSchedulerVisualization = initSchedulerVisualizationWidget(rightSection);

  // Initialize scheduler selection
  initSchedulerSelectionWidget(rightSection, (schedulerType: string) => {
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
    updateSchedulerVisualization(currentScheduler, currentTime);
  }, radioGroupName);

  const updateView = initConditionalProbabilityPathView(
    leftSection,
    initialPosition,
    initialTime,
    currentScheduler,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      updateView(currentPosition, currentTime, currentScheduler);
    }
  );
  const updateSlider = initTimeSliderWidget(container, initialTime, (newTime: number) => {
    currentTime = newTime;
    updateView(currentPosition, currentTime, currentScheduler);
    updateSchedulerVisualization(currentScheduler, currentTime);
    updateSlider(currentTime);
  });

  // Initial render
  updateSchedulerVisualization(currentScheduler, currentTime);
}

export function initConditionalProbPathAndVectorFieldWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number,
  radioGroupName?: string
): void {
  removePlaceholder(container);
  let currentPosition = initialPosition;
  let currentTime = initialTime;
  let currentScheduler: NoiseScheduler = makeConstantVarianceScheduler();

  // Create main layout structure
  const mainDiv = document.createElement('div');
  mainDiv.style.display = 'flex';
  mainDiv.style.gap = '20px';
  container.appendChild(mainDiv);

  // Create a container for side-by-side views
  const viewsContainer = document.createElement('div');
  viewsContainer.style.display = 'flex';
  viewsContainer.style.gap = '16px';
  mainDiv.appendChild(viewsContainer);

  const leftContainer = document.createElement('div');
  const rightContainer = document.createElement('div');
  viewsContainer.appendChild(leftContainer);
  viewsContainer.appendChild(rightContainer);

  // Right section (scheduler visualization and selection)
  const schedulerSection = document.createElement('div');
  schedulerSection.style.display = 'flex';
  schedulerSection.style.flexDirection = 'column';
  schedulerSection.style.gap = '10px';
  mainDiv.appendChild(schedulerSection);

  // Initialize scheduler visualization
  const updateSchedulerVisualization = initSchedulerVisualizationWidget(schedulerSection);

  // Initialize scheduler selection
  initSchedulerSelectionWidget(schedulerSection, (schedulerType: string) => {
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
    updateSchedulerVisualization(currentScheduler, currentTime);
  }, radioGroupName);

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
  const updateSlider = initTimeSliderWidget(container, initialTime, (newTime: number) => {
    currentTime = newTime;
    updateCondProbView(currentPosition, currentTime, currentScheduler);
    updateVectorFieldView(currentPosition, currentTime, currentScheduler);
    updateSchedulerVisualization(currentScheduler, currentTime);
    updateSlider(currentTime);
  });

  // Initial render
  updateSchedulerVisualization(currentScheduler, currentTime);
}

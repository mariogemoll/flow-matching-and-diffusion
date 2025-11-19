import {
  addFrameUsingScales, createMovableDot, defaultMargins,getContext
} from 'web-ui-common/canvas';
import { addCanvas, removePlaceholder } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { initConditionalProbabilityPathView } from './conditional-probability-path-view';
import { initVectorFieldView } from './conditional-vector-field-view';
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
  initialTime: number
): void {
  removePlaceholder(container);
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

export function initConditionalProbPathAndVectorFieldWidget(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number
): void {
  removePlaceholder(container);
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

import { el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';

import { initConditionalProbabilityPathView } from './conditional-probability-path-view';
import { makeConstantVarianceScheduler } from './math/noise-scheduler';
import { initTimeSliderWidget } from './time-slider';

interface NumberWidgetControls {
  update: (value: number) => void;
}

function initNumberWidget(
  container: HTMLElement,
  label: string,
  initialValue: number
): NumberWidgetControls {
  // Create widget container
  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'number-widget';
  container.appendChild(widgetDiv);

  // Create label
  const labelDiv = document.createElement('div');
  labelDiv.className = 'widget-label';
  labelDiv.textContent = label;
  widgetDiv.appendChild(labelDiv);

  // Create value display
  const valueDiv = document.createElement('div');
  valueDiv.className = 'widget-value';
  valueDiv.textContent = initialValue.toFixed(2);
  widgetDiv.appendChild(valueDiv);

  function update(value: number): void {
    valueDiv.textContent = value.toFixed(2);
  }

  return { update };
}

function run(): void {
  const widgetsContainer = el(document, '#widgets-container') as HTMLElement;
  const sliderContainer = el(document, '#slider-container') as HTMLElement;

  // Create container for widgets row
  const widgetRow = document.createElement('div');
  widgetRow.className = 'widget-container';
  widgetsContainer.appendChild(widgetRow);

  // Initialize conditional probability path view (first widget)
  const initialPosition: Pair<number> = [0, 0];
  const initialTime = 0;
  const scheduler = makeConstantVarianceScheduler();

  const condProbContainer = document.createElement('div');
  widgetRow.appendChild(condProbContainer);

  let currentPosition = initialPosition;
  const updateCondProbView = initConditionalProbabilityPathView(
    condProbContainer,
    initialPosition,
    initialTime,
    scheduler,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      // Re-render with current time when position changes
      updateCondProbView(currentPosition, currentTime, scheduler);
    }
  );

  // Initialize two number widgets
  const widget2 = initNumberWidget(widgetRow, 'Widget 2', 0);
  const widget3 = initNumberWidget(widgetRow, 'Widget 3', 0);

  let currentTime = initialTime;

  // Update function that will be called when time changes
  function updateWidgets(time: number): void {
    currentTime = time;

    // Update conditional probability path view
    updateCondProbView(currentPosition, currentTime, scheduler);

    // Widget 2: displays a sine wave based on time
    const value2 = Math.sin(time * Math.PI * 2);
    widget2.update(value2);

    // Widget 3: displays a quadratic function
    const value3 = time * time;
    widget3.update(value3);
  }

  // Initialize time slider
  initTimeSliderWidget(sliderContainer, 0, updateWidgets, {
    loop: true,
    autostart: false
  });

  // Initial update
  updateWidgets(0);
}

run();

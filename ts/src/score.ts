import { el } from 'web-ui-common/dom';

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

  // Initialize three number widgets
  const widget1 = initNumberWidget(widgetRow, 'Widget 1', 0);
  const widget2 = initNumberWidget(widgetRow, 'Widget 2', 0);
  const widget3 = initNumberWidget(widgetRow, 'Widget 3', 0);

  // Update function that will be called when time changes
  function updateWidgets(time: number): void {
    // Widget 1: displays the time value
    widget1.update(time);

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

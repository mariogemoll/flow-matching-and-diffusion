import { el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';

import { initConditionalProbabilityPath } from './conditional-probability-path';
import { initVectorFieldView } from './conditional-vector-field-view';
import { createFrameworkController } from './framework-controller';
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

interface ScoreParamState extends Record<string, unknown> {
  time: number;
  position: Pair<number>;
  scheduler: NoiseScheduler;
  schedulerType: string;
}

function getScheduler(schedulerType: string): NoiseScheduler {
  if (schedulerType === 'linear') {
    return makeLinearNoiseScheduler();
  } else if (schedulerType === 'sqrt') {
    return makeSqrtNoiseScheduler();
  } else if (schedulerType === 'inverse-sqrt') {
    return makeInverseSqrtNoiseScheduler();
  } else if (schedulerType === 'constant') {
    return makeConstantVarianceScheduler();
  } else if (schedulerType === 'sqrt-sqrt') {
    return makeSqrtSqrtScheduler();
  } else if (schedulerType === 'circular-circular') {
    return makeCircularCircularScheduler();
  }
  return makeConstantVarianceScheduler();
}

function run(): void {
  const widgetsContainer = el(document, '#widgets-container') as HTMLElement;
  const sliderContainer = el(document, '#slider-container') as HTMLElement;

  // Create main layout container
  const mainLayout = document.createElement('div');
  mainLayout.style.display = 'flex';
  mainLayout.style.gap = '20px';
  widgetsContainer.appendChild(mainLayout);

  // Create left side for widgets
  const leftSide = document.createElement('div');
  leftSide.style.flex = '1';
  mainLayout.appendChild(leftSide);

  // Create right side for scheduler controls
  const rightSide = document.createElement('div');
  rightSide.style.width = '200px';
  rightSide.style.display = 'flex';
  rightSide.style.flexDirection = 'column';
  rightSide.style.gap = '16px';
  mainLayout.appendChild(rightSide);

  // Create container for widgets row
  const widgetRow = document.createElement('div');
  widgetRow.className = 'widget-container';
  leftSide.appendChild(widgetRow);

  // Initialize state with a random starting point in the visible range
  const initialPosition: Pair<number> = [
    (Math.random() * 8) - 4,
    (Math.random() * 6) - 3
  ];
  const initialTime = 0;
  const initialSchedulerType = 'constant';
  const scheduler = getScheduler(initialSchedulerType);

  const controller = createFrameworkController<ScoreParamState>({
    time: initialTime,
    position: initialPosition,
    scheduler,
    schedulerType: initialSchedulerType
  });

  // Create containers for all three widgets
  const condProbContainer = document.createElement('div');
  widgetRow.appendChild(condProbContainer);

  const dotView2Container = document.createElement('div');
  dotView2Container.style.display = 'flex';
  dotView2Container.style.flexDirection = 'column';
  widgetRow.appendChild(dotView2Container);

  const dotView3Container = document.createElement('div');
  dotView3Container.style.display = 'flex';
  dotView3Container.style.flexDirection = 'column';
  widgetRow.appendChild(dotView3Container);

  // Initialize the two interactive vector field views (lighter, no full precompute)
  const makeVectorFieldView = (container: HTMLElement): void => {
    const updateVectorField = initVectorFieldView(
      container,
      initialPosition,
      initialTime,
      scheduler,
      (newPosition: Pair<number>) => {
        void controller.update({ position: newPosition });
      },
      {
        autoSample: true,
        showTrajectories: true
      }
    );

    controller.registerView({
      render: (params: ScoreParamState): void => {
        updateVectorField(params.position, params.time, params.scheduler);
      }
    });
  };

  makeVectorFieldView(dotView2Container);
  makeVectorFieldView(dotView3Container);

  // Initialize conditional probability path view
  controller.registerView(initConditionalProbabilityPath(
    condProbContainer,
    initialPosition,
    initialTime,
    scheduler,
    (newPosition: Pair<number>) => {
      void controller.update({ position: newPosition });
    }
  ));

  // Initialize time slider
  initTimeSliderWidget(sliderContainer, 0, (time: number) => {
    void controller.update({ time });
  }, {
    loop: true,
    autostart: false
  });

  // Add early exit counter display
  const counterContainer = document.createElement('div');
  counterContainer.style.marginTop = '12px';
  counterContainer.style.fontSize = '14px';
  counterContainer.style.color = '#666';
  sliderContainer.appendChild(counterContainer);

  const counterLabel = document.createElement('span');
  counterLabel.textContent = 'Early exits: ';
  counterContainer.appendChild(counterLabel);

  const counterValue = document.createElement('span');
  counterValue.textContent = '0';
  counterValue.style.fontWeight = 'bold';
  counterValue.style.color = '#ff6200';
  counterContainer.appendChild(counterValue);

  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset';
  resetButton.style.marginLeft = '8px';
  resetButton.style.fontSize = '12px';
  resetButton.addEventListener('click', () => {
    controller.resetEarlyExitCount();
    counterValue.textContent = '0';
  });
  counterContainer.appendChild(resetButton);

  // Update counter display periodically
  setInterval(() => {
    counterValue.textContent = controller.getEarlyExitCount().toString();
  }, 100);

  // Add scheduler visualization (top of right column)
  const schedulerVizContainer = document.createElement('div');
  const schedulerVizTitle = document.createElement('h3');
  schedulerVizTitle.textContent = 'Scheduler';
  schedulerVizTitle.style.marginTop = '0';
  schedulerVizTitle.style.marginBottom = '8px';
  schedulerVizContainer.appendChild(schedulerVizTitle);
  rightSide.appendChild(schedulerVizContainer);

  const updateSchedulerViz = initSchedulerVisualizationWidget(schedulerVizContainer);

  // Register scheduler viz as a view
  controller.registerView({
    render: (params: ScoreParamState) => {
      updateSchedulerViz(params.scheduler, params.time);
    }
  });

  // Add scheduler selection (bottom of right column)
  const schedulerSelectionContainer = document.createElement('div');
  const schedulerSelectionTitle = document.createElement('h3');
  schedulerSelectionTitle.textContent = 'Type';
  schedulerSelectionTitle.style.marginTop = '0';
  schedulerSelectionTitle.style.marginBottom = '8px';
  schedulerSelectionContainer.appendChild(schedulerSelectionTitle);
  rightSide.appendChild(schedulerSelectionContainer);

  initSchedulerSelectionWidget(
    schedulerSelectionContainer,
    (schedulerType: string) => {
      const newScheduler = getScheduler(schedulerType);
      void controller.update({ schedulerType, scheduler: newScheduler });
    }
  );

  // Initial render
  void controller.update({});
}

run();

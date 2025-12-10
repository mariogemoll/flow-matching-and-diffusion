import { removePlaceholder } from 'web-ui-common/dom';

import { createFrameworkController } from './framework-controller';
import type { GaussianComponent } from './gaussian';
import { initMarginalProbPathView } from './marginal-prob-path-view';
import { initMarginalVectorFieldView } from './marginal-vector-field-view';
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

interface ExtendedGaussianComponent extends GaussianComponent {
  majorAxis: [number, number]; // In data space
  minorAxis: [number, number]; // In data space
}

interface MarginalState extends Record<string, unknown> {
  time: number;
  scheduler: NoiseScheduler;
  schedulerType: string;
  components: ExtendedGaussianComponent[];
}

function buildCovarianceFromAxes(
  majorAxis: [number, number],
  minorAxis: [number, number]
): [[number, number], [number, number]] {
  const [mx, my] = majorAxis;
  const [nx, ny] = minorAxis;

  const majorVar = mx * mx + my * my;
  const minorVar = nx * nx + ny * ny;

  const majorLen = Math.sqrt(majorVar);
  if (majorLen === 0) {return [[1, 0], [0, 1]];}

  const cos = mx / majorLen;
  const sin = my / majorLen;

  return [
    [majorVar * cos * cos + minorVar * sin * sin, (majorVar - minorVar) * cos * sin],
    [(majorVar - minorVar) * cos * sin, majorVar * sin * sin + minorVar * cos * cos]
  ];
}

export function initMarginalProbPathAndVectorFieldWidget(
  container: HTMLElement,
  radioGroupName?: string
): void {
  removePlaceholder(container);

  // Create main layout structure
  const mainDiv = document.createElement('div');
  mainDiv.style.display = 'flex';
  mainDiv.style.gap = '20px';
  container.appendChild(mainDiv);

  // Left section (marginal probability path)
  const leftSection = document.createElement('div');
  mainDiv.appendChild(leftSection);

  // Right section (vector field)
  const rightSection = document.createElement('div');
  mainDiv.appendChild(rightSection);

  // Plot section (scheduler visualization and selection)
  const plotSection = document.createElement('div');
  plotSection.style.display = 'flex';
  plotSection.style.flexDirection = 'column';
  plotSection.style.gap = '10px';
  mainDiv.appendChild(plotSection);

  // Initialize components
  const components: ExtendedGaussianComponent[] = [
    {
      mean: [1, 0.5],
      weight: 0.4,
      majorAxis: [0.8, 0.3],
      minorAxis: [-0.2, 0.5],
      covariance: [[0, 0], [0, 0]]
    },
    {
      mean: [-1, -0.5],
      weight: 0.35,
      majorAxis: [0.6, -0.2],
      minorAxis: [0.3, 0.7],
      covariance: [[0, 0], [0, 0]]
    },
    {
      mean: [0, 1.5],
      weight: 0.25,
      majorAxis: [0.9, 0],
      minorAxis: [0, 0.4],
      covariance: [[0, 0], [0, 0]]
    }
  ];

  components.forEach((c) => {
    c.covariance = buildCovarianceFromAxes(c.majorAxis, c.minorAxis);
  });

  // Initialize state
  const initialTime = 0;
  const initialSchedulerType = 'constant';
  const initialScheduler = makeConstantVarianceScheduler();

  // Create controller
  const controller = createFrameworkController<MarginalState>({
    time: initialTime,
    scheduler: initialScheduler,
    schedulerType: initialSchedulerType,
    components
  });

  // Helper function to get scheduler from type
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

  // Initialize scheduler visualization
  const updateSchedulerVisualization = initSchedulerVisualizationWidget(plotSection);
  controller.registerView({
    render: (state: MarginalState) => {
      updateSchedulerVisualization(state.scheduler, state.time);
    }
  });

  // Initialize scheduler selection
  initSchedulerSelectionWidget(plotSection, (schedulerType: string) => {
    const newScheduler = getScheduler(schedulerType);
    void controller.update({ schedulerType, scheduler: newScheduler });
  }, radioGroupName);

  // Initialize probability path view
  const updateProbPathView = initMarginalProbPathView(
    leftSection,
    components,
    initialTime,
    initialScheduler,
    (newComponents: ExtendedGaussianComponent[]) => {
      void controller.update({ components: newComponents });
    }
  );
  controller.registerView({
    render: (state: MarginalState) => {
      updateProbPathView(state.components, state.time, state.scheduler);
    }
  });

  // Initialize vector field view
  const updateVectorFieldView = initMarginalVectorFieldView(
    rightSection,
    components,
    initialTime,
    initialScheduler
  );
  controller.registerView({
    render: (state: MarginalState) => {
      updateVectorFieldView(state.components, state.time, state.scheduler);
    }
  });

  // Initialize time slider
  void initTimeSliderWidget(container, initialTime, (newTime: number) => {
    void controller.update({ time: newTime });
  });

  // Initial render
  void controller.update({});

  console.log('Marginal probability path initialized with TF.js and framework controller');
}

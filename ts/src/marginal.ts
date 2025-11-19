import { removePlaceholder } from 'web-ui-common/dom';

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

export function initMarginalProbPathAndVectorFieldWidget(container: HTMLElement): void {
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
  let currentTime = 0;
  let currentScheduler: NoiseScheduler = makeConstantVarianceScheduler();

  // Initialize scheduler visualization
  const updateSchedulerVisualization = initSchedulerVisualizationWidget(plotSection);

  // Initialize scheduler selection
  initSchedulerSelectionWidget(plotSection, (schedulerType: string) => {
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
    updateProbPathView(components, currentTime, currentScheduler);
    updateVectorFieldView(components, currentTime, currentScheduler);
    updateSchedulerVisualization(currentScheduler, currentTime);
  });

  // Initialize probability path view
  const updateProbPathView = initMarginalProbPathView(
    leftSection,
    components,
    currentTime,
    currentScheduler,
    (newComponents: ExtendedGaussianComponent[]) => {
      updateVectorFieldView(newComponents, currentTime, currentScheduler);
    }
  );

  // Initialize vector field view
  const updateVectorFieldView = initMarginalVectorFieldView(
    rightSection,
    components,
    currentTime,
    currentScheduler
  );

  // Initialize time slider
  const updateTimeSlider = initTimeSliderWidget(container, currentTime, (newTime: number) => {
    currentTime = newTime;
    updateProbPathView(components, currentTime, currentScheduler);
    updateVectorFieldView(components, currentTime, currentScheduler);
    updateSchedulerVisualization(currentScheduler, currentTime);
    updateTimeSlider(currentTime);
  });

  // Initial render
  updateSchedulerVisualization(currentScheduler, currentTime);

  console.log('Marginal probability path initialized with TF.js');
}

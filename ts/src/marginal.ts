import { removePlaceholder } from 'web-ui-common/dom';

import { initDiffusionCoefficientSelectionWidget } from './diffusion-coefficient-selection';
import { initDiffusionCoefficientVisualizationWidget } from './diffusion-coefficient-visualization';
import { createFrameworkController } from './framework-controller';
import type { GaussianComponent } from './gaussian';
import { initMarginalProbPathView } from './marginal-prob-path-view';
import { initMarginalSDEView } from './marginal-sde-view';
import { initMarginalVectorFieldView } from './marginal-vector-field-view';
import {
  type DiffusionCoefficientScheduler,
  makeConstantDiffusionCoefficientScheduler,
  makeLinearDiffusionCoefficientScheduler,
  makeLinearReverseDiffusionCoefficientScheduler,
  makeSineBumpDiffusionCoefficientScheduler
} from './math/diffusion-coefficient-scheduler';
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
  diffusionScheduler: DiffusionCoefficientScheduler;
  diffusionType: string;
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

function getDiffusionScheduler(
  diffusionType: string,
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  if (diffusionType === 'linear') {
    return makeLinearDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'linear-reverse') {
    return makeLinearReverseDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'sine-bump') {
    return makeSineBumpDiffusionCoefficientScheduler(maxDiffusion);
  }
  return makeConstantDiffusionCoefficientScheduler(maxDiffusion);
}

export function initMarginalProbPathAndVectorFieldWidget(
  container: HTMLElement
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
  const initialDiffusionType = 'constant';
  const initialMaxDiffusion = DEFAULT_DIFFUSION;
  const initialDiffusionScheduler = getDiffusionScheduler(
    initialDiffusionType,
    initialMaxDiffusion
  );

  // Create controller
  const controller = createFrameworkController<MarginalState>({
    time: initialTime,
    scheduler: initialScheduler,
    schedulerType: initialSchedulerType,
    diffusionScheduler: initialDiffusionScheduler,
    diffusionType: initialDiffusionType,
    components
  });

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
  });

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

const STEP_COUNT = 100;
const DEFAULT_DIFFUSION = 0.8;

export function initMarginalOdeSdeWidget(
  container: HTMLElement
): void {
  removePlaceholder(container);

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.border = '1px solid #e0e0e0';
  container.style.padding = '12px';
  container.style.borderRadius = '8px';

  const instanceTitle = document.createElement('h2');
  instanceTitle.textContent = 'Marginal Path: ODE + SDE';
  instanceTitle.style.margin = '0';
  container.appendChild(instanceTitle);

  const mainLayout = document.createElement('div');
  mainLayout.style.display = 'flex';
  mainLayout.style.gap = '20px';
  container.appendChild(mainLayout);

  const leftSide = document.createElement('div');
  leftSide.style.flex = '1';
  mainLayout.appendChild(leftSide);

  const rightSide = document.createElement('div');
  rightSide.style.width = '220px';
  rightSide.style.display = 'flex';
  rightSide.style.flexDirection = 'column';
  rightSide.style.gap = '16px';
  mainLayout.appendChild(rightSide);

  const widgetRow = document.createElement('div');
  widgetRow.className = 'widget-container';
  leftSide.appendChild(widgetRow);

  const probPathContainer = document.createElement('div');
  widgetRow.appendChild(probPathContainer);

  const odeContainer = document.createElement('div');
  odeContainer.style.display = 'flex';
  odeContainer.style.flexDirection = 'column';
  widgetRow.appendChild(odeContainer);

  const sdeContainer = document.createElement('div');
  sdeContainer.style.display = 'flex';
  sdeContainer.style.flexDirection = 'column';
  widgetRow.appendChild(sdeContainer);

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

  const initialTime = 0;
  const initialSchedulerType = 'constant';
  const initialScheduler = makeConstantVarianceScheduler();
  const initialDiffusionType = 'constant';
  const initialMaxDiffusion = DEFAULT_DIFFUSION;
  const initialDiffusionScheduler = makeConstantDiffusionCoefficientScheduler(initialMaxDiffusion);

  const controller = createFrameworkController<MarginalState>({
    time: initialTime,
    scheduler: initialScheduler,
    schedulerType: initialSchedulerType,
    diffusionScheduler: initialDiffusionScheduler,
    diffusionType: initialDiffusionType,
    components
  });

  // Initialize probability path view
  const updateProbPathView = initMarginalProbPathView(
    probPathContainer,
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

  // Initialize ODE view (marginal vector field)
  const updateOdeView = initMarginalVectorFieldView(
    odeContainer,
    components,
    initialTime,
    initialScheduler
  );
  controller.registerView({
    render: (state: MarginalState) => {
      updateOdeView(state.components, state.time, state.scheduler);
    }
  });

  // Initialize SDE view
  const stepCount = STEP_COUNT;
  const diffusionScheduler = initialDiffusionScheduler;

  const sdeView = initMarginalSDEView(
    sdeContainer,
    components,
    initialScheduler,
    stepCount,
    diffusionScheduler
  );

  controller.registerView({
    render: (state: MarginalState) => {
      sdeView.updateScheduler(state.scheduler);
      sdeView.updateComponents(state.components);
      sdeView.updateDiffusionScheduler(state.diffusionScheduler);
      sdeView.updateTime(state.time);
    }
  });

  const controlsSection = document.createElement('div');
  controlsSection.style.display = 'flex';
  controlsSection.style.flexDirection = 'column';
  controlsSection.style.gap = '10px';
  controlsSection.style.marginTop = '8px';
  leftSide.appendChild(controlsSection);

  const updateWidgets = (time: number): void => {
    void controller.update({ time });
  };

  initTimeSliderWidget(controlsSection, 0, updateWidgets, {
    loop: true,
    autostart: false,
    steps: stepCount
  });

  // Add scheduler visualization (top of right column)
  const schedulerVizContainer = document.createElement('div');
  const schedulerVizTitle = document.createElement('h3');
  schedulerVizTitle.textContent = 'Scheduler';
  schedulerVizTitle.style.marginTop = '0';
  schedulerVizTitle.style.marginBottom = '8px';
  schedulerVizContainer.appendChild(schedulerVizTitle);
  rightSide.appendChild(schedulerVizContainer);

  const updateSchedulerViz = initSchedulerVisualizationWidget(schedulerVizContainer);

  controller.registerView({
    render: (params: MarginalState) => {
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

  // Add diffusion visualization
  const diffusionVizContainer = document.createElement('div');
  const diffusionVizTitle = document.createElement('h3');
  diffusionVizTitle.textContent = 'Diffusion';
  diffusionVizTitle.style.marginTop = '0';
  diffusionVizTitle.style.marginBottom = '8px';
  diffusionVizContainer.appendChild(diffusionVizTitle);
  rightSide.appendChild(diffusionVizContainer);

  const updateDiffusionViz = initDiffusionCoefficientVisualizationWidget(diffusionVizContainer);

  controller.registerView({
    render: (params: MarginalState) => {
      updateDiffusionViz(params.diffusionScheduler, params.time);
    }
  });

  // Add diffusion selection
  const diffusionSelectionContainer = document.createElement('div');
  const diffusionSelectionTitle = document.createElement('h3');
  diffusionSelectionTitle.textContent = 'Type';
  diffusionSelectionTitle.style.marginTop = '0';
  diffusionSelectionTitle.style.marginBottom = '8px';
  diffusionSelectionContainer.appendChild(diffusionSelectionTitle);
  rightSide.appendChild(diffusionSelectionContainer);

  initDiffusionCoefficientSelectionWidget(
    diffusionSelectionContainer,
    (diffusionType: string, maxDiffusion: number) => {
      const newDiffusionScheduler = getDiffusionScheduler(diffusionType, maxDiffusion);
      void controller.update({ diffusionType, diffusionScheduler: newDiffusionScheduler });
    }
  );

  // Initial render
  void controller.update({});

  console.log('Marginal ODE+SDE widget initialized');
}

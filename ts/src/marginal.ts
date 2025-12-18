import { removePlaceholder } from 'web-ui-common/dom';

import { initDiffusionCoefficientWidget } from './diffusion-coefficient-widget';
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
import { initNoiseSchedulerWidget } from './noise-scheduler-widget';
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

export function initMarginalPathOdeWidget(
  container: HTMLElement
): void {
  removePlaceholder(container);

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

  // Canvas containers (views)
  const leftContainer = document.createElement('div');
  leftContainer.className = 'marginal-path';
  container.appendChild(leftContainer);

  const rightContainer = document.createElement('div');
  rightContainer.className = 'marginal-ode';
  container.appendChild(rightContainer);

  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls';
  container.appendChild(controlsContainer);

  // Scheduler section
  const schedulerSection = document.createElement('div');
  schedulerSection.className = 'schedule-controls noise';
  controlsContainer.appendChild(schedulerSection);

  // Initialize combined noise scheduler widget
  const updateScheduler = initNoiseSchedulerWidget(schedulerSection, (schedulerType: string) => {
    const newScheduler = getScheduler(schedulerType);
    void controller.update({ schedulerType, scheduler: newScheduler });
  });

  // Initialize probability path view
  const updateProbPathView = initMarginalProbPathView(
    leftContainer,
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
      updateScheduler(state.scheduler, state.time);
    }
  });

  // Initialize vector field view
  const updateVectorFieldView = initMarginalVectorFieldView(
    rightContainer,
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
  updateScheduler(initialScheduler, initialTime);
  void controller.update({});

  console.log('Marginal probability path initialized with TF.js and framework controller');
}

const STEP_COUNT = 100;
const DEFAULT_DIFFUSION = 0.8;

export function initMarginalPathOdeSdeWidget(
  container: HTMLElement
): void {
  removePlaceholder(container);

  const probPathContainer = document.createElement('div');
  probPathContainer.className = 'marginal-path';
  container.appendChild(probPathContainer);

  const odeContainer = document.createElement('div');
  odeContainer.className = 'marginal-ode';
  container.appendChild(odeContainer);

  const sdeContainer = document.createElement('div');
  sdeContainer.className = 'marginal-sde';
  container.appendChild(sdeContainer);

  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'controls';
  container.appendChild(controlsContainer);

  // Scheduler section
  const schedulerSection = document.createElement('div');
  schedulerSection.className = 'schedule-controls noise';
  controlsContainer.appendChild(schedulerSection);

  // Diffusion section
  const diffusionSection = document.createElement('div');
  diffusionSection.className = 'schedule-controls diffusion-coefficient';
  controlsContainer.appendChild(diffusionSection);

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

  // Initialize combined noise scheduler widget
  const updateScheduler = initNoiseSchedulerWidget(schedulerSection, (schedulerType: string) => {
    const newScheduler = getScheduler(schedulerType);
    void controller.update({ schedulerType, scheduler: newScheduler });
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
      updateScheduler(state.scheduler, state.time);
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

  // Initialize combined diffusion coefficient widget
  const updateDiffusion = initDiffusionCoefficientWidget(
    diffusionSection,
    (diffusionType: string, maxDiffusion: number) => {
      const newDiffusionScheduler = getDiffusionScheduler(diffusionType, maxDiffusion);
      void controller.update({ diffusionType, diffusionScheduler: newDiffusionScheduler });
    }
  );

  controller.registerView({
    render: (state: MarginalState) => {
      updateDiffusion(state.diffusionScheduler, state.time);
    }
  });

  // Initialize time slider
  void initTimeSliderWidget(container, initialTime, (newTime: number) => {
    void controller.update({ time: newTime });
  }, {
    loop: true,
    autostart: false,
    steps: stepCount
  });

  // Initial render
  updateScheduler(initialScheduler, initialTime);
  void controller.update({});

  console.log('Marginal ODE+SDE widget initialized');
}

import {
  addDot,
  addFrameUsingScales,
  defaultMargins,
  getContext
} from 'web-ui-common/canvas';
import { addCanvas, el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { initConditionalProbabilityPath } from './conditional-probability-path';
import { sampleStandardNormalPoints } from './conditional-tfjs-logic';
import {
  calculateConditionalSDETrajectory,
  generateBrownianNoise
} from './conditional-trajectory-logic';
import { initVectorFieldView } from './conditional-vector-field-view';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { initDiffusionCoefficientSelectionWidget } from './diffusion-coefficient-selection';
import { initDiffusionCoefficientVisualizationWidget } from './diffusion-coefficient-visualization';
import { createFrameworkController } from './framework-controller';
import {
  type DiffusionCoefficientScheduler,
  makeConstantDiffusionCoefficientScheduler,
  makeCosineDiffusionCoefficientScheduler,
  makeLinearDiffusionCoefficientScheduler,
  makeLinearReverseDiffusionCoefficientScheduler,
  makeQuadraticDiffusionCoefficientScheduler,
  makeSqrtDiffusionCoefficientScheduler
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
import { drawStandardNormalBackground } from './vector-field-view-common';

interface DoubleConditionalState extends Record<string, unknown> {
  time: number;
  position: Pair<number>;
  scheduler: NoiseScheduler;
  schedulerType: string;
  diffusionScheduler: DiffusionCoefficientScheduler;
  diffusionType: string;
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
  if (diffusionType === 'constant') {
    return makeConstantDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'linear') {
    return makeLinearDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'linear-reverse') {
    return makeLinearReverseDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'quadratic') {
    return makeQuadraticDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'sqrt') {
    return makeSqrtDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'cosine') {
    return makeCosineDiffusionCoefficientScheduler(maxDiffusion);
  }
  return makeConstantDiffusionCoefficientScheduler(maxDiffusion);
}

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';
const STEP_COUNT = 100;
const MIN_STEP_COUNT = 10;
const MAX_STEP_COUNT = 2000;
const DEFAULT_DIFFUSION = 0.8;

interface PrecomputedVectorFieldControls {
  updatePosition: (position: Pair<number>) => void;
  updateTime: (time: number) => void;
  updateStepCount: (stepCount: number) => void;
  updateScheduler: (scheduler: NoiseScheduler) => void;
  updateDiffusionScheduler: (diffusionScheduler: DiffusionCoefficientScheduler) => void;
}

function createFrameTimes(stepCount: number): number[] {
  const frameTimes: number[] = [];
  for (let frame = 0; frame <= stepCount; frame++) {
    frameTimes.push(frame / stepCount);
  }
  return frameTimes;
}

function initPrecomputedSDEView(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialScheduler: NoiseScheduler,
  initialStepCount: number,
  initialDiffusionScheduler: DiffusionCoefficientScheduler,
  onPositionChange: (position: Pair<number>) => void
): PrecomputedVectorFieldControls {
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let currentPosition = initialPosition;
  let currentScheduler = initialScheduler;
  let currentTime = 0;
  let initialSamples: [number, number][] = [];
  let showTrajectories = true;
  let precomputedTrajectories: Pair<number>[][] = [];
  let stepCount = initialStepCount;
  let diffusionScheduler = initialDiffusionScheduler;
  let precomputedNoises: Pair<number>[][] = [];

  const { initialSamples: samples } = sampleStandardNormalPoints({
    count: NUM_SAMPLES,
    xScale,
    yScale
  });
  initialSamples = samples;

  function generateNoiseMatrices(): void {
    const dt = 1 / stepCount;
    precomputedNoises = initialSamples.map(() => generateBrownianNoise(stepCount, dt));
  }

  function precomputeStochasticTrajectories(dataPoint: Pair<number>): void {
    const frameTimes = createFrameTimes(stepCount);

    precomputedTrajectories = initialSamples.map((sample, idx) =>
      calculateConditionalSDETrajectory(
        sample,
        dataPoint,
        currentScheduler,
        frameTimes,
        diffusionScheduler,
        precomputedNoises[idx]
      )
    );
  }

  function getFrameIndexForTime(time: number): number {
    const maxIndex = stepCount;
    const index = Math.round(time * maxIndex);
    return Math.min(Math.max(index, 0), maxIndex);
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw standard normal at t=0
    drawStandardNormalBackground(canvas, ctx, xScale, yScale, currentTime);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    if (showTrajectories) {
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
      ctx.lineWidth = 1;

      for (const trajectory of precomputedTrajectories) {
        if (trajectory.length < 2) {continue;}

        ctx.beginPath();
        const [x0, y0] = trajectory[0];
        ctx.moveTo(xScale(x0), yScale(y0));

        for (let i = 1; i < trajectory.length; i++) {
          const [x, y] = trajectory[i];
          ctx.lineTo(xScale(x), yScale(y));
        }

        ctx.stroke();
      }
    }

    const pixelX = xScale(currentPosition[0]);
    const pixelY = yScale(currentPosition[1]);
    addDot(ctx, pixelX, pixelY, 5, ORANGE);

    const closestFrameIndex = getFrameIndexForTime(currentTime);

    for (const trajectory of precomputedTrajectories) {
      const position = trajectory[closestFrameIndex];
      const px = xScale(position[0]);
      const py = yScale(position[1]);
      addDot(ctx, px, py, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    }
  }

  function updatePosition(position: Pair<number>): void {
    currentPosition = position;
    precomputeStochasticTrajectories(position);
    render();
  }

  function updateTime(time: number): void {
    currentTime = time;
    render();
  }

  function updateStepCount(newStepCount: number): void {
    stepCount = Math.max(MIN_STEP_COUNT, Math.min(MAX_STEP_COUNT, Math.round(newStepCount)));
    generateNoiseMatrices();
    precomputeStochasticTrajectories(currentPosition);
    render();
  }

  function updateDiffusionScheduler(
    newDiffusionScheduler: DiffusionCoefficientScheduler
  ): void {
    diffusionScheduler = newDiffusionScheduler;
    precomputeStochasticTrajectories(currentPosition);
    render();
  }

  function updateScheduler(newScheduler: NoiseScheduler): void {
    currentScheduler = newScheduler;
    precomputeStochasticTrajectories(currentPosition);
    render();
  }

  function resamplePoints(): void {
    const { initialSamples: samples } = sampleStandardNormalPoints({
      count: NUM_SAMPLES,
      xScale,
      yScale
    });
    initialSamples = samples;
    generateNoiseMatrices();
    precomputeStochasticTrajectories(currentPosition);
    render();
  }

  function resampleNoise(): void {
    generateNoiseMatrices();
    precomputeStochasticTrajectories(currentPosition);
    render();
  }

  const controlsDiv = document.createElement('div');
  controlsDiv.style.marginTop = '8px';
  controlsDiv.style.display = 'flex';
  controlsDiv.style.flexDirection = 'column';
  controlsDiv.style.gap = '8px';
  container.appendChild(controlsDiv);

  const checkboxRow = document.createElement('div');
  controlsDiv.appendChild(checkboxRow);

  const trajectoryCheckboxLabel = document.createElement('label');
  const trajectoryCheckbox = document.createElement('input');
  trajectoryCheckbox.type = 'checkbox';
  trajectoryCheckbox.checked = showTrajectories;
  trajectoryCheckboxLabel.appendChild(trajectoryCheckbox);
  trajectoryCheckboxLabel.appendChild(document.createTextNode(' Show trajectories'));
  checkboxRow.appendChild(trajectoryCheckboxLabel);

  trajectoryCheckbox.addEventListener('change', () => {
    showTrajectories = trajectoryCheckbox.checked;
    render();
  });

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.gap = '8px';
  controlsDiv.appendChild(buttonRow);

  const resamplePointsButton = document.createElement('button');
  resamplePointsButton.textContent = 'Sample points';
  resamplePointsButton.addEventListener('click', resamplePoints);
  buttonRow.appendChild(resamplePointsButton);

  const resampleNoiseButton = document.createElement('button');
  resampleNoiseButton.textContent = 'Sample noise';
  resampleNoiseButton.addEventListener('click', resampleNoise);
  buttonRow.appendChild(resampleNoiseButton);

  // Add drag functionality
  let isDragging = false;

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    const dataX = xScale.inverse(pixelX);
    const dataY = yScale.inverse(pixelY);
    onPositionChange([dataX, dataY]);
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) {return;}
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    const dataX = xScale.inverse(pixelX);
    const dataY = yScale.inverse(pixelY);
    onPositionChange([dataX, dataY]);
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
  });

  canvas.style.cursor = 'pointer';

  generateNoiseMatrices();
  precomputeStochasticTrajectories(initialPosition);
  render();

  return { updatePosition, updateTime, updateStepCount, updateDiffusionScheduler, updateScheduler };
}

function initDoubleConditionalVectorFieldWidget(
  container: HTMLElement,
  instanceIndex: number
): void {
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.border = '1px solid #e0e0e0';
  container.style.padding = '12px';
  container.style.borderRadius = '8px';

  const instanceTitle = document.createElement('h2');
  instanceTitle.textContent = `Instance ${instanceIndex + 1}`;
  instanceTitle.style.margin = '0';
  container.appendChild(instanceTitle);

  const mainLayout = document.createElement('div');
  mainLayout.style.display = 'flex';
  mainLayout.style.gap = '20px';
  container.appendChild(mainLayout);

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
  const initialDiffusionType = 'constant';
  const initialMaxDiffusion = DEFAULT_DIFFUSION;
  const diffusionScheduler = getDiffusionScheduler(initialDiffusionType, initialMaxDiffusion);

  const controller = createFrameworkController<DoubleConditionalState>({
    time: initialTime,
    position: initialPosition,
    scheduler,
    schedulerType: initialSchedulerType,
    diffusionScheduler,
    diffusionType: initialDiffusionType
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
      render: (params: DoubleConditionalState): void => {
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

  // Slider + counters directly under the views
  const instanceSliderContainer = document.createElement('div');
  instanceSliderContainer.style.marginTop = '12px';
  instanceSliderContainer.style.marginBottom = '4px';
  instanceSliderContainer.style.display = 'flex';
  instanceSliderContainer.style.flexDirection = 'column';
  instanceSliderContainer.style.gap = '8px';
  leftSide.appendChild(instanceSliderContainer);

  initTimeSliderWidget(instanceSliderContainer, 0, (time: number) => {
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
  instanceSliderContainer.appendChild(counterContainer);

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
    render: (params: DoubleConditionalState) => {
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
    },
    `scheduler-${instanceIndex}`
  );

  // Initial render
  void controller.update({});
}

function initOdeSdeWidget(
  container: HTMLElement,
  instanceIndex: number
): void {
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.border = '1px solid #e0e0e0';
  container.style.padding = '12px';
  container.style.borderRadius = '8px';

  const instanceTitle = document.createElement('h2');
  instanceTitle.textContent = 'OdeSdeWidget';
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

  const condProbContainer = document.createElement('div');
  widgetRow.appendChild(condProbContainer);

  const odeContainer = document.createElement('div');
  odeContainer.style.display = 'flex';
  odeContainer.style.flexDirection = 'column';
  widgetRow.appendChild(odeContainer);

  const sdeContainer = document.createElement('div');
  sdeContainer.style.display = 'flex';
  sdeContainer.style.flexDirection = 'column';
  widgetRow.appendChild(sdeContainer);

  const initialPosition: Pair<number> = [
    (Math.random() * 8) - 4,
    (Math.random() * 6) - 3
  ];
  const initialTime = 0;
  const initialSchedulerType = 'constant';
  const scheduler = getScheduler(initialSchedulerType);
  const initialDiffusionType = 'constant';
  const initialMaxDiffusion = DEFAULT_DIFFUSION;
  const diffusionScheduler = getDiffusionScheduler(initialDiffusionType, initialMaxDiffusion);

  const controller = createFrameworkController<DoubleConditionalState>({
    time: initialTime,
    position: initialPosition,
    scheduler,
    schedulerType: initialSchedulerType,
    diffusionScheduler,
    diffusionType: initialDiffusionType
  });

  // Conditional probability path view (same as first widget)
  controller.registerView(initConditionalProbabilityPath(
    condProbContainer,
    initialPosition,
    initialTime,
    scheduler,
    (newPosition: Pair<number>) => {
      void controller.update({ position: newPosition });
    }
  ));

  // ODE view stays the same as first widget (interactive vector field)
  const updateOdeView = initVectorFieldView(
    odeContainer,
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
    render: (params: DoubleConditionalState): void => {
      updateOdeView(params.position, params.time, params.scheduler);
    }
  });

  // SDE view (precomputed)
  const stepCount = STEP_COUNT;

  const sdeView = initPrecomputedSDEView(
    sdeContainer,
    initialPosition,
    scheduler,
    stepCount,
    diffusionScheduler,
    (newPosition: Pair<number>) => {
      void controller.update({ position: newPosition });
    }
  );

  controller.registerView({
    render: (params: DoubleConditionalState) => {
      sdeView.updateScheduler(params.scheduler);
      sdeView.updateDiffusionScheduler(params.diffusionScheduler);
      sdeView.updatePosition(params.position);
      sdeView.updateTime(params.time);
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

  const schedulerVizContainer = document.createElement('div');
  const schedulerVizTitle = document.createElement('h3');
  schedulerVizTitle.textContent = 'Scheduler';
  schedulerVizTitle.style.marginTop = '0';
  schedulerVizTitle.style.marginBottom = '8px';
  schedulerVizContainer.appendChild(schedulerVizTitle);
  rightSide.appendChild(schedulerVizContainer);

  const updateSchedulerViz = initSchedulerVisualizationWidget(schedulerVizContainer);

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
    },
    `scheduler-odesde-${instanceIndex}`
  );

  controller.registerView({
    render: (params: DoubleConditionalState) => {
      updateSchedulerViz(params.scheduler, params.time);
    }
  });

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
    render: (params: DoubleConditionalState) => {
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
    },
    `diffusion-odesde-${instanceIndex}`
  );

  void controller.update({});
}

function run(): void {
  const widgetsContainer = el(document, '#widgets-container') as HTMLElement;
  widgetsContainer.style.display = 'flex';
  widgetsContainer.style.flexDirection = 'column';
  widgetsContainer.style.gap = '24px';

  const instance1 = document.createElement('div');
  widgetsContainer.appendChild(instance1);
  initDoubleConditionalVectorFieldWidget(instance1, 0);

  const instance2 = document.createElement('div');
  widgetsContainer.appendChild(instance2);
  initOdeSdeWidget(instance2, 1);
}

run();

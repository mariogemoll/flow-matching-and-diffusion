import {
  addDot,
  addFrameUsingScales,
  defaultMargins,
  getContext
} from 'web-ui-common/canvas';
import { addCanvas, removePlaceholder } from 'web-ui-common/dom';
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
import { initDiffusionCoefficientWidget } from './diffusion-coefficient-widget';
import { createFrameworkController } from './framework-controller';
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
  if (diffusionType === 'linear') {
    return makeLinearDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'linear-reverse') {
    return makeLinearReverseDiffusionCoefficientScheduler(maxDiffusion);
  } else if (diffusionType === 'sine-bump') {
    return makeSineBumpDiffusionCoefficientScheduler(maxDiffusion);
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


  function resampleNoise(): void {
    generateNoiseMatrices();
    precomputeStochasticTrajectories(currentPosition);
    render();
  }

  const controlsDiv = document.createElement('div');
  container.appendChild(controlsDiv);

  const resamplePointsButton = document.createElement('button');
  resamplePointsButton.textContent = 'Sample points';

  const resampleNoiseButton = document.createElement('button');
  resampleNoiseButton.textContent = 'Sample noise';
  resampleNoiseButton.addEventListener('click', resampleNoise);
  controlsDiv.appendChild(resampleNoiseButton);

  const trajectoryCheckboxLabel = document.createElement('label');
  const trajectoryCheckbox = document.createElement('input');
  trajectoryCheckbox.type = 'checkbox';
  trajectoryCheckbox.checked = showTrajectories;
  trajectoryCheckboxLabel.appendChild(trajectoryCheckbox);
  trajectoryCheckboxLabel.appendChild(document.createTextNode(' Show trajectories'));
  controlsDiv.appendChild(trajectoryCheckboxLabel);

  trajectoryCheckbox.addEventListener('change', () => {
    showTrajectories = trajectoryCheckbox.checked;
    render();
  });


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

export function initOdeSdeWidget(container: HTMLElement): void {
  removePlaceholder(container);
  const condProbContainer = document.createElement('div');
  container.appendChild(condProbContainer);

  const odeContainer = document.createElement('div');
  container.appendChild(odeContainer);

  const sdeContainer = document.createElement('div');
  container.appendChild(sdeContainer);

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
  controlsSection.className = 'controls';
  container.appendChild(controlsSection);

  const updateWidgets = (time: number): void => {
    void controller.update({ time });
  };

  initTimeSliderWidget(container, 0, updateWidgets, {
    loop: true,
    autostart: false,
    steps: stepCount
  });

  // Add combined noise scheduler widget
  const schedulerContainer = document.createElement('div');
  schedulerContainer.className = 'schedule-controls noise';
  controlsSection.appendChild(schedulerContainer);

  const updateScheduler = initNoiseSchedulerWidget(schedulerContainer, (schedulerType: string) => {
    const newScheduler = getScheduler(schedulerType);
    void controller.update({ schedulerType, scheduler: newScheduler });
  });

  controller.registerView({
    render: (params: DoubleConditionalState) => {
      updateScheduler(params.scheduler, params.time);
    }
  });

  // Add combined diffusion coefficient widget
  const diffusionContainer = document.createElement('div');
  diffusionContainer.className = 'schedule-controls diffusion-coefficient';
  controlsSection.appendChild(diffusionContainer);

  const updateDiffusion = initDiffusionCoefficientWidget(
    diffusionContainer,
    (diffusionType: string, maxDiffusion: number) => {
      const newDiffusionScheduler = getDiffusionScheduler(diffusionType, maxDiffusion);
      void controller.update({ diffusionType, diffusionScheduler: newDiffusionScheduler });
    }
  );

  controller.registerView({
    render: (params: DoubleConditionalState) => {
      updateDiffusion(params.diffusionScheduler, params.time);
    }
  });

  void controller.update({});
}

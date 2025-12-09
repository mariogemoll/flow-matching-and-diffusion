import {
  addDot, addFrameUsingScales, defaultMargins, getContext
} from 'web-ui-common/canvas';
import { addCanvas, el } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { initConditionalProbabilityPathView } from './conditional-probability-path-view';
import { sampleStandardNormalPoints } from './conditional-tfjs-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { makeConstantVarianceScheduler, type NoiseScheduler } from './math/noise-scheduler';
import { initTimeSliderWidget } from './time-slider';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const ORANGE = '#ff6200ff';
const NUM_TIME_STEPS = 100;

interface PrecomputedVectorFieldControls {
  updatePosition: (position: Pair<number>) => void;
  updateTime: (time: number) => void;
}

function initPrecomputedVectorFieldView(
  container: HTMLElement,
  initialPosition: Pair<number>,
  scheduler: NoiseScheduler
): PrecomputedVectorFieldControls {
  // Add a canvas element to the container
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let currentPosition = initialPosition;
  let currentTime = 0;
  let initialSamples: [number, number][] = [];
  let showTrajectories = false;
  // Store precomputed trajectories: [sampleIndex][timeStep] -> [x, y]
  let precomputedTrajectories: Pair<number>[][] = [];

  // Sample initial points from standard normal
  const { initialSamples: samples } = sampleStandardNormalPoints({
    count: NUM_SAMPLES,
    xScale,
    yScale
  });
  initialSamples = samples;

  function precomputeTrajectories(dataPoint: Pair<number>): void {
    // Precompute trajectories for all time steps
    precomputedTrajectories = initialSamples.map(sample => {
      const trajectory: Pair<number>[] = [];

      for (let step = 0; step <= NUM_TIME_STEPS; step++) {
        const t = step / NUM_TIME_STEPS;
        const beta0 = scheduler.getBeta(0);
        const betaT = scheduler.getBeta(Math.max(t, 0.001));

        if (beta0 === 0) {
          trajectory.push([dataPoint[0], dataPoint[1]]);
        } else {
          const ratio = betaT / beta0;
          const current: Pair<number> = [
            dataPoint[0] + (sample[0] - dataPoint[0]) * ratio,
            dataPoint[1] + (sample[1] - dataPoint[1]) * ratio
          ];
          trajectory.push(current);
        }
      }

      return trajectory;
    });
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    addFrameUsingScales(ctx, xScale, yScale, 11);

    // Draw trajectories if enabled
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

    // Draw the data point
    const pixelX = xScale(currentPosition[0]);
    const pixelY = yScale(currentPosition[1]);
    addDot(ctx, pixelX, pixelY, 5, ORANGE);

    // Draw sampled points at current time
    const timeStep = Math.round(currentTime * NUM_TIME_STEPS);
    for (const trajectory of precomputedTrajectories) {
      const position = trajectory[timeStep];
      const px = xScale(position[0]);
      const py = yScale(position[1]);
      addDot(ctx, px, py, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    }
  }

  function updatePosition(position: Pair<number>): void {
    currentPosition = position;
    precomputeTrajectories(position);
    render();
  }

  function updateTime(time: number): void {
    currentTime = time;
    render();
  }

  // Create controls container
  const controlsDiv = document.createElement('div');
  controlsDiv.style.marginTop = '8px';
  container.appendChild(controlsDiv);

  // Create checkbox for trajectory display
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

  // Initial precomputation
  precomputeTrajectories(initialPosition);
  render();

  return { updatePosition, updateTime };
}

function run(): void {
  const widgetsContainer = el(document, '#widgets-container') as HTMLElement;
  const sliderContainer = el(document, '#slider-container') as HTMLElement;

  // Create container for widgets row
  const widgetRow = document.createElement('div');
  widgetRow.className = 'widget-container';
  widgetsContainer.appendChild(widgetRow);

  // Initialize widgets
  const initialPosition: Pair<number> = [0, 0];
  const initialTime = 0;
  const scheduler = makeConstantVarianceScheduler();

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

  // Initialize the two precomputed vector field views
  const vectorField2 = initPrecomputedVectorFieldView(
    dotView2Container, initialPosition, scheduler
  );
  const vectorField3 = initPrecomputedVectorFieldView(
    dotView3Container, initialPosition, scheduler
  );

  // Initialize conditional probability path view with onChange handler
  let currentPosition = initialPosition;
  const updateCondProbView = initConditionalProbabilityPathView(
    condProbContainer,
    initialPosition,
    initialTime,
    scheduler,
    (newPosition: Pair<number>) => {
      currentPosition = newPosition;
      // Re-render all views when position changes
      updateCondProbView(currentPosition, currentTime, scheduler);
      vectorField2.updatePosition(currentPosition);
      vectorField3.updatePosition(currentPosition);
    }
  );

  let currentTime = initialTime;

  // Update function that will be called when time changes
  function updateWidgets(time: number): void {
    currentTime = time;

    // Update conditional probability path view
    updateCondProbView(currentPosition, currentTime, scheduler);

    // Update the vector field views to show dots at current time
    vectorField2.updateTime(currentTime);
    vectorField3.updateTime(currentTime);
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

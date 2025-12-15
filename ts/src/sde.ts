import { addFrameUsingScales, createMovableDot, getContext } from 'web-ui-common/canvas';
import { addCanvas, removePlaceholder } from 'web-ui-common/dom';
import type { Pair, Scale } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import { generateBrownianNoise as generateNoiseForSDE } from './conditional-trajectory-logic';
import { initDiffusionCoefficientSelectionWidget } from './diffusion-coefficient-selection';
import { initDiffusionCoefficientVisualizationWidget } from './diffusion-coefficient-visualization';
import {
  type DiffusionCoefficientScheduler,
  makeConstantDiffusionCoefficientScheduler,
  makeLinearDiffusionCoefficientScheduler,
  makeLinearReverseDiffusionCoefficientScheduler,
  makeSineBumpDiffusionCoefficientScheduler
} from './math/diffusion-coefficient-scheduler';
import { addSlider } from './slider';
import { initTimeSliderWidget } from './time-slider';
import { drawLineDataSpace } from './vector-field-view-common';

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

/**
 * Vector field for SDE: dx = drift(x, y, t) * dt + sigma * dW
 * This is the same vector field as in vf.html
 */
function vectorField(
  x: number,
  y: number,
  t: number,
  xScale: Scale,
  yScale: Scale
): [number, number] {
  const phase = t * Math.PI * 2;
  const dataWidth = xScale.domain[1];
  const dataHeight = yScale.domain[1];

  // Strong left-to-right base flow
  const baseFlowX = 1.0 + 0.3 * Math.sin(phase * 0.4);
  const baseFlowY = 0.2 * Math.sin(y / 100 + phase * 0.3);

  // Partial vortices - more like eddies that deflect the main flow
  const eddies = [
    { x: dataWidth * 0.25, y: dataHeight * 0.3, strength: 0.6, rotation: 1 },
    { x: dataWidth * 0.6, y: dataHeight * 0.7, strength: 0.5, rotation: -1 },
    { x: dataWidth * 0.8, y: dataHeight * 0.2, strength: 0.4, rotation: 1 }
  ];

  // One strong singular whirl
  const whirlX = dataWidth * 0.45;
  const whirlY = dataHeight * 0.55;
  const whirlStrength = 1.4;

  let eddyX = 0;
  let eddyY = 0;

  // Add eddy contributions (weaker than full vortices)
  for (const eddy of eddies) {
    const dx = x - eddy.x;
    const dy = y - eddy.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    if (r > 5) {
      const strength = eddy.strength * Math.exp(-r / 80) * (1 + 0.4 * Math.sin(phase + angle * 2));
      eddyX += -strength * Math.sin(angle) * eddy.rotation;
      eddyY += strength * Math.cos(angle) * eddy.rotation;
    }
  }

  // Add the strong singular whirl
  const whirlDx = x - whirlX;
  const whirlDy = y - whirlY;
  const whirlR = Math.sqrt(whirlDx * whirlDx + whirlDy * whirlDy);
  const whirlAngle = Math.atan2(whirlDy, whirlDx);
  let whirlVx = 0;
  let whirlVy = 0;

  if (whirlR > 8) {
    const whirlForce = whirlStrength * Math.exp(-whirlR / 70) *
      (1 + 0.6 * Math.sin(phase * 1.1 + whirlAngle));
    whirlVx = -whirlForce * Math.sin(whirlAngle);
    whirlVy = whirlForce * Math.cos(whirlAngle);
  }

  // Wavy perturbations that follow the main flow direction
  const waveX = 0.8 * Math.sin(y / 70 + phase * 0.6) * Math.cos(x / 90);
  const waveY = 0.6 * Math.cos(x / 80 + phase * 0.5) * Math.sin(y / 110);

  // Vertical up-down currents at specific x positions
  let verticalY = 0;

  // First vertical current around x = 30% of data width
  const current1X = dataWidth * 0.3;
  const dist1 = Math.abs(x - current1X);
  if (dist1 < 120) {
    const strength1 = Math.exp(-dist1 / 60) * (1 + 0.5 * Math.sin(phase * 0.8));
    verticalY += 1.2 * strength1 * Math.sin(y / 50 + phase);
  }

  // Second vertical current around x = 70% of data width
  const current2X = dataWidth * 0.7;
  const dist2 = Math.abs(x - current2X);
  if (dist2 < 100) {
    const strength2 = Math.exp(-dist2 / 50) * (1 + 0.3 * Math.cos(phase * 1.2));
    verticalY += -0.9 * strength2 * Math.cos(y / 60 + phase * 1.5);
  }

  return [
    (baseFlowX + eddyX + whirlVx + waveX) * 90,
    (baseFlowY + eddyY + whirlVy + waveY + verticalY) * 90
  ];
}

/**
 * Draw the vector field (same as vf.html)
 */
function drawVectorField(
  ctx: CanvasRenderingContext2D,
  xScale: Scale,
  yScale: Scale,
  t: number
): void {
  const spacing = 20; // Spacing in data space
  const displayScale = 0.08;
  const vectors: { x: number; y: number; vx: number; vy: number; length: number }[] = [];
  let maxLength = 0;

  // Get data domain from scales
  const [xMin, xMax] = xScale.domain;
  const [yMin, yMax] = yScale.domain;

  // Compute all vectors and find max magnitude
  // Center the grid with equal margins on all sides
  const width = xMax - xMin;
  const height = yMax - yMin;
  const numArrowsX = Math.floor(width / spacing);
  const numArrowsY = Math.floor(height / spacing);
  const spanX = (numArrowsX - 1) * spacing;
  const spanY = (numArrowsY - 1) * spacing;
  const marginX = (width - spanX) / 2;
  const marginY = (height - spanY) / 2;
  const startX = xMin + marginX;
  const startY = yMin + marginY;

  for (let i = 0; i < numArrowsX; i++) {
    for (let j = 0; j < numArrowsY; j++) {
      const x = startX + i * spacing;
      const y = startY + j * spacing;
      const [vx, vy] = vectorField(x, y, t, xScale, yScale);
      const length = Math.sqrt(vx * vx + vy * vy);
      maxLength = Math.max(maxLength, length);
      vectors.push({ x, y, vx, vy, length });
    }
  }

  // Draw all vectors with viridis coloring in data space
  for (const { x, y, vx, vy, length } of vectors) {
    // Scale velocity for display
    const displayVx = vx * displayScale;
    const displayVy = vy * displayScale;

    // Color based on magnitude (normalized by max)
    const normalized = maxLength > 0 ? length / maxLength : 0;
    const color = viridis(normalized);

    // Draw arrow in data space
    const endX = x + displayVx;
    const endY = y + displayVy;

    drawLineDataSpace(ctx, xScale, yScale, x, y, endX, endY, color, 1.5);
  }
}

/**
 * Calculate deterministic trajectory (no noise)
 * dx = vectorField(x, y, t) * dt
 */
function calculateDeterministicTrajectory(
  startPos: Pair<number>,
  xScale: Scale,
  yScale: Scale,
  numSteps: number
): Pair<number>[] {
  const trajectory: Pair<number>[] = [];
  let [x, y] = startPos;
  const dt = 1.0 / numSteps;

  for (let i = 0; i <= numSteps; i++) {
    trajectory.push([x, y]);

    if (i < numSteps) {
      const t = i * dt;
      const [vx, vy] = vectorField(x, y, t, xScale, yScale);
      x += vx * dt;
      y += vy * dt;

      // Stop if trajectory goes off canvas
      const [xMin, xMax] = xScale.domain;
      const [yMin, yMax] = yScale.domain;
      if (x < xMin || x > xMax || y < yMin || y > yMax) {
        break;
      }
    }
  }

  return trajectory;
}


/**
 * Solve SDE using Euler-Maruyama method with pre-generated noise
 * dx = vectorField(x, y, t) * dt + sigma(t) * dW
 */
function solveSDE(
  startPos: Pair<number>,
  xScale: Scale,
  yScale: Scale,
  numSteps: number,
  diffusionScheduler: DiffusionCoefficientScheduler,
  noise: Pair<number>[]
): Pair<number>[] {
  const path: Pair<number>[] = [startPos];
  let [x, y] = startPos;
  const dt = 1.0 / numSteps;

  for (let i = 0; i < numSteps; i++) {
    const t = i * dt;
    const [vx, vy] = vectorField(x, y, t, xScale, yScale);

    // Get time-dependent diffusion coefficient
    const sigma = diffusionScheduler.getDiffusion(t);

    // Use pre-generated noise scaled by sigma(t)
    const [dWx, dWy] = noise[i];

    // Euler-Maruyama step: x_{t+dt} = x_t + drift * dt + sigma(t) * dW
    x = x + vx * dt + sigma * dWx;
    y = y + vy * dt + sigma * dWy;

    path.push([x, y]);

    // Stop if trajectory goes off canvas
    const [xMin, xMax] = xScale.domain;
    const [yMin, yMax] = yScale.domain;
    if (x < xMin || x > xMax || y < yMin || y > yMax) {
      break;
    }
  }

  return path;
}

/**
 * Draw a trajectory
 */
function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  path: Pair<number>[],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
  color: string,
  lineWidth: number
): void {
  if (path.length < 2) {return;}

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();

  const [x0, y0] = path[0];
  ctx.moveTo(xScale(x0), yScale(y0));

  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i];
    ctx.lineTo(xScale(x), yScale(y));
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Set up SDE visualization with drift field
 */
function setUpSDEVisualization(canvas: HTMLCanvasElement, container: HTMLElement): void {
  const ctx = getContext(canvas);

  // Define coordinate system (same as vf.html)
  const xRange = [0, 200] as [number, number];
  const yRange = [0, 150] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  // Parameters
  const deterministicSteps = 500; // Fixed high resolution for deterministic trajectory
  let numSteps = 150; // Variable steps for stochastic trajectory
  let dt = 1.0 / numSteps;
  const initialMaxDiffusion = 10.0;
  let diffusionScheduler: DiffusionCoefficientScheduler =
    makeConstantDiffusionCoefficientScheduler(initialMaxDiffusion);

  let dotPosition: Pair<number> | null = null;
  let deterministicTrajectory: Pair<number>[] = [];
  let stochasticTrajectory: Pair<number>[] = [];
  let storedNoise: Pair<number>[] = generateNoiseForSDE(numSteps, dt);
  let currentTime = 0;
  let showDeterministic = true;
  let showStochastic = true;
  let updateDiffusionVizCallback:
    | ((scheduler: DiffusionCoefficientScheduler, time: number) => void)
    | null = null;

  function render(time: number): void {
    currentTime = time;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw vector field
    drawVectorField(ctx, xScale, yScale, currentTime);

    // Draw deterministic trajectory if enabled
    if (showDeterministic && dotPosition && deterministicTrajectory.length > 0) {
      drawTrajectory(ctx, deterministicTrajectory, xScale, yScale, '#888', 2);
    }

    // Draw stochastic trajectory if enabled
    if (showStochastic && dotPosition && stochasticTrajectory.length > 0) {
      drawTrajectory(ctx, stochasticTrajectory, xScale, yScale, '#2196F3', 2);
    }

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, 10);

    // Draw dot at current position along trajectory
    if (dotPosition) {
      let currentPos: Pair<number>;

      if (showStochastic && stochasticTrajectory.length > 0) {
        const trajectoryIndex = Math.min(
          Math.floor(currentTime * (stochasticTrajectory.length - 1)),
          stochasticTrajectory.length - 1
        );
        currentPos = stochasticTrajectory[trajectoryIndex];
      } else if (showDeterministic && deterministicTrajectory.length > 0) {
        const trajectoryIndex = Math.min(
          Math.floor(currentTime * (deterministicTrajectory.length - 1)),
          deterministicTrajectory.length - 1
        );
        currentPos = deterministicTrajectory[trajectoryIndex];
      } else {
        currentPos = dotPosition;
      }

      dot.render(currentPos);
    }

    // Update diffusion visualization if callback is set
    if (updateDiffusionVizCallback) {
      updateDiffusionVizCallback(diffusionScheduler, currentTime);
    }
  }

  // Trajectories section
  const trajectoriesDiv = document.createElement('div');
  trajectoriesDiv.className = 'trajectories';
  container.appendChild(trajectoriesDiv);

  // Add checkbox for deterministic trajectory
  const detLabel = document.createElement('label');
  const detCheckbox = document.createElement('input');
  detCheckbox.type = 'checkbox';
  detCheckbox.checked = showDeterministic;
  detLabel.appendChild(detCheckbox);
  detLabel.appendChild(document.createTextNode('Show deterministic trajectory'));
  trajectoriesDiv.appendChild(detLabel);

  detCheckbox.addEventListener('change', () => {
    showDeterministic = detCheckbox.checked;
    render(currentTime);
  });

  // Add checkbox for stochastic trajectory
  const stochLabel = document.createElement('label');
  const stochCheckbox = document.createElement('input');
  stochCheckbox.type = 'checkbox';
  stochCheckbox.checked = showStochastic;
  stochLabel.appendChild(stochCheckbox);
  stochLabel.appendChild(document.createTextNode('Show stochastic trajectory'));
  trajectoriesDiv.appendChild(stochLabel);

  stochCheckbox.addEventListener('change', () => {
    showStochastic = stochCheckbox.checked;
    render(currentTime);
  });

  // Add steps slider
  const stepsDiv = document.createElement('div');
  stepsDiv.className = 'steps-control';
  container.appendChild(stepsDiv);

  let wasPlayingBeforeStepsChange = false;
  const stepsSliderWidget = addSlider(stepsDiv, {
    label: 'Steps: ',
    min: 10,
    max: 300,
    step: 1,
    initialValue: numSteps,
    className: 'slider steps-slider',
    onChange: (steps: number): void => {
      numSteps = Math.round(steps);
      dt = 1.0 / numSteps;

      // Regenerate noise with new number of steps
      storedNoise = generateNoiseForSDE(numSteps, dt);

      // Recalculate stochastic trajectory only (deterministic stays at fixed resolution)
      if (dotPosition) {
        stochasticTrajectory = solveSDE(
          dotPosition, xScale, yScale, numSteps, diffusionScheduler, storedNoise
        );
      }

      currentTime = 0;
      sliderControls.update(0);
      render(0);
    }
  });

  stepsSliderWidget.slider.addEventListener('mousedown', () => {
    const playPauseBtn = container.querySelector('button');
    wasPlayingBeforeStepsChange = playPauseBtn?.textContent === 'Pause';
    if (wasPlayingBeforeStepsChange && playPauseBtn) {
      playPauseBtn.click();
    }
  });

  stepsSliderWidget.slider.addEventListener('mouseup', () => {
    if (wasPlayingBeforeStepsChange) {
      const playPauseBtn = container.querySelector('button');
      if (playPauseBtn?.textContent === 'Play') {
        playPauseBtn.click();
      }
    }
  });

  // Add regenerate noise button
  const regenerateDiv = document.createElement('div');
  regenerateDiv.className = 'regenerate-control';
  container.appendChild(regenerateDiv);

  const regenerateButton = document.createElement('button');
  regenerateButton.textContent = 'Regenerate noise';
  regenerateDiv.appendChild(regenerateButton);

  regenerateButton.addEventListener('click', () => {
    // Generate new noise
    storedNoise = generateNoiseForSDE(numSteps, dt);

    // Recalculate stochastic trajectory with new noise
    if (dotPosition) {
      stochasticTrajectory = solveSDE(
        dotPosition, xScale, yScale, numSteps, diffusionScheduler, storedNoise
      );
    }

    currentTime = 0;
    sliderControls.update(0);
    render(0);
  });

  // Add diffusion coefficient section
  const diffusionCoefficientDiv = document.createElement('div');
  diffusionCoefficientDiv.className = 'diffusion-coefficient';
  container.appendChild(diffusionCoefficientDiv);

  const diffusionVizTitle = document.createElement('h3');
  diffusionVizTitle.textContent = 'Diffusion coefficient';
  diffusionCoefficientDiv.appendChild(diffusionVizTitle);

  const updateDiffusionViz = initDiffusionCoefficientVisualizationWidget(diffusionCoefficientDiv);

  // Set the callback so render() can update the visualization
  updateDiffusionVizCallback = updateDiffusionViz;

  // Add diffusion coefficient selection (select menu and slider)
  initDiffusionCoefficientSelectionWidget(
    diffusionCoefficientDiv,
    (diffusionType: string, maxDiffusion: number) => {
      // Update diffusion scheduler
      diffusionScheduler = getDiffusionScheduler(diffusionType, maxDiffusion);

      // Recalculate trajectory with new scheduler
      if (dotPosition) {
        stochasticTrajectory = solveSDE(
          dotPosition, xScale, yScale, numSteps, diffusionScheduler, storedNoise
        );
      }

      currentTime = 0;
      sliderControls.update(0);
      render(0);
    },
    {
      maxValue: 20,
      defaultValue: 10.0,
      step: 0.1
    }
  );

  // Initialize time slider (last)
  const sliderControls = initTimeSliderWidget(container, currentTime, render, {
    loop: true,
    autostart: true,
    pauseAtEnd: 1000,
    onLoopStart: () => {
      // Just loop, don't regenerate noise automatically
    }
  });

  // Track whether animation was playing before dragging
  let wasPlayingBeforeDrag = false;

  // Add mousedown listener to pause and store playing state
  canvas.addEventListener('mousedown', () => {
    const playPauseBtn = container.querySelector('button');
    wasPlayingBeforeDrag = playPauseBtn?.textContent === 'Pause';
    if (wasPlayingBeforeDrag && playPauseBtn) {
      playPauseBtn.click(); // Pause the animation
    }
  });

  // Add mouseup listener to resume if it was playing
  canvas.addEventListener('mouseup', () => {
    if (wasPlayingBeforeDrag) {
      const playPauseBtn = container.querySelector('button');
      if (playPauseBtn?.textContent === 'Play') {
        playPauseBtn.click(); // Resume the animation
      }
    }
  });

  // Create movable dot
  const dot = createMovableDot(
    canvas,
    ctx,
    xScale,
    yScale,
    [0, 0],
    {
      radius: 6,
      fill: '#FF5722',
      onChange: (newPosition: Pair<number>) => {
        dotPosition = newPosition;
        deterministicTrajectory = calculateDeterministicTrajectory(
          dotPosition,
          xScale,
          yScale,
          deterministicSteps
        );
        stochasticTrajectory = solveSDE(
          dotPosition, xScale, yScale, numSteps, diffusionScheduler, storedNoise
        );

        currentTime = 0;
        sliderControls.update(0);
        render(0);
      }
    }
  );

  // Set initial dot position (randomly in leftmost third, middle 80% vertically)
  const initialX = Math.random() * (xRange[1] / 3);
  const initialY = yRange[0] + 0.1 * yRange[1] + Math.random() * 0.8 * yRange[1];
  dotPosition = [initialX, initialY];
  deterministicTrajectory = calculateDeterministicTrajectory(
    dotPosition, xScale, yScale, deterministicSteps
  );
  stochasticTrajectory = solveSDE(
    dotPosition, xScale, yScale, numSteps, diffusionScheduler, storedNoise
  );

  // Initial render (this will call updateDiffusionViz via the wrapped render function)
  render(0);
}

export function initSdeWidget(container: HTMLElement): void {
  removePlaceholder(container);
  const canvas = addCanvas(container, { width: '480', height: '350' });
  setUpSDEVisualization(canvas, container);
}

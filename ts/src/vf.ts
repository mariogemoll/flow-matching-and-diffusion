import { addFrameUsingScales, createMovableDot, getContext } from 'web-ui-common/canvas';
import { addCanvas, addDiv, addEl, removePlaceholder } from 'web-ui-common/dom';
import type { Pair, Scale } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import { addSlider } from './slider';
import { initTimeSliderWidget } from './time-slider';
import { drawLineDataSpace } from './vector-field-view-common';

/**
 * Returns velocity [vx, vy] at position (x, y) and time t
 * Coordinates are in data space
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
 * Calculate trajectory using Euler integration
 */
function calculateTrajectory(
  startPos: Pair<number>,
  xScale: Scale,
  yScale: Scale,
  steps = 500
): Pair<number>[] {
  const trajectory: Pair<number>[] = [];
  let [x, y] = startPos;
  const dt = 1.0 / steps; // Time step depends on number of steps

  for (let i = 0; i <= steps; i++) {
    trajectory.push([x, y]);

    if (i < steps) {
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
 * Draw trajectory as a line
 */
function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  xScale: Scale,
  yScale: Scale,
  trajectory: Pair<number>[]
): void {
  if (trajectory.length < 2) {return;}

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();

  const [x0, y0] = trajectory[0];
  ctx.moveTo(xScale(x0), yScale(y0));

  for (let i = 1; i < trajectory.length; i++) {
    const [x, y] = trajectory[i];
    ctx.lineTo(xScale(x), yScale(y));
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Draw the vector field on a grid in data space
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

interface VectorFieldOptions {
  eulerMethod?: boolean;
  showTrajectory?: boolean;
}

function setUpVectorField(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  options: VectorFieldOptions = {}
): void {
  const { eulerMethod = false } = options;
  const ctx = getContext(canvas);

  const xRange = [0, 200] as [number, number];
  const yRange = [0, 150] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let currentTime = 0;
  let dotPosition: Pair<number> | null = null;
  let trajectory: Pair<number>[] = [];
  let showTrajectory = options.showTrajectory ?? false;
  let steps = 8; // For Euler method demonstration
  let discreteTrajectory: Pair<number>[] = []; // Coarse trajectory for Euler demo
  // Show Euler approximation trajectory by default in Euler mode
  let showEulerApproximationTrajectory = eulerMethod;

  function render(time: number): void {
    currentTime = time;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the vector field
    drawVectorField(ctx, xScale, yScale, currentTime);

    // Draw trajectory if enabled
    if (showTrajectory && dotPosition && trajectory.length > 0) {
      drawTrajectory(ctx, xScale, yScale, trajectory);
    }

    // Draw Euler step line if enabled
    if (eulerMethod && showEulerApproximationTrajectory && discreteTrajectory.length > 0) {
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();

      const [x0, y0] = discreteTrajectory[0];
      ctx.moveTo(xScale(x0), yScale(y0));

      for (let i = 1; i < discreteTrajectory.length; i++) {
        const [x, y] = discreteTrajectory[i];
        ctx.lineTo(xScale(x), yScale(y));
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, 10);

    // Draw dot at current position along trajectory
    if (dotPosition) {
      let currentPos: Pair<number>;

      if (eulerMethod && discreteTrajectory.length > 0) {
        // Use discrete trajectory for Euler demonstration
        const stepIndex = Math.min(
          Math.floor(currentTime * steps),
          discreteTrajectory.length - 1
        );
        currentPos = discreteTrajectory[stepIndex];
      } else if (trajectory.length > 0) {
        // Use smooth trajectory
        const trajectoryIndex = Math.min(
          Math.floor(currentTime * (trajectory.length - 1)),
          trajectory.length - 1
        );
        currentPos = trajectory[trajectoryIndex];
      } else {
        currentPos = dotPosition;
      }

      dot.render(currentPos);
    }
  }

  const controls = addDiv(container, {});
  controls.className = 'controls';

  const optionsContainer = addDiv(controls, {});
  optionsContainer.className = 'options';

  // Create checkbox for trajectory display
  if (eulerMethod) {
    // Real trajectory checkbox
    const trajectoryLabel = addEl(optionsContainer, 'label', {}) as HTMLLabelElement;
    const trajectoryCheckbox = addEl(trajectoryLabel, 'input', {
      type: 'checkbox',
      checked: showTrajectory.toString()
    }) as HTMLInputElement;
    trajectoryCheckbox.checked = showTrajectory;
    trajectoryLabel.appendChild(document.createTextNode(' Show trajectory'));

    trajectoryCheckbox.addEventListener('change', () => {
      showTrajectory = trajectoryCheckbox.checked;
      render(currentTime);
    });

    // Euler approximation trajectory checkbox
    const eulerApproximationTrajectoryLabel = addEl(
      optionsContainer,
      'label',
      {}
    ) as HTMLLabelElement;
    const eulerApproximationTrajectoryCheckbox = addEl(
      eulerApproximationTrajectoryLabel,
      'input',
      {
        type: 'checkbox',
        checked: showEulerApproximationTrajectory.toString()
      }
    ) as HTMLInputElement;
    eulerApproximationTrajectoryCheckbox.checked = showEulerApproximationTrajectory;
    eulerApproximationTrajectoryLabel.appendChild(
      document.createTextNode(' Show Euler approximation')
    );

    eulerApproximationTrajectoryCheckbox.addEventListener('change', () => {
      showEulerApproximationTrajectory = eulerApproximationTrajectoryCheckbox.checked;
      render(currentTime);
    });
  } else {
    // Standard trajectory checkbox for non-Euler mode
    const trajectoryLabel = addEl(optionsContainer, 'label', {}) as HTMLLabelElement;
    const trajectoryCheckbox = addEl(trajectoryLabel, 'input', {
      type: 'checkbox',
      checked: showTrajectory.toString()
    }) as HTMLInputElement;
    trajectoryCheckbox.checked = showTrajectory;
    trajectoryLabel.appendChild(document.createTextNode(' Display trajectory'));

    trajectoryCheckbox.addEventListener('change', () => {
      showTrajectory = trajectoryCheckbox.checked;
      render(currentTime);
    });
  }

  // Add Euler steps slider if in Euler method mode
  let stepsSliderWidget: { slider: HTMLInputElement; getValue: () => number } | undefined;
  if (eulerMethod) {
    stepsSliderWidget = addSlider(controls, {
      label: 'Steps: ',
      min: 2,
      max: 100,
      step: 1,
      initialValue: steps,
      className: 'slider steps-slider',
      onChange: (newSteps: number): void => {
        steps = Math.round(newSteps);
      }
    });
  }

  // Initialize time slider with looping and autostart
  const sliderControls = initTimeSliderWidget(container, currentTime, render, {
    loop: true,
    autostart: true,
    steps: eulerMethod ? steps : undefined
  });

  // Add Euler steps slider event handlers after sliderControls is available
  if (eulerMethod && stepsSliderWidget) {
    let wasPlaying = false;

    stepsSliderWidget.slider.addEventListener('mousedown', () => {
      // Store playing state and pause
      wasPlaying = sliderControls.playPauseBtn.textContent === 'Pause';
      if (wasPlaying) {
        sliderControls.playPauseBtn.click();
      }
    });

    stepsSliderWidget.slider.addEventListener('input', () => {
      steps = Math.round(stepsSliderWidget.getValue());

      // Update slider steps
      sliderControls.setSteps(steps);

      // Recalculate discrete trajectory
      if (dotPosition) {
        discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, steps);
      }

      currentTime = 0;
      sliderControls.update(0);
      render(0);
    });

    stepsSliderWidget.slider.addEventListener('mouseup', () => {
      // Resume if it was playing
      if (wasPlaying && sliderControls.playPauseBtn.textContent === 'Play') {
        sliderControls.playPauseBtn.click();
      }
    });
  }

  // Track whether animation was playing before dragging
  let wasPlayingBeforeDrag = false;

  // Add mousedown listener to pause and store playing state
  canvas.addEventListener('mousedown', () => {
    wasPlayingBeforeDrag = sliderControls.playPauseBtn.textContent === 'Pause';
    if (wasPlayingBeforeDrag) {
      sliderControls.playPauseBtn.click(); // Pause the animation
    }
  });

  // Add mouseup listener to resume if it was playing
  canvas.addEventListener('mouseup', () => {
    if (wasPlayingBeforeDrag && sliderControls.playPauseBtn.textContent === 'Play') {
      sliderControls.playPauseBtn.click(); // Resume the animation
    }
  });

  // Create movable dot
  const dot = createMovableDot(
    canvas,
    ctx,
    xScale,
    yScale,
    [0, 0], // Initial position (center)
    {
      radius: 6,
      fill: '#FF5722',
      onChange: (newPosition: Pair<number>) => {
        dotPosition = newPosition;
        trajectory = calculateTrajectory(dotPosition, xScale, yScale);

        if (eulerMethod) {
          discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, steps);
        }

        currentTime = 0;
        sliderControls.update(0); // Reset time to 0
        render(0);
      }
    }
  );

  // Set initial dot position (randomly in leftmost third, middle 80% vertically)
  const initialX = Math.random() * (xRange[1] / 3);
  const initialY = yRange[0] + 0.1 * yRange[1] + Math.random() * 0.8 * yRange[1];
  dotPosition = [initialX, initialY];
  trajectory = calculateTrajectory(dotPosition, xScale, yScale);

  if (eulerMethod) {
    discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, steps);
  }

  // Initial render
  render(0);
}

export function initVectorFieldWidget(container: HTMLElement): void {
  removePlaceholder(container);
  const canvas = addCanvas(container, { width: '480', height: '350' });
  setUpVectorField(canvas, container, { showTrajectory: true });
}

export function initEulerMethodWidget(container: HTMLElement): void {
  removePlaceholder(container);
  const canvas = addCanvas(container, { width: '480', height: '350' });
  setUpVectorField(canvas, container, { eulerMethod: true, showTrajectory: true });
}

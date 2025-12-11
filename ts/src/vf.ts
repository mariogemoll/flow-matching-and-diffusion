import { addFrameUsingScales, createMovableDot, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import type { Pair, Scale } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
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
  showEulerSteps?: boolean;
}

function setUpVectorField(canvas: HTMLCanvasElement, options: VectorFieldOptions = {}): void {
  const { showEulerSteps = false } = options;
  const ctx = getContext(canvas);
  const container = canvas.parentElement;
  if (!container) {
    throw new Error('Canvas must have a parent element');
  }

  const xRange = [0, 200] as [number, number];
  const yRange = [0, 150] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let currentTime = 0;
  let dotPosition: Pair<number> | null = null;
  let trajectory: Pair<number>[] = [];
  let showTrajectory = showEulerSteps; // Show trajectory by default in Euler mode
  let eulerSteps = 4; // For Euler demonstration
  let discreteTrajectory: Pair<number>[] = []; // Coarse trajectory for Euler demo
  let showEulerStepsPoints = showEulerSteps; // Show Euler approximation by default in Euler mode

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
    if (showEulerSteps && showEulerStepsPoints && discreteTrajectory.length > 0) {
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

      if (showEulerSteps && discreteTrajectory.length > 0) {
        // Use discrete trajectory for Euler demonstration
        const stepIndex = Math.min(
          Math.floor(currentTime * eulerSteps),
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

  // Create flex container for controls (two columns)
  const controlsContainer = document.createElement('div');
  controlsContainer.style.display = 'flex';
  controlsContainer.style.gap = '40px';
  controlsContainer.style.marginTop = '16px';
  container.appendChild(controlsContainer);

  // Left column: sliders
  const slidersColumn = document.createElement('div');
  controlsContainer.appendChild(slidersColumn);

  // Right column: checkboxes
  const checkboxesColumn = document.createElement('div');
  checkboxesColumn.style.display = 'flex';
  checkboxesColumn.style.flexDirection = 'column';
  checkboxesColumn.style.gap = '8px';
  controlsContainer.appendChild(checkboxesColumn);

  // Initialize time slider with looping and autostart
  const sliderControls = initTimeSliderWidget(slidersColumn, currentTime, render, {
    loop: true,
    autostart: true,
    steps: showEulerSteps ? eulerSteps : undefined
  });

  // Create checkbox for trajectory display
  const trajectoryCheckboxContainer = document.createElement('div');
  trajectoryCheckboxContainer.style.display = 'flex';
  trajectoryCheckboxContainer.style.alignItems = 'center';
  checkboxesColumn.appendChild(trajectoryCheckboxContainer);

  const trajectoryCheckbox = document.createElement('input');
  trajectoryCheckbox.type = 'checkbox';
  trajectoryCheckbox.id = 'show-trajectory';
  trajectoryCheckbox.checked = showTrajectory;
  trajectoryCheckboxContainer.appendChild(trajectoryCheckbox);

  const trajectoryLabel = document.createElement('label');
  trajectoryLabel.htmlFor = 'show-trajectory';
  trajectoryLabel.textContent = ' Display trajectory';
  trajectoryLabel.style.marginLeft = '4px';
  trajectoryLabel.style.cursor = 'pointer';
  trajectoryCheckboxContainer.appendChild(trajectoryLabel);

  trajectoryCheckbox.addEventListener('change', () => {
    showTrajectory = trajectoryCheckbox.checked;
    render(currentTime);
  });

  // Add Euler steps slider if in demonstration mode
  if (showEulerSteps) {
    const eulerStepsContainer = document.createElement('div');
    eulerStepsContainer.style.marginTop = '16px';
    slidersColumn.appendChild(eulerStepsContainer);

    const eulerStepsLabel = document.createElement('label');
    eulerStepsLabel.textContent = 'Euler steps: ';
    eulerStepsContainer.appendChild(eulerStepsLabel);

    const eulerStepsSlider = document.createElement('input');
    eulerStepsSlider.type = 'range';
    eulerStepsSlider.min = '2';
    eulerStepsSlider.max = '100';
    eulerStepsSlider.step = '1';
    eulerStepsSlider.value = eulerSteps.toString();
    eulerStepsSlider.style.width = '320px';
    eulerStepsSlider.style.marginLeft = '8px';
    eulerStepsContainer.appendChild(eulerStepsSlider);

    const eulerStepsValue = document.createElement('span');
    eulerStepsValue.textContent = eulerSteps.toString();
    eulerStepsValue.style.marginLeft = '8px';
    eulerStepsContainer.appendChild(eulerStepsValue);

    let wasPlaying = false;

    eulerStepsSlider.addEventListener('mousedown', () => {
      // Store playing state and pause
      const playPauseBtn = controlsContainer.querySelector('button');
      wasPlaying = playPauseBtn?.textContent === 'Pause';
      if (wasPlaying && playPauseBtn) {
        playPauseBtn.click();
      }
    });

    eulerStepsSlider.addEventListener('input', () => {
      eulerSteps = parseInt(eulerStepsSlider.value);
      eulerStepsValue.textContent = eulerSteps.toString();

      // Update slider steps
      sliderControls.setSteps(eulerSteps);

      // Recalculate discrete trajectory
      if (dotPosition) {
        discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, eulerSteps);
      }

      currentTime = 0;
      sliderControls.update(0);
      render(0);
    });

    eulerStepsSlider.addEventListener('mouseup', () => {
      // Resume if it was playing
      if (wasPlaying) {
        const playPauseBtn = controlsContainer.querySelector('button');
        if (playPauseBtn?.textContent === 'Play') {
          playPauseBtn.click();
        }
      }
    });

    // Add checkbox to show Euler approximation
    const eulerApproxCheckboxContainer = document.createElement('div');
    eulerApproxCheckboxContainer.style.display = 'flex';
    eulerApproxCheckboxContainer.style.alignItems = 'center';
    checkboxesColumn.appendChild(eulerApproxCheckboxContainer);

    const eulerStepsPointsCheckbox = document.createElement('input');
    eulerStepsPointsCheckbox.type = 'checkbox';
    eulerStepsPointsCheckbox.id = 'show-euler-steps-points';
    eulerStepsPointsCheckbox.checked = showEulerStepsPoints;
    eulerApproxCheckboxContainer.appendChild(eulerStepsPointsCheckbox);

    const eulerStepsPointsLabel = document.createElement('label');
    eulerStepsPointsLabel.htmlFor = 'show-euler-steps-points';
    eulerStepsPointsLabel.textContent = ' Display Euler approximation';
    eulerStepsPointsLabel.style.marginLeft = '4px';
    eulerStepsPointsLabel.style.cursor = 'pointer';
    eulerApproxCheckboxContainer.appendChild(eulerStepsPointsLabel);

    eulerStepsPointsCheckbox.addEventListener('change', () => {
      showEulerStepsPoints = eulerStepsPointsCheckbox.checked;
      render(currentTime);
    });
  }

  // Track whether animation was playing before dragging
  let wasPlayingBeforeDrag = false;

  // Add mousedown listener to pause and store playing state
  canvas.addEventListener('mousedown', () => {
    const playPauseBtn = controlsContainer.querySelector('button');
    wasPlayingBeforeDrag = playPauseBtn?.textContent === 'Pause';
    if (wasPlayingBeforeDrag && playPauseBtn) {
      playPauseBtn.click(); // Pause the animation
    }
  });

  // Add mouseup listener to resume if it was playing
  canvas.addEventListener('mouseup', () => {
    if (wasPlayingBeforeDrag) {
      const playPauseBtn = controlsContainer.querySelector('button');
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
    [0, 0], // Initial position (center)
    {
      radius: 6,
      fill: '#FF5722',
      onChange: (newPosition: Pair<number>) => {
        dotPosition = newPosition;
        trajectory = calculateTrajectory(dotPosition, xScale, yScale);

        if (showEulerSteps) {
          discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, eulerSteps);
        }

        currentTime = 0;
        sliderControls.update(0); // Reset time to 0
        render(0);
      }
    }
  );

  // Set initial dot position
  dotPosition = [90, 90];
  trajectory = calculateTrajectory(dotPosition, xScale, yScale);

  if (showEulerSteps) {
    discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, eulerSteps);
  }

  // Initial render
  render(0);
}

function run(): void {
  const canvas1 = el(document, '#vf-canvas') as HTMLCanvasElement;
  const canvas2 = el(document, '#vf-canvas2') as HTMLCanvasElement;

  setUpVectorField(canvas1);
  setUpVectorField(canvas2, { showEulerSteps: true });
}

run();

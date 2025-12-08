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
  const dt = 0.01;
  const timeStep = 1.0 / steps;

  for (let i = 0; i < steps; i++) {
    trajectory.push([x, y]);
    const t = i * timeStep;
    const [vx, vy] = vectorField(x, y, t, xScale, yScale);
    x += vx * dt;
    y += vy * dt;

    // Stop if trajectory goes off canvas
    const dataWidth = xScale.domain[1];
    const dataHeight = yScale.domain[1];
    if (x < 0 || x > dataWidth || y < 0 || y > dataHeight) {
      break;
    }
  }

  return trajectory;
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
  const spacing = 40; // Spacing in data space
  const displayScale = 0.15;
  const vectors: { x: number; y: number; vx: number; vy: number; length: number }[] = [];
  let maxLength = 0;

  // Get data dimensions from scales
  const dataWidth = xScale.domain[1];
  const dataHeight = yScale.domain[1];

  // Compute all vectors and find max magnitude
  for (let x = spacing; x < dataWidth; x += spacing) {
    for (let y = spacing; y < dataHeight; y += spacing) {
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

function setUpVectorField(): void {
  const canvas = el(document, '#vf-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const container = el(document, 'body') as HTMLElement;

  const xRange = [0, 800] as [number, number];
  const yRange = [0, 600] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let currentTime = 0;
  let dotPosition: Pair<number> | null = null;
  let trajectory: Pair<number>[] = [];

  function render(time: number): void {
    currentTime = time;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the vector field
    drawVectorField(ctx, xScale, yScale, currentTime);

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, 10);

    // Draw dot at current position along trajectory
    if (dotPosition && trajectory.length > 0) {
      const trajectoryIndex = Math.min(
        Math.floor(currentTime * (trajectory.length - 1)),
        trajectory.length - 1
      );
      const currentPos = trajectory[trajectoryIndex];
      dot.render(currentPos);
    }
  }

  // Initialize time slider with animation controls
  const updateSlider = initTimeSliderWidget(container, currentTime, render);

  // Create movable dot
  const dot = createMovableDot(
    canvas,
    ctx,
    xScale,
    yScale,
    [400, 300], // Initial position (center)
    {
      radius: 6,
      fill: '#FF5722',
      onChange: (newPosition: Pair<number>) => {
        dotPosition = newPosition;
        trajectory = calculateTrajectory(dotPosition, xScale, yScale);
        currentTime = 0;
        updateSlider(0); // Reset time to 0
        render(0);
      }
    }
  );

  // Set initial dot position
  dotPosition = [400, 300];
  trajectory = calculateTrajectory(dotPosition, xScale, yScale);

  // Initial render
  render(0);
}

function run(): void {
  setUpVectorField();
}

run();

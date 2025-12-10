import {
  addDot,
  addFrameUsingScales,
  defaultMargins,
  getContext
} from 'web-ui-common/canvas';
import { addCanvas } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { sampleStandardNormalPoints } from './conditional-tfjs-logic';
import { generateBrownianNoise } from './conditional-trajectory-logic';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import type { GaussianComponent } from './gaussian';
import type { NoiseScheduler } from './math/noise-scheduler';
import { drawStandardNormalBackground } from './vector-field-view-common';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;

// Compute marginal score function: ∇ log pt(x) for a Gaussian mixture
function computeMarginalScore(
  x: number,
  y: number,
  components: GaussianComponent[],
  alpha: number,
  beta: number
): [number, number] {
  const gammas: number[] = [];
  let totalProb = 0;

  const alpha2 = alpha * alpha;
  const beta2 = beta * beta;

  // Compute mixture weights (posterior probabilities)
  for (const comp of components) {
    const [muX, muY] = comp.mean;
    const [[covXX, covXY], [, covYY]] = comp.covariance;

    const meanX = alpha * muX;
    const meanY = alpha * muY;
    const sigmaXX = alpha2 * covXX + beta2;
    const sigmaXY = alpha2 * covXY;
    const sigmaYY = alpha2 * covYY + beta2;

    const det = sigmaXX * sigmaYY - sigmaXY * sigmaXY;
    if (det <= 1e-10) {
      gammas.push(0);
      continue;
    }

    const invXX = sigmaYY / det;
    const invXY = -sigmaXY / det;
    const invYY = sigmaXX / det;

    const dx = x - meanX;
    const dy = y - meanY;

    const quadForm = dx * (invXX * dx + invXY * dy) + dy * (invXY * dx + invYY * dy);
    const normalization = 1 / (2 * Math.PI * Math.sqrt(det));
    const prob = comp.weight * normalization * Math.exp(-0.5 * quadForm);

    gammas.push(prob);
    totalProb += prob;
  }

  if (totalProb < 1e-10) {
    return [0, 0];
  }

  // Normalize mixture weights
  for (let k = 0; k < gammas.length; k++) {
    gammas[k] /= totalProb;
  }

  // Compute weighted sum of conditional scores
  // For Gaussian: ∇ log p(x|z) = -(x - α*μ) / β²
  let scoreX = 0;
  let scoreY = 0;

  for (let k = 0; k < components.length; k++) {
    const comp = components[k];
    const [muX, muY] = comp.mean;
    const [[covXX, covXY], [, covYY]] = comp.covariance;

    const alpha2 = alpha * alpha;
    const beta2 = beta * beta;

    const sigmaXX = alpha2 * covXX + beta2;
    const sigmaXY = alpha2 * covXY;
    const sigmaYY = alpha2 * covYY + beta2;

    const det = sigmaXX * sigmaYY - sigmaXY * sigmaXY;
    if (det <= 1e-10) {
      continue;
    }

    const invXX = sigmaYY / det;
    const invXY = -sigmaXY / det;
    const invYY = sigmaXX / det;

    const dx = x - alpha * muX;
    const dy = y - alpha * muY;

    // ∇ log p(x|z_k) = -Σ^{-1} * (x - μ)
    const gradX = -(invXX * dx + invXY * dy);
    const gradY = -(invXY * dx + invYY * dy);

    scoreX += gammas[k] * gradX;
    scoreY += gammas[k] * gradY;
  }

  return [scoreX, scoreY];
}

// Compute marginal vector field (same as in marginal-vector-field-view.ts)
function computeMarginalVectorField(
  x: number,
  y: number,
  components: GaussianComponent[],
  alpha: number,
  beta: number,
  alphaDot: number,
  betaDot: number
): [number, number] {
  const gammas: number[] = [];
  let totalProb = 0;

  const alpha2 = alpha * alpha;
  const beta2 = beta * beta;

  for (const comp of components) {
    const [muX, muY] = comp.mean;
    const [[covXX, covXY], [, covYY]] = comp.covariance;

    const meanX = alpha * muX;
    const meanY = alpha * muY;
    const sigmaXX = alpha2 * covXX + beta2;
    const sigmaXY = alpha2 * covXY;
    const sigmaYY = alpha2 * covYY + beta2;

    const det = sigmaXX * sigmaYY - sigmaXY * sigmaXY;
    if (det <= 1e-10) {
      gammas.push(0);
      continue;
    }

    const invXX = sigmaYY / det;
    const invXY = -sigmaXY / det;
    const invYY = sigmaXX / det;

    const dx = x - meanX;
    const dy = y - meanY;

    const quadForm = dx * (invXX * dx + invXY * dy) + dy * (invXY * dx + invYY * dy);
    const normalization = 1 / (2 * Math.PI * Math.sqrt(det));
    const prob = comp.weight * normalization * Math.exp(-0.5 * quadForm);

    gammas.push(prob);
    totalProb += prob;
  }

  if (totalProb < 1e-10) {
    return [0, 0];
  }

  for (let k = 0; k < gammas.length; k++) {
    gammas[k] /= totalProb;
  }

  const betaRatio = beta > 1e-10 ? betaDot / beta : 0;
  const coeff = alphaDot - betaRatio * alpha;

  let ux = betaRatio * x;
  let uy = betaRatio * y;

  for (let k = 0; k < components.length; k++) {
    const comp = components[k];
    const [muX, muY] = comp.mean;
    const [[covXX, covXY], [, covYY]] = comp.covariance;

    const alpha2 = alpha * alpha;
    const beta2 = beta * beta;

    const sigmaXX = alpha2 * covXX + beta2;
    const sigmaXY = alpha2 * covXY;
    const sigmaYY = alpha2 * covYY + beta2;

    const det = sigmaXX * sigmaYY - sigmaXY * sigmaXY;
    if (det <= 1e-10) {
      continue;
    }

    const invXX = sigmaYY / det;
    const invXY = -sigmaXY / det;
    const invYY = sigmaXX / det;

    const dx = x - alpha * muX;
    const dy = y - alpha * muY;

    const termX = alpha * (covXX * (invXX * dx + invXY * dy) + covXY * (invXY * dx + invYY * dy));
    const termY = alpha * (covXY * (invXX * dx + invXY * dy) + covYY * (invXY * dx + invYY * dy));

    const targetX = muX + termX;
    const targetY = muY + termY;

    ux += coeff * gammas[k] * targetX;
    uy += coeff * gammas[k] * targetY;
  }

  return [ux, uy];
}

function getAlphaDerivative(scheduler: NoiseScheduler, t: number): number {
  const dt = 1e-5;
  const alpha1 = scheduler.getAlpha(Math.max(0, t - dt));
  const alpha2 = scheduler.getAlpha(Math.min(1, t + dt));
  return (alpha2 - alpha1) / (2 * dt);
}

function getBetaDerivative(scheduler: NoiseScheduler, t: number): number {
  const dt = 1e-5;
  const beta1 = scheduler.getBeta(Math.max(0, t - dt));
  const beta2 = scheduler.getBeta(Math.min(1, t + dt));
  return (beta2 - beta1) / (2 * dt);
}

// Calculate marginal SDE trajectory: dXt = [u_t(Xt) + (σ²/2) ∇log pt(Xt)] dt + σ dWt
function calculateMarginalSDETrajectory(
  initialSample: Pair<number>,
  components: GaussianComponent[],
  scheduler: NoiseScheduler,
  frameTimes: number[],
  diffusionCoeff: number,
  brownianNoise: Pair<number>[]
): Pair<number>[] {
  const trajectory: Pair<number>[] = [];
  let [x, y] = initialSample;

  for (let i = 0; i < frameTimes.length; i++) {
    trajectory.push([x, y]);

    if (i < frameTimes.length - 1) {
      const t = frameTimes[i];
      const dt = frameTimes[i + 1] - frameTimes[i];

      const alpha = scheduler.getAlpha(t);
      const beta = scheduler.getBeta(t);
      const alphaDot = getAlphaDerivative(scheduler, t);
      const betaDot = getBetaDerivative(scheduler, t);

      // Compute drift: u_t(x) + (σ²/2) ∇log pt(x)
      const [ux, uy] = computeMarginalVectorField(x, y, components, alpha, beta, alphaDot, betaDot);
      const [scoreX, scoreY] = computeMarginalScore(x, y, components, alpha, beta);

      const driftX = ux + (diffusionCoeff * diffusionCoeff * scoreX) / 2;
      const driftY = uy + (diffusionCoeff * diffusionCoeff * scoreY) / 2;

      // Add diffusion term
      const [dWx, dWy] = brownianNoise[i];
      x += driftX * dt + diffusionCoeff * dWx;
      y += driftY * dt + diffusionCoeff * dWy;
    }
  }

  return trajectory;
}

function createFrameTimes(stepCount: number): number[] {
  const frameTimes: number[] = [];
  for (let frame = 0; frame <= stepCount; frame++) {
    frameTimes.push(frame / stepCount);
  }
  return frameTimes;
}

export interface MarginalSDEViewControls {
  updateComponents: (components: GaussianComponent[]) => void;
  updateTime: (time: number) => void;
  updateStepCount: (stepCount: number) => void;
  updateScheduler: (scheduler: NoiseScheduler) => void;
  updateDiffusion: (diffusion: number) => void;
}

const MIN_STEP_COUNT = 10;
const MAX_STEP_COUNT = 2000;
const MIN_DIFFUSION = 0;
const MAX_DIFFUSION = 3;

export function initMarginalSDEView(
  container: HTMLElement,
  initialComponents: GaussianComponent[],
  initialScheduler: NoiseScheduler,
  initialStepCount: number,
  initialDiffusion: number
): MarginalSDEViewControls {
  const canvas = addCanvas(container, { width: `${CANVAS_WIDTH}`, height: `${CANVAS_HEIGHT}` });
  const ctx = getContext(canvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const xScale = makeScale(xRange, [defaultMargins.left, CANVAS_WIDTH - defaultMargins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - defaultMargins.bottom, defaultMargins.top]);

  let currentComponents = initialComponents;
  let currentScheduler = initialScheduler;
  let currentTime = 0;
  let initialSamples: [number, number][] = [];
  let showTrajectories = true;
  let precomputedTrajectories: Pair<number>[][] = [];
  let stepCount = initialStepCount;
  let diffusionCoeff = initialDiffusion;
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

  function precomputeStochasticTrajectories(): void {
    const frameTimes = createFrameTimes(stepCount);

    precomputedTrajectories = initialSamples.map((sample, idx) =>
      calculateMarginalSDETrajectory(
        sample,
        currentComponents,
        currentScheduler,
        frameTimes,
        diffusionCoeff,
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
        if (trajectory.length < 2) {
          continue;
        }

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

    const closestFrameIndex = getFrameIndexForTime(currentTime);

    for (const trajectory of precomputedTrajectories) {
      const position = trajectory[closestFrameIndex];
      const px = xScale(position[0]);
      const py = yScale(position[1]);
      addDot(ctx, px, py, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    }
  }

  function updateComponents(components: GaussianComponent[]): void {
    currentComponents = components;
    precomputeStochasticTrajectories();
    render();
  }

  function updateTime(time: number): void {
    currentTime = time;
    render();
  }

  function updateStepCount(newStepCount: number): void {
    stepCount = Math.max(MIN_STEP_COUNT, Math.min(MAX_STEP_COUNT, Math.round(newStepCount)));
    generateNoiseMatrices();
    precomputeStochasticTrajectories();
    render();
  }

  function updateDiffusion(newDiffusion: number): void {
    diffusionCoeff = Math.max(
      MIN_DIFFUSION,
      Math.min(MAX_DIFFUSION, parseFloat(newDiffusion.toFixed(3)))
    );
    precomputeStochasticTrajectories();
    render();
  }

  function updateScheduler(newScheduler: NoiseScheduler): void {
    currentScheduler = newScheduler;
    precomputeStochasticTrajectories();
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
    precomputeStochasticTrajectories();
    render();
  }

  function resampleNoise(): void {
    generateNoiseMatrices();
    precomputeStochasticTrajectories();
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

  generateNoiseMatrices();
  precomputeStochasticTrajectories();
  render();

  return { updateComponents, updateTime, updateStepCount, updateDiffusion, updateScheduler };
}

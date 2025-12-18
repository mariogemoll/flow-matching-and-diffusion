import { addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import {
  VECTOR_FIELD_COMPRESSION_EXPONENT,
  VECTOR_FIELD_COMPRESSION_MODE,
  VECTOR_FIELD_MAX_ARROW_LENGTH,
  VECTOR_FIELD_MIN_ARROW_LENGTH
} from './constants';
import type { GaussianComponent } from './gaussian';
import type { NoiseScheduler } from './math/noise-scheduler';
import {
  createSampleButtons,
  drawLineDataSpace,
  drawSamplePoints,
  drawStandardNormalBackground
} from './vector-field-view-common';

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 350;
const NUM_SAMPLES = 1024;

export function initMarginalVectorFieldView(
  container: HTMLElement,
  initialComponents: GaussianComponent[],
  initialTime: number,
  scheduler: NoiseScheduler
): (components: GaussianComponent[], time: number, scheduler: NoiseScheduler) => void {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  container.appendChild(canvas);
  const ctx = getContext(canvas);

  // Helper to check if components have changed
  function componentsEqual(a: GaussianComponent[], b: GaussianComponent[]): boolean {
    if (a.length !== b.length) {return false;}
    for (let i = 0; i < a.length; i++) {
      const ca = a[i];
      const cb = b[i];
      if (ca.weight !== cb.weight) {return false;}
      if (ca.mean[0] !== cb.mean[0] || ca.mean[1] !== cb.mean[1]) {return false;}
      if (ca.covariance[0][0] !== cb.covariance[0][0]) {return false;}
      if (ca.covariance[0][1] !== cb.covariance[0][1]) {return false;}
      if (ca.covariance[1][0] !== cb.covariance[1][0]) {return false;}
      if (ca.covariance[1][1] !== cb.covariance[1][1]) {return false;}
    }
    return true;
  }

  // Helper to deep copy components
  function copyComponents(comps: GaussianComponent[]): GaussianComponent[] {
    return comps.map(c => ({
      weight: c.weight,
      mean: [c.mean[0], c.mean[1]] as [number, number],
      covariance: [
        [c.covariance[0][0], c.covariance[0][1]],
        [c.covariance[1][0], c.covariance[1][1]]
      ] as [[number, number], [number, number]]
    }));
  }

  // State
  let components = initialComponents;
  let currentTime = initialTime;
  let currentScheduler = scheduler;
  let rightInitialSamples: [number, number][] = [];
  let rightCurrentSamples: [number, number][] = [];
  let lastPropagationTime = 0;
  let lastComponents = copyComponents(initialComponents);

  // Define coordinate system
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, CANVAS_WIDTH - margins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - margins.bottom, margins.top]);

  // Create sample/clear buttons
  const { updateButtonStates } = createSampleButtons({
    container,
    onSample: () => {
      if (Math.abs(currentTime) >= 0.01) {
        return;
      }

      const samples = tf.randomNormal([NUM_SAMPLES, 2], 0, 1);
      const flat = samples.dataSync() as Float32Array;

      rightInitialSamples = [];
      rightCurrentSamples = [];
      for (let i = 0; i < NUM_SAMPLES; i++) {
        const sx = flat[2 * i];
        const sy = flat[2 * i + 1];
        rightInitialSamples.push([sx, sy]);
        rightCurrentSamples.push([sx, sy]);
      }

      lastPropagationTime = 0;
      samples.dispose();
      render();
    },
    onClear: () => {
      rightInitialSamples = [];
      rightCurrentSamples = [];
      lastPropagationTime = 0;
      render();
    }
  });

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
      if (det <= 1e-10) {continue;}

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

  function drawMarginalVectorField(
    ctx: CanvasRenderingContext2D,
    xScale: ReturnType<typeof makeScale>,
    yScale: ReturnType<typeof makeScale>,
    components: GaussianComponent[],
    t: number,
    scheduler: NoiseScheduler
  ): void {
    // Clamp time to avoid the star pattern at t=1
    const clampedTime = Math.min(t, 0.999);

    const alpha = scheduler.getAlpha(clampedTime);
    const beta = scheduler.getBeta(clampedTime);

    const alphaDot = getAlphaDerivative(scheduler, clampedTime);
    const betaDot = getBetaDerivative(scheduler, clampedTime);

    const gridSize = 30;
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const dx = (xMax - xMin) / gridSize;
    const dy = (yMax - yMin) / gridSize;

    // Compute all vectors and find max magnitude
    const vectors: {x: number; y: number; vx: number; vy: number; length: number}[] = [];
    let maxLength = 0;

    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const [vx, vy] = computeMarginalVectorField(
          x,
          y,
          components,
          alpha,
          beta,
          alphaDot,
          betaDot
        );
        const length = Math.sqrt(vx * vx + vy * vy);
        maxLength = Math.max(maxLength, length);
        vectors.push({ x, y, vx, vy, length });
      }
    }

    // Compression settings
    const lengthRange = VECTOR_FIELD_MAX_ARROW_LENGTH - VECTOR_FIELD_MIN_ARROW_LENGTH;
    const normalizationFactor = VECTOR_FIELD_COMPRESSION_MODE === 'log'
      ? Math.log(maxLength + 1)
      : Math.pow(maxLength, VECTOR_FIELD_COMPRESSION_EXPONENT);

    // Draw all vectors with compressed variable length
    for (const { x, y, vx, vy, length } of vectors) {
      // Normalize direction (handle zero-length case)
      const dirX = length > 1e-10 ? vx / length : 1;
      const dirY = length > 1e-10 ? vy / length : 0;

      // Apply compression to magnitude
      let normalized: number;
      if (VECTOR_FIELD_COMPRESSION_MODE === 'log') {
        const lengthLog = Math.log(length + 1);
        normalized = normalizationFactor > 0 ? lengthLog / normalizationFactor : 0;
      } else {
        const lengthPowered = Math.pow(length, VECTOR_FIELD_COMPRESSION_EXPONENT);
        normalized = normalizationFactor > 0 ? lengthPowered / normalizationFactor : 0;
      }

      const clampedNormalized = Math.min(Math.max(normalized, 0), 1);

      // Color based on compressed magnitude
      const color = viridis(clampedNormalized);

      // Convert target pixel length to data space
      const targetPixelLength = VECTOR_FIELD_MIN_ARROW_LENGTH + clampedNormalized * lengthRange;

      // Approximate data-space length (using average scale)
      const dataSpacePerPixel = (xMax - xMin) / (xScale(xMax) - xScale(xMin));
      const targetDataLength = targetPixelLength * dataSpacePerPixel;

      // Draw line with compressed variable length in the direction of the vector field
      const endX = x + dirX * targetDataLength;
      const endY = y + dirY * targetDataLength;

      drawLineDataSpace(ctx, xScale, yScale, x, y, endX, endY, color);
    }
  }

  function computeMarginalVectorFieldBatch(
    samplesTensor: ReturnType<typeof tf.tensor2d>,
    components: GaussianComponent[],
    alpha: number,
    beta: number,
    alphaDot: number,
    betaDot: number
  ): ReturnType<typeof tf.tensor2d> {
    const samplesData = samplesTensor.arraySync();
    const velocities: number[][] = [];

    for (const [x, y] of samplesData) {
      const [ux, uy] = computeMarginalVectorField(
        x,
        y,
        components,
        alpha,
        beta,
        alphaDot,
        betaDot
      );
      velocities.push([ux, uy]);
    }

    return tf.tensor2d(velocities);
  }

  function updateMarginalSamples(currentT: number, forceReset = false): void {
    if (rightCurrentSamples.length === 0) {
      return;
    }

    // Reset to initial samples if time moved backwards, jumped significantly, or forced
    if (
      forceReset || currentT < lastPropagationTime || Math.abs(currentT - lastPropagationTime) > 0.1
    ) {
      rightCurrentSamples = rightInitialSamples.map(([x, y]) => [x, y]);
      lastPropagationTime = 0;
    }

    const dt = currentT - lastPropagationTime;
    if (Math.abs(dt) < 1e-6) {
      return;
    }

    const numSteps = Math.max(1, Math.ceil(Math.abs(dt) * 20));
    const stepSize = dt / numSteps;

    const newSamplesArray = tf.tidy(() => {
      let samplesTensor: ReturnType<typeof tf.tensor2d> = tf.tensor2d(rightCurrentSamples);

      for (let step = 0; step < numSteps; step++) {
        const stepT = lastPropagationTime + (step + 0.5) * stepSize;
        const alpha = currentScheduler.getAlpha(stepT);
        const beta = currentScheduler.getBeta(stepT);
        const alphaDot = getAlphaDerivative(currentScheduler, stepT);
        const betaDot = getBetaDerivative(currentScheduler, stepT);

        const velocities = computeMarginalVectorFieldBatch(
          samplesTensor,
          components,
          alpha,
          beta,
          alphaDot,
          betaDot
        );

        const updated = samplesTensor.add(velocities.mul(stepSize));
        samplesTensor = updated as ReturnType<typeof tf.tensor2d>;
      }

      return samplesTensor.arraySync();
    });

    rightCurrentSamples = newSamplesArray.map(([x, y]) => [x, y]);
    lastPropagationTime = currentT;
  }

  function getCurrentSamplePixels(): { x: number; y: number }[] {
    return rightCurrentSamples.map(([x, y]) => ({ x: xScale(x), y: yScale(y) }));
  }

  function render(forceReset = false): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Clamp time to avoid issues at t=1
    const clampedTime = Math.min(currentTime, 0.999);

    drawStandardNormalBackground(canvas, ctx, xScale, yScale, currentTime);

    drawMarginalVectorField(ctx, xScale, yScale, components, currentTime, currentScheduler);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    if (rightCurrentSamples.length > 0) {
      updateMarginalSamples(clampedTime, forceReset);
      const currentPoints = getCurrentSamplePixels();
      drawSamplePoints(ctx, currentPoints);
    }

    updateButtonStates(currentTime, rightInitialSamples.length > 0);
  }

  render();

  // Generate initial sample if starting at t=0
  if (Math.abs(initialTime) < 0.01) {
    const samples = tf.randomNormal([NUM_SAMPLES, 2], 0, 1);
    const flat = samples.dataSync() as Float32Array;

    for (let i = 0; i < NUM_SAMPLES; i++) {
      const sx = flat[2 * i];
      const sy = flat[2 * i + 1];
      rightInitialSamples.push([sx, sy]);
      rightCurrentSamples.push([sx, sy]);
    }

    lastPropagationTime = 0;
    samples.dispose();
    render();
  }

  function update(
    newComponents: GaussianComponent[],
    newTime: number,
    newScheduler: NoiseScheduler
  ): void {
    const componentsChanged = !componentsEqual(newComponents, lastComponents);
    const schedulerChanged = newScheduler !== currentScheduler;
    const needsReset = componentsChanged || schedulerChanged;

    components = newComponents;
    lastComponents = copyComponents(newComponents);
    currentTime = newTime;
    currentScheduler = newScheduler;

    render(needsReset);
  }

  return update;
}

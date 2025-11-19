import { addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import { SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import type { GaussianComponent } from './gaussian';
import { computeGaussianPdfTfjs } from './gaussian-tf';
import type { NoiseScheduler } from './math/noise-scheduler';

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
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  canvas.style.border = '1px solid #ccc';
  container.appendChild(canvas);
  const ctx = getContext(canvas);

  const controls = document.createElement('div');
  container.appendChild(controls);

  const sampleBtn = document.createElement('button');
  sampleBtn.textContent = 'Sample';
  sampleBtn.style.marginLeft = '0';
  controls.appendChild(sampleBtn);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  controls.appendChild(clearBtn);

  // State
  let components = initialComponents;
  let currentTime = initialTime;
  let currentScheduler = scheduler;
  let rightInitialSamples: [number, number][] = [];
  let rightCurrentSamples: [number, number][] = [];
  let lastPropagationTime = 0;

  // Define coordinate system
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, CANVAS_WIDTH - margins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - margins.bottom, margins.top]);

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
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);

    const alphaDot = getAlphaDerivative(scheduler, t);
    const betaDot = getBetaDerivative(scheduler, t);

    const gridSize = 20;
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const dx = (xMax - xMin) / gridSize;
    const dy = (yMax - yMin) / gridSize;

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
      }
    }

    const arrowScale = Math.min(dx, dy) * 0.4;
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
        if (length < 1e-6) {
          continue;
        }

        const normalizedLength = length / (maxLength + 1e-10);
        const colorValue = Math.min(1, normalizedLength);
        const color = viridis(colorValue);

        const scale = arrowScale / (maxLength + 1e-10);
        const endX = x + vx * scale;
        const endY = y + vy * scale;

        drawArrow(ctx, xScale, yScale, x, y, endX, endY, color);
      }
    }
  }

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    xScale: ReturnType<typeof makeScale>,
    yScale: ReturnType<typeof makeScale>,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string
  ): void {
    const px1 = xScale(x1);
    const py1 = yScale(y1);
    const px2 = xScale(x2);
    const py2 = yScale(y2);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();

    const angle = Math.atan2(py2 - py1, px2 - px1);
    const headLength = 5;

    ctx.beginPath();
    ctx.moveTo(px2, py2);
    ctx.lineTo(
      px2 - headLength * Math.cos(angle - Math.PI / 6),
      py2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      px2 - headLength * Math.cos(angle + Math.PI / 6),
      py2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
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

  function updateMarginalSamples(currentT: number): void {
    if (rightCurrentSamples.length === 0) {
      return;
    }

    if (currentT < lastPropagationTime || Math.abs(currentT - lastPropagationTime) > 0.1) {
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

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (Math.abs(currentTime) < 0.01) {
      const result = computeGaussianPdfTfjs(
        canvas,
        ctx,
        xScale,
        yScale,
        0,
        0,
        1,
        false
      );
      ctx.putImageData(result.imageData, 0, 0);
    }

    drawMarginalVectorField(ctx, xScale, yScale, components, currentTime, currentScheduler);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    if (rightCurrentSamples.length > 0) {
      updateMarginalSamples(currentTime);
      const currentPoints = getCurrentSamplePixels();
      ctx.save();
      ctx.fillStyle = SAMPLED_POINT_COLOR;
      for (const point of currentPoints) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, SAMPLED_POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }

    updateButtonStates();
  }

  function updateButtonStates(): void {
    sampleBtn.disabled = Math.abs(currentTime) >= 0.01;
    clearBtn.disabled = rightInitialSamples.length === 0;
  }

  sampleBtn.addEventListener('click', () => {
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
  });

  clearBtn.addEventListener('click', () => {
    rightInitialSamples = [];
    rightCurrentSamples = [];
    lastPropagationTime = 0;
    render();
  });

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
    components = newComponents;
    currentTime = newTime;
    currentScheduler = newScheduler;
    render();
  }

  return update;
}

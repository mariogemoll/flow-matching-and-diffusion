import type { Scale } from 'web-ui-common/types';

import {
  VECTOR_FIELD_COMPRESSION_EXPONENT,
  VECTOR_FIELD_COMPRESSION_MODE,
  VECTOR_FIELD_MAX_ARROW_LENGTH,
  VECTOR_FIELD_MIN_ARROW_LENGTH
} from './constants';
import { drawGaussianContours } from './gaussian';
import { computeGaussianPdfTfjs } from './gaussian-tf';
import type { NoiseScheduler } from './math/noise-scheduler';

export const MIN_VARIANCE = 0.0001;

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

export interface GaussianParams {
  mean: [number, number];
  variance: number;
}

export function computeGaussianParams(
  noiseScheduler: NoiseScheduler,
  dataPoint: [number, number],
  t: number
): GaussianParams {
  const alpha = noiseScheduler.getAlpha(t);
  const beta = noiseScheduler.getBeta(t);
  const mean: [number, number] = [
    alpha * dataPoint[0],
    alpha * dataPoint[1]
  ];
  const variance = Math.max(beta * beta, MIN_VARIANCE);
  return { mean, variance };
}

export interface GaussianFrameConfig {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  xScale: Scale;
  yScale: Scale;
  mean: [number, number];
  variance: number;
  withContours: boolean;
}

export function renderGaussianFrame({
  canvas,
  ctx,
  xScale,
  yScale,
  mean,
  variance,
  withContours
}: GaussianFrameConfig): ImageData {
  const result = computeGaussianPdfTfjs(
    canvas,
    ctx,
    xScale,
    yScale,
    mean[0],
    mean[1],
    variance,
    withContours
  );

  if (!withContours) {
    return result.imageData;
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (tempCtx === null) {
    return result.imageData;
  }

  tempCtx.putImageData(result.imageData, 0, 0);
  drawGaussianContours(
    tempCtx,
    result.probabilityGrid,
    result.maxValue,
    canvas.width,
    canvas.height
  );
  return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
}

export interface PrecomputeFramesConfig {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  xScale: Scale;
  yScale: Scale;
  noiseScheduler: NoiseScheduler;
  dataPoint: [number, number];
  frameCount: number;
  withContours: boolean;
}

export function precomputeGaussianFrames({
  canvas,
  ctx,
  xScale,
  yScale,
  noiseScheduler,
  dataPoint,
  frameCount,
  withContours
}: PrecomputeFramesConfig): ImageData[] {
  const frames: ImageData[] = [];

  for (let i = 0; i <= frameCount; i++) {
    const t = i / frameCount;
    const { mean, variance } = computeGaussianParams(noiseScheduler, dataPoint, t);
    const frame = renderGaussianFrame({
      canvas,
      ctx,
      xScale,
      yScale,
      mean,
      variance,
      withContours
    });
    frames.push(frame);
  }

  return frames;
}

export interface GlobalMaxVectorLengthConfig {
  xRange: [number, number];
  yRange: [number, number];
  dataPoint: [number, number];
  noiseScheduler: NoiseScheduler;
  vectorFieldXScale: Scale;
  vectorFieldYScale: Scale;
  referenceTime?: number;
  gridSpacing?: number;
}

export function computeGlobalMaxVectorLength({
  xRange,
  yRange,
  dataPoint,
  noiseScheduler,
  vectorFieldXScale,
  vectorFieldYScale,
  referenceTime = 0.99,
  gridSpacing = 0.5
}: GlobalMaxVectorLengthConfig): number {
  return tf.tidy(() => {
    const alpha = noiseScheduler.getAlpha(referenceTime);
    const beta = noiseScheduler.getBeta(referenceTime);
    const alphaDot = noiseScheduler.getAlphaDerivative(referenceTime);
    const betaDot = noiseScheduler.getBetaDerivative(referenceTime);

    const numX = Math.floor((xRange[1] - xRange[0]) / gridSpacing) + 1;
    const numY = Math.floor((yRange[1] - yRange[0]) / gridSpacing) + 1;

    const dataXTensor1D = tf.linspace(xRange[0], xRange[1], numX);
    const dataYTensor1D = tf.linspace(yRange[0], yRange[1], numY);

    const dataXTensor = tf.tile(dataXTensor1D.reshape([numX, 1]), [1, numY]);
    const dataYTensor = tf.tile(dataYTensor1D.reshape([1, numY]), [numX, 1]);

    const term1 = alphaDot - (betaDot / beta) * alpha;
    const term2 = betaDot / beta;

    const vxTensor = dataXTensor.mul(term2).add(term1 * dataPoint[0]);
    const vyTensor = dataYTensor.mul(term2).add(term1 * dataPoint[1]);

    const scale = 0.1;
    const endDataXTensor = dataXTensor.add(vxTensor.mul(scale));
    const endDataYTensor = dataYTensor.add(vyTensor.mul(scale));

    const pixelXArray = Array
      .from(dataXTensor.dataSync())
      .map(value => vectorFieldXScale(value));
    const pixelYArray = Array
      .from(dataYTensor.dataSync())
      .map(value => vectorFieldYScale(value));
    const endPixelXArray = Array
      .from(endDataXTensor.dataSync())
      .map(value => vectorFieldXScale(value));
    const endPixelYArray = Array
      .from(endDataYTensor.dataSync())
      .map(value => vectorFieldYScale(value));

    const pixelXTensor = tf.tensor(pixelXArray, [numX, numY]);
    const pixelYTensor = tf.tensor(pixelYArray, [numX, numY]);
    const endPixelXTensor = tf.tensor(endPixelXArray, [numX, numY]);
    const endPixelYTensor = tf.tensor(endPixelYArray, [numX, numY]);

    const dxTensor = endPixelXTensor.sub(pixelXTensor);
    const dyTensor = endPixelYTensor.sub(pixelYTensor);
    const lengthsTensor = tf.sqrt(dxTensor.square().add(dyTensor.square()));

    const maxLength = lengthsTensor.max().dataSync()[0];

    pixelXTensor.dispose();
    pixelYTensor.dispose();
    endPixelXTensor.dispose();
    endPixelYTensor.dispose();
    dxTensor.dispose();
    dyTensor.dispose();
    lengthsTensor.dispose();

    return maxLength;
  });
}

export interface VectorFieldArrowData {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  normalizedLength: number;
}

export interface VectorFieldArrowConfig {
  time: number;
  xRange: [number, number];
  yRange: [number, number];
  dataPoint: [number, number];
  noiseScheduler: NoiseScheduler;
  vectorFieldXScale: Scale;
  vectorFieldYScale: Scale;
  globalMaxVectorLength: number;
  gridSpacing?: number;
  compressionMode?: 'log' | 'power';
  compressionExponent?: number;
}

export function computeVectorFieldArrows({
  time,
  xRange,
  yRange,
  dataPoint,
  noiseScheduler,
  vectorFieldXScale,
  vectorFieldYScale,
  globalMaxVectorLength,
  gridSpacing = 0.5,
  compressionMode = VECTOR_FIELD_COMPRESSION_MODE,
  compressionExponent = VECTOR_FIELD_COMPRESSION_EXPONENT
}: VectorFieldArrowConfig): VectorFieldArrowData[] {
  const clampedTime = Math.max(0.001, Math.min(0.999, time));
  const alpha = noiseScheduler.getAlpha(clampedTime);
  const beta = noiseScheduler.getBeta(clampedTime);
  const alphaDot = noiseScheduler.getAlphaDerivative(clampedTime);
  const betaDot = noiseScheduler.getBetaDerivative(clampedTime);

  const numX = Math.floor((xRange[1] - xRange[0]) / gridSpacing) + 1;
  const numY = Math.floor((yRange[1] - yRange[0]) / gridSpacing) + 1;

  const dataXTensor1D = tf.linspace(xRange[0], xRange[1], numX);
  const dataYTensor1D = tf.linspace(yRange[0], yRange[1], numY);
  const dataXTensor = tf.tile(dataXTensor1D.reshape([numX, 1]), [1, numY]);
  const dataYTensor = tf.tile(dataYTensor1D.reshape([1, numY]), [numX, 1]);

  const term1 = alphaDot - (betaDot / beta) * alpha;
  const term2 = betaDot / beta;

  const vxTensor = dataXTensor.mul(term2).add(term1 * dataPoint[0]);
  const vyTensor = dataYTensor.mul(term2).add(term1 * dataPoint[1]);

  const endDataXTensor = dataXTensor.add(vxTensor.mul(0.1));
  const endDataYTensor = dataYTensor.add(vyTensor.mul(0.1));

  const dataXArray = dataXTensor.dataSync();
  const dataYArray = dataYTensor.dataSync();
  const endDataXArray = endDataXTensor.dataSync();
  const endDataYArray = endDataYTensor.dataSync();

  const arrows: VectorFieldArrowData[] = [];
  const rawLengths: number[] = [];

  for (let i = 0; i < dataXArray.length; i++) {
    const startX = vectorFieldXScale(dataXArray[i]);
    const startY = vectorFieldYScale(dataYArray[i]);
    const endX = vectorFieldXScale(endDataXArray[i]);
    const endY = vectorFieldYScale(endDataYArray[i]);
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 2) {
      continue;
    }

    arrows.push({
      startX,
      startY,
      dx,
      dy,
      normalizedLength: length
    });
    rawLengths.push(length);
  }

  dataXTensor1D.dispose();
  dataYTensor1D.dispose();
  dataXTensor.dispose();
  dataYTensor.dispose();
  vxTensor.dispose();
  vyTensor.dispose();
  endDataXTensor.dispose();
  endDataYTensor.dispose();

  if (arrows.length === 0) {
    return [];
  }

  const localMaxLength = rawLengths.reduce((acc, value) => Math.max(acc, value), 0);
  const normalizationMax = globalMaxVectorLength > 0 ? globalMaxVectorLength : localMaxLength;
  const lengthRange = VECTOR_FIELD_MAX_ARROW_LENGTH - VECTOR_FIELD_MIN_ARROW_LENGTH;
  const normalizationFactor = compressionMode === 'log'
    ? Math.log(normalizationMax + 1)
    : Math.pow(normalizationMax, compressionExponent);

  return arrows.map((arrow, index) => {
    const length = rawLengths[index];
    let normalized: number;
    if (compressionMode === 'log') {
      const lengthLog = Math.log(length + 1);
      normalized = normalizationFactor > 0 ? lengthLog / normalizationFactor : 0;
    } else {
      const lengthPowered = Math.pow(length, compressionExponent);
      normalized = normalizationFactor > 0 ? lengthPowered / normalizationFactor : 0;
    }

    const clampedNormalized = Math.min(Math.max(normalized, 0), 1);
    const targetLength = VECTOR_FIELD_MIN_ARROW_LENGTH + clampedNormalized * lengthRange;
    const scaleFactor = length > 0 ? targetLength / length : 0;

    return {
      startX: arrow.startX,
      startY: arrow.startY,
      dx: arrow.dx * scaleFactor,
      dy: arrow.dy * scaleFactor,
      normalizedLength: clampedNormalized
    };
  });
}

export interface PropagateSamplesConfig {
  initialSamples: [number, number][];
  time: number;
  dataPoint: [number, number];
  noiseScheduler: NoiseScheduler;
  vectorFieldXScale: Scale;
  vectorFieldYScale: Scale;
}

export function propagateVectorFieldSamples({
  initialSamples,
  time,
  dataPoint,
  noiseScheduler,
  vectorFieldXScale,
  vectorFieldYScale
}: PropagateSamplesConfig): { x: number; y: number }[] {
  const clampedTime = Math.max(0, Math.min(1, time));
  return initialSamples.map(sample => {
    const beta0 = noiseScheduler.getBeta(0);
    const betaT = noiseScheduler.getBeta(Math.max(clampedTime, 0.001));
    if (beta0 === 0) {
      return {
        x: vectorFieldXScale(dataPoint[0]),
        y: vectorFieldYScale(dataPoint[1])
      };
    }
    const ratio = betaT / beta0;
    const current: [number, number] = [
      dataPoint[0] + (sample[0] - dataPoint[0]) * ratio,
      dataPoint[1] + (sample[1] - dataPoint[1]) * ratio
    ];
    return {
      x: vectorFieldXScale(current[0]),
      y: vectorFieldYScale(current[1])
    };
  });
}

export interface SampleGaussianPointsConfig {
  mean: [number, number];
  standardDeviation: number;
  count: number;
  xScale: Scale;
  yScale: Scale;
}

export function sampleGaussianPoints({
  mean,
  standardDeviation,
  count,
  xScale,
  yScale
}: SampleGaussianPointsConfig): { x: number; y: number }[] {
  const meanTensor = tf.tensor1d(mean);
  const samples = tf.randomNormal([count, 2], 0, standardDeviation);
  const adjusted = samples.add(meanTensor);
  const flat = adjusted.dataSync() as Float32Array;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const sx = flat[2 * i];
    const sy = flat[2 * i + 1];
    points.push({ x: xScale(sx), y: yScale(sy) });
  }

  meanTensor.dispose();
  samples.dispose();
  adjusted.dispose();

  return points;
}

export interface SampleStandardNormalConfig {
  count: number;
  xScale: Scale;
  yScale: Scale;
}

export function sampleStandardNormalPoints({
  count,
  xScale,
  yScale
}: SampleStandardNormalConfig): {
  initialSamples: [number, number][];
  pixelSamples: { x: number; y: number }[];
} {
  const samples = tf.randomNormal([count, 2], 0, 1);
  const flat = samples.dataSync() as Float32Array;
  const initialSamples: [number, number][] = [];
  const pixelSamples: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const sx = flat[2 * i];
    const sy = flat[2 * i + 1];
    initialSamples.push([sx, sy]);
    pixelSamples.push({ x: xScale(sx), y: yScale(sy) });
  }

  samples.dispose();

  return { initialSamples, pixelSamples };
}

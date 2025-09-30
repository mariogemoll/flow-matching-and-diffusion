

import type { AnimationState } from './animation-state';
import {
  DATA_POINT_RADIUS,
  NUM_SAMPLES,
  SAMPLED_POINT_COLOR,
  SAMPLED_POINT_RADIUS,
  VECTOR_FIELD_COMPRESSION_EXPONENT,
  VECTOR_FIELD_COMPRESSION_MODE,
  VECTOR_FIELD_MAX_ARROW_LENGTH,
  VECTOR_FIELD_MIN_ARROW_LENGTH
} from './constants';
import { drawGaussianContours } from './gaussian';
import { computeGaussianPdfTfjs } from './gaussian-tf';
import type { NoiseScheduler, NoiseSchedulerDerivative } from './noise-schedulers';
import { addDot, addFrameUsingScales, getContext } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import { makeScale } from './web-ui-common/util';

const MIN_VARIANCE = 0.0001;

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

// Viridis color map function
function viridis(t: number): string {
  // Clamp to [0, 1]
  t = Math.max(0, Math.min(1, t));

  // Viridis color map data (simplified version with key points)
  const colors = [
    [0.267004, 0.004874, 0.329415],
    [0.282623, 0.140926, 0.457517],
    [0.253935, 0.265254, 0.529983],
    [0.206756, 0.371758, 0.553117],
    [0.163625, 0.471133, 0.558148],
    [0.127568, 0.566949, 0.550556],
    [0.134692, 0.658636, 0.517649],
    [0.266941, 0.748751, 0.440573],
    [0.477504, 0.821444, 0.318195],
    [0.741388, 0.873449, 0.149561],
    [0.993248, 0.906157, 0.143936]
  ];

  // Find the two colors to interpolate between
  const scaledT = t * (colors.length - 1);
  const idx = Math.floor(scaledT);
  const frac = scaledT - idx;

  const c1 = colors[Math.min(idx, colors.length - 1)];
  const c2 = colors[Math.min(idx + 1, colors.length - 1)];

  const r = Math.round((c1[0] + (c2[0] - c1[0]) * frac) * 255);
  const g = Math.round((c1[1] + (c2[1] - c1[1]) * frac) * 255);
  const b = Math.round((c1[2] + (c2[2] - c1[2]) * frac) * 255);

  return `rgb(${r}, ${g}, ${b})`;
}

export function setUpConditionalProbabilityPathTfjsImpl(
  canvasId: string,
  playBtnId: string,
  resetBtnId: string,
  timeSliderId: string,
  timeValueId: string,
  wallTimeDisplayId: string,
  sampleBtnId: string | null,
  usePrecomputation: boolean,
  withContours: boolean,
  logPrefix: string,
  noiseScheduler: NoiseScheduler,
  noiseSchedulerDerivative: NoiseSchedulerDerivative | null = null,
  vectorFieldCanvasId: string | null = null
): void {
  const canvas = el(document, canvasId) as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const playBtn = el(document, playBtnId) as HTMLButtonElement;
  const resetBtn = el(document, resetBtnId) as HTMLButtonElement;
  const timeSlider = el(document, timeSliderId) as HTMLInputElement;
  const timeValue = el(document, timeValueId) as HTMLSpanElement;
  const wallTimeDisplay = el(document, wallTimeDisplayId) as HTMLSpanElement;
  const sampleBtn = sampleBtnId === null
    ? null
    : el(document, sampleBtnId) as HTMLButtonElement;

  // Vector field canvas (optional)
  const vectorFieldCanvas = vectorFieldCanvasId === null
    ? null
    : el(document, vectorFieldCanvasId) as HTMLCanvasElement;
  const vectorFieldCtx = vectorFieldCanvas === null ? null : getContext(vectorFieldCanvas);

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  // Vector field uses same scale
  const vectorFieldXScale = vectorFieldCanvas === null
    ? null
    : makeScale(xRange, [margins.left, vectorFieldCanvas.width - margins.right]);
  const vectorFieldYScale = vectorFieldCanvas === null
    ? null
    : makeScale(yRange, [vectorFieldCanvas.height - margins.bottom, margins.top]);

  let dataPoint: [number, number] = [1, 0.5];
  let isDragging = false;
  const animationState: AnimationState = {
    isAnimating: false,
    time: 0
  };
  let animationStartTime: number | null = null;

  const NUM_FRAMES = 60;
  let precomputedFrames: (ImageData | undefined)[] = new Array(NUM_FRAMES + 1)
    .fill(undefined) as (ImageData | undefined)[];
  let computationId = 0;
  let sampledPoints: { x: number; y: number }[] = [];
  let globalMaxVectorLength = 0; // Global max across all time points

  // Memory monitoring
  function logTensorMemory(label: string): void {
    const memInfo = tf.memory();
    const megabytes = (memInfo.numBytes / 1024 / 1024).toFixed(2);
    console.log(
      `[${label}] TF.js Memory - Tensors: ${memInfo.numTensors}, ` +
      `Bytes: ${megabytes}MB, DataBuckets: ${memInfo.numDataBuffers}`
    );

    // Check for unreasonable tensor counts
    if (memInfo.numTensors > 100) {
      console.warn(`⚠️ High tensor count detected! ${memInfo.numTensors} tensors in memory`);
      console.log('Memory breakdown:', memInfo);
    }
  }

  const computeGaussianParams = (t: number): { mean: [number, number]; variance: number } => {
    const { alpha, beta } = noiseScheduler(t);
    const mean: [number, number] = [
      alpha * dataPoint[0],
      alpha * dataPoint[1]
    ];
    const variance = Math.max(beta * beta, MIN_VARIANCE);
    return { mean, variance };
  };

  function computeGlobalMaxVectorLength(): void {
    if (vectorFieldXScale === null || vectorFieldYScale === null ||
        noiseSchedulerDerivative === null) {
      return;
    }

    console.log('Computing global max vector length at t=0.99 (using TF.js)...');
    const gridSpacing = 0.5;

    // Use t=0.99 as the reference max
    const t = 0.99;
    const { alpha, beta } = noiseScheduler(t);
    const { alphaDot, betaDot } = noiseSchedulerDerivative(t);

    // Create grid of data coordinates
    const numX = Math.floor((xRange[1] - xRange[0]) / gridSpacing) + 1;
    const numY = Math.floor((yRange[1] - yRange[0]) / gridSpacing) + 1;

    const dataXValues: number[] = [];
    const dataYValues: number[] = [];
    for (let i = 0; i < numX; i++) {
      dataXValues.push(xRange[0] + i * gridSpacing);
    }
    for (let i = 0; i < numY; i++) {
      dataYValues.push(yRange[0] + i * gridSpacing);
    }

    // Use tf.tidy to automatically clean up all tensors
    const maxLength = tf.tidy(() => {
      // Create meshgrid using TF.js
      const dataXTensor1D = tf.tensor1d(dataXValues);
      const dataYTensor1D = tf.tensor1d(dataYValues);

      // meshgrid: create 2D grids
      const dataXTensor = tf.tile(dataXTensor1D.reshape([numX, 1]), [1, numY]);
      const dataYTensor = tf.tile(dataYTensor1D.reshape([1, numY]), [numX, 1]);

      // Compute vector field: u_t^target(x|z) = (α̇_t - β̇_t/β_t α_t) z + β̇_t/β_t x
      const z = dataPoint;
      const term1 = alphaDot - (betaDot / beta) * alpha;
      const term2 = betaDot / beta;

      const vxTensor = dataXTensor.mul(term2).add(term1 * z[0]);
      const vyTensor = dataYTensor.mul(term2).add(term1 * z[1]);

      // Transform to pixel coordinates and compute lengths
      const scale = 0.1;
      const endDataXTensor = dataXTensor.add(vxTensor.mul(scale));
      const endDataYTensor = dataYTensor.add(vyTensor.mul(scale));

      // Convert to pixels (have to do this in JS since scales are JS functions)
      const dataXArray = dataXTensor.dataSync();
      const dataYArray = dataYTensor.dataSync();
      const endDataXArray = endDataXTensor.dataSync();
      const endDataYArray = endDataYTensor.dataSync();

      const pixelXArray = Array.from(dataXArray).map(x => vectorFieldXScale(x));
      const pixelYArray = Array.from(dataYArray).map(y => vectorFieldYScale(y));
      const endPixelXArray = Array.from(endDataXArray).map(x => vectorFieldXScale(x));
      const endPixelYArray = Array.from(endDataYArray).map(y => vectorFieldYScale(y));

      const pixelXTensor = tf.tensor(pixelXArray, [numX, numY]);
      const pixelYTensor = tf.tensor(pixelYArray, [numX, numY]);
      const endPixelXTensor = tf.tensor(endPixelXArray, [numX, numY]);
      const endPixelYTensor = tf.tensor(endPixelYArray, [numX, numY]);

      const dxTensor = endPixelXTensor.sub(pixelXTensor);
      const dyTensor = endPixelYTensor.sub(pixelYTensor);

      const lengthsTensor = tf.sqrt(dxTensor.square().add(dyTensor.square()));
      return lengthsTensor.max().dataSync()[0];
    });

    globalMaxVectorLength = maxLength;
    console.log(`Global max vector length at t=0.99: ${globalMaxVectorLength.toFixed(2)}px`);
  }

  function computeFrameOnTheFlyTfjs(t: number): ImageData {
    const { mean, variance } = computeGaussianParams(t);

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

    if (withContours) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = getContext(tempCanvas);
      tempCtx.putImageData(result.imageData, 0, 0);
      drawGaussianContours(
        tempCtx, result.probabilityGrid, result.maxValue, canvas.width, canvas.height
      );
      return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      return result.imageData;
    }
  }

  function computeAllFramesTfjs(): ImageData[] {
    const frames: ImageData[] = [];

    let tempCanvas: HTMLCanvasElement | undefined;
    let tempCtx: CanvasRenderingContext2D | undefined;
    if (withContours) {
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCtx = getContext(tempCanvas);
    }

    const width = canvas.width;
    const height = canvas.height;

    const pixelXs = tf.range(0, width, 1);
    const pixelYs = tf.range(0, height, 1);

    const [meshY, meshX] = tf.meshgrid(pixelYs, pixelXs);

    const dataXs = meshX.dataSync().map((px: number) => xScale.inverse(px));
    const dataYs = meshY.dataSync().map((py: number) => yScale.inverse(py));
    const dataXTensor = tf.tensor2d(dataXs, [width, height]);
    const dataYTensor = tf.tensor2d(dataYs, [width, height]);

    for (let i = 0; i <= NUM_FRAMES; i++) {
      const t = i / NUM_FRAMES;
      const { mean: interpolatedMean, variance } = computeGaussianParams(t);

      // Use tf.tidy to clean up all intermediate tensors
      const frameData = tf.tidy(() => {
        const dx = dataXTensor.sub(interpolatedMean[0]);
        const dy = dataYTensor.sub(interpolatedMean[1]);

        const dxSq = dx.square();
        const dySq = dy.square();
        const distSq = dxSq.add(dySq);
        const exponent = distSq.div(-2 * variance);
        const normalization = 1.0 / (2 * Math.PI * variance);
        const pdf = exponent.exp().mul(normalization);

        const maxValue = pdf.max().dataSync()[0];

        const normalized = pdf.div(maxValue);
        const intensity = normalized.mul(255);

        const intensityData = intensity.dataSync() as Float32Array;
        const pdfData = withContours
          ? (pdf.dataSync() as Float32Array)
          : (new Float32Array() as Float32Array);

        return { intensityData, pdfData, maxValue };
      });

      const imageData = ctx.createImageData(width, height);

      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const idx = x * height + y;
          const pixelIdx = (y * width + x) * 4;

          const intensityVal = frameData.intensityData[idx];

          imageData.data[pixelIdx] = 30;
          imageData.data[pixelIdx + 1] = 150;
          imageData.data[pixelIdx + 2] = 255;
          imageData.data[pixelIdx + 3] = intensityVal;
        }
      }

      if (withContours && tempCtx && frameData.pdfData.length > 0) {
        const probabilityGrid: number[][] = new Array(width) as number[][];
        for (let x = 0; x < width; x++) {
          probabilityGrid[x] = new Array(height) as number[];
          for (let y = 0; y < height; y++) {

            const val = frameData.pdfData[x * height + y];
            probabilityGrid[x][y] = val;
          }
        }

        tempCtx.putImageData(imageData, 0, 0);
        drawGaussianContours(
          tempCtx, probabilityGrid, frameData.maxValue, canvas.width, canvas.height
        );

        frames.push(tempCtx.getImageData(0, 0, canvas.width, canvas.height));
      } else {
        frames.push(imageData);
      }
    }

    pixelXs.dispose();
    pixelYs.dispose();
    meshX.dispose();
    meshY.dispose();
    dataXTensor.dispose();
    dataYTensor.dispose();

    return frames;
  }

  function clearPrecomputedFrames(): void {
    precomputedFrames = new Array(NUM_FRAMES + 1).fill(undefined) as (ImageData | undefined)[];
  }

  function precomputeFrames(): void {
    if (!usePrecomputation) {
      return;
    }

    const currentComputationId = ++computationId;
    const msg = `[${logPrefix} #${String(currentComputationId)}] Starting frame precomputation...`;
    console.log(msg);
    const startTime = performance.now();

    const frames = computeAllFramesTfjs();
    precomputedFrames = frames;

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    const finishMsg = `[${logPrefix} #${String(currentComputationId)}] Finished ` +
                      `${String(NUM_FRAMES + 1)} frames in ${duration}ms`;
    console.log(finishMsg);
  }

  function renderVectorField(): void {
    if (vectorFieldCtx === null || vectorFieldCanvas === null ||
        vectorFieldXScale === null || vectorFieldYScale === null ||
        noiseSchedulerDerivative === null) {
      return;
    }

    vectorFieldCtx.clearRect(0, 0, vectorFieldCanvas.width, vectorFieldCanvas.height);
    addFrameUsingScales(vectorFieldCtx, vectorFieldXScale, vectorFieldYScale, 11);

    let t = animationState.time;

    // Clamp t to avoid exact 0 or 1 where beta would be exactly 0
    // Use approximations instead: t∈[0.001, 0.999]
    t = Math.max(0.001, Math.min(0.999, t));

    const { alpha, beta } = noiseScheduler(t);
    const { alphaDot, betaDot } = noiseSchedulerDerivative(t);

    // Draw vector field on a grid using TF.js
    const gridSpacing = 0.5; // data coordinates

    // Create grid of data coordinates
    const numX = Math.floor((xRange[1] - xRange[0]) / gridSpacing) + 1;
    const numY = Math.floor((yRange[1] - yRange[0]) / gridSpacing) + 1;

    const dataXValues: number[] = [];
    const dataYValues: number[] = [];
    for (let i = 0; i < numX; i++) {
      dataXValues.push(xRange[0] + i * gridSpacing);
    }
    for (let i = 0; i < numY; i++) {
      dataYValues.push(yRange[0] + i * gridSpacing);
    }

    // Use tf.tidy to automatically clean up intermediate tensors
    const { vectors, maxLength } = tf.tidy(() => {
      // Create meshgrid using TF.js
      const dataXTensor1D = tf.tensor1d(dataXValues);
      const dataYTensor1D = tf.tensor1d(dataYValues);

      const dataXTensor = tf.tile(dataXTensor1D.reshape([numX, 1]), [1, numY]);
      const dataYTensor = tf.tile(dataYTensor1D.reshape([1, numY]), [numX, 1]);

      // Compute vector field: u_t^target(x|z) = (α̇_t - β̇_t/β_t α_t) z + β̇_t/β_t x
      const z = dataPoint;
      const term1 = alphaDot - (betaDot / beta) * alpha;
      const term2 = betaDot / beta;

      const vxTensor = dataXTensor.mul(term2).add(term1 * z[0]);
      const vyTensor = dataYTensor.mul(term2).add(term1 * z[1]);

      // Transform to pixel coordinates
      const scale = 0.1;
      const endDataXTensor = dataXTensor.add(vxTensor.mul(scale));
      const endDataYTensor = dataYTensor.add(vyTensor.mul(scale));

      // Convert to pixels (scales are JS functions)
      const dataXArray = dataXTensor.dataSync();
      const dataYArray = dataYTensor.dataSync();
      const endDataXArray = endDataXTensor.dataSync();
      const endDataYArray = endDataYTensor.dataSync();

      const pixelXArray = Array.from(dataXArray).map(x => vectorFieldXScale(x));
      const pixelYArray = Array.from(dataYArray).map(y => vectorFieldYScale(y));
      const endPixelXArray = Array.from(endDataXArray).map(x => vectorFieldXScale(x));
      const endPixelYArray = Array.from(endDataYArray).map(y => vectorFieldYScale(y));

      const pixelXTensor = tf.tensor(pixelXArray, [numX, numY]);
      const pixelYTensor = tf.tensor(pixelYArray, [numX, numY]);
      const endPixelXTensor = tf.tensor(endPixelXArray, [numX, numY]);
      const endPixelYTensor = tf.tensor(endPixelYArray, [numX, numY]);

      const dxTensor = endPixelXTensor.sub(pixelXTensor);
      const dyTensor = endPixelYTensor.sub(pixelYTensor);

      const lengthsTensor = tf.sqrt(dxTensor.square().add(dyTensor.square()));

      // Filter out vectors that are too small (length < 2)
      const maskTensor = lengthsTensor.greater(2);

      // Get arrays for rendering
      const pixelXs = pixelXTensor.dataSync();
      const pixelYs = pixelYTensor.dataSync();
      const dxs = dxTensor.dataSync();
      const dys = dyTensor.dataSync();
      const lengths = lengthsTensor.dataSync();
      const mask = maskTensor.dataSync();

      // Build vectors array
      const vectors: {
        pixelX: number;
        pixelY: number;
        dx: number;
        dy: number;
        length: number;
      }[] = [];

      for (let i = 0; i < lengths.length; i++) {
        if (mask[i]) {
          vectors.push({
            pixelX: pixelXs[i],
            pixelY: pixelYs[i],
            dx: dxs[i],
            dy: dys[i],
            length: lengths[i]
          });
        }
      }

      const maxLength = lengthsTensor.max().dataSync()[0];

      return { vectors, maxLength };
    });

    // Second pass: draw arrows normalized to global max
    const useGlobalMax = globalMaxVectorLength > 0;
    const normalizationMax = useGlobalMax ? globalMaxVectorLength : maxLength;

    // Debugging disabled - set to true to enable logging
    // const percentOfMax = (maxLength / normalizationMax * 100).toFixed(1);
    // console.log(
    //   `t=${animationState.time.toFixed(2)} | BEFORE: ` +
    //   `min=${minLength.toFixed(2)}px, max=${maxLength.toFixed(2)}px ` +
    //   `(${percentOfMax}% of global)`
    // );

    // Use compression for better visibility across the huge dynamic range
    const lengthRange = VECTOR_FIELD_MAX_ARROW_LENGTH - VECTOR_FIELD_MIN_ARROW_LENGTH;

    // Track actual rendered arrow lengths
    let actualMaxRendered = 0;
    let actualMinRendered = Infinity;

    // Precompute normalization factor based on mode
    const normalizationFactor = VECTOR_FIELD_COMPRESSION_MODE === 'log'
      ? Math.log(normalizationMax + 1)
      : Math.pow(normalizationMax, VECTOR_FIELD_COMPRESSION_EXPONENT);

    for (const { pixelX, pixelY, dx, dy, length } of vectors) {
      // Apply compression and normalize
      let normalized: number;
      if (VECTOR_FIELD_COMPRESSION_MODE === 'log') {
        // Logarithmic: log(1 + x) / log(1 + max)
        const lengthLog = Math.log(length + 1);
        normalized = normalizationFactor > 0 ? lengthLog / normalizationFactor : 0;
      } else {
        // Power: x^p / max^p
        const lengthPowered = Math.pow(length, VECTOR_FIELD_COMPRESSION_EXPONENT);
        normalized = normalizationFactor > 0 ? lengthPowered / normalizationFactor : 0;
      }

      const targetLength = VECTOR_FIELD_MIN_ARROW_LENGTH + normalized * lengthRange;

      // Scale to target length
      const currentLength = Math.sqrt(dx * dx + dy * dy);
      const scale = currentLength > 0 ? targetLength / currentLength : 0;
      const scaledDx = dx * scale;
      const scaledDy = dy * scale;
      const endPixelX = pixelX + scaledDx;
      const endPixelY = pixelY + scaledDy;

      // Track actual rendered length
      actualMaxRendered = Math.max(actualMaxRendered, targetLength);
      actualMinRendered = Math.min(actualMinRendered, targetLength);

      // Map normalized value to viridis color
      const color = viridis(normalized);

      // Draw arrow
      vectorFieldCtx.strokeStyle = color;
      vectorFieldCtx.fillStyle = color;
      vectorFieldCtx.lineWidth = 1;
      vectorFieldCtx.beginPath();
      vectorFieldCtx.moveTo(pixelX, pixelY);
      vectorFieldCtx.lineTo(endPixelX, endPixelY);
      vectorFieldCtx.stroke();

      // Draw arrowhead
      const angle = Math.atan2(scaledDy, scaledDx);
      const headLen = 5;
      vectorFieldCtx.beginPath();
      vectorFieldCtx.moveTo(endPixelX, endPixelY);
      vectorFieldCtx.lineTo(
        endPixelX - headLen * Math.cos(angle - Math.PI / 6),
        endPixelY - headLen * Math.sin(angle - Math.PI / 6)
      );
      vectorFieldCtx.lineTo(
        endPixelX - headLen * Math.cos(angle + Math.PI / 6),
        endPixelY - headLen * Math.sin(angle + Math.PI / 6)
      );
      vectorFieldCtx.closePath();
      vectorFieldCtx.fill();
    }

    // Debugging disabled - set to true to enable logging
    // const modeStr = VECTOR_FIELD_COMPRESSION_MODE === 'log'
    //   ? 'log'
    //   : `power(${VECTOR_FIELD_COMPRESSION_EXPONENT})`;
    // console.log(
    //   `t=${animationState.time.toFixed(2)} | AFTER ${modeStr}: ` +
    //   `rendered arrows ${actualMinRendered.toFixed(2)}px to ${actualMaxRendered.toFixed(2)}px ` +
    //   `(target: ${VECTOR_FIELD_MIN_ARROW_LENGTH}-${VECTOR_FIELD_MAX_ARROW_LENGTH}px)`
    // );

    // Draw the data point
    const dataPointPixelX = vectorFieldXScale(dataPoint[0]);
    const dataPointPixelY = vectorFieldYScale(dataPoint[1]);
    addDot(vectorFieldCtx, dataPointPixelX, dataPointPixelY, DATA_POINT_RADIUS, '#2196F3');
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let imageData: ImageData;
    if (usePrecomputation) {
      const frameIndex = Math.round(animationState.time * NUM_FRAMES);
      const frame = precomputedFrames[frameIndex];
      imageData = frame ?? computeFrameOnTheFlyTfjs(animationState.time);
    } else {
      imageData = computeFrameOnTheFlyTfjs(animationState.time);
    }
    ctx.putImageData(imageData, 0, 0);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    const dataPointPixelX = xScale(dataPoint[0]);
    const dataPointPixelY = yScale(dataPoint[1]);
    addDot(ctx, dataPointPixelX, dataPointPixelY, DATA_POINT_RADIUS, '#2196F3');

    sampledPoints.forEach(({ x, y }) => {
      addDot(ctx, x, y, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    });

    // Render vector field if enabled
    renderVectorField();
  }

  function animate(): void {
    if (animationState.isAnimating) {
      animationState.time += 1 / 60;

      if (animationStartTime !== null) {
        const wallTime = performance.now() - animationStartTime;
        wallTimeDisplay.textContent = `${wallTime.toFixed(0)}ms`;
      }

      if (animationState.time >= 1) {
        animationState.time = 1;
        animationState.isAnimating = false;
        playBtn.textContent = 'Play';
      }
      timeSlider.value = animationState.time.toString();
      timeValue.textContent = animationState.time.toFixed(2);
      render();
    }
    requestAnimationFrame(animate);
  }

  function getMousePosition(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    return [pixelX, pixelY];
  }

  function isPointNear(px: number, py: number, x: number, y: number, threshold = 15): boolean {
    return Math.sqrt((px - x) ** 2 + (py - y) ** 2) < threshold;
  }

  canvas.addEventListener('mousedown', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const dataPointPixelX = xScale(dataPoint[0]);
    const dataPointPixelY = yScale(dataPoint[1]);

    if (isPointNear(pixelX, pixelY, dataPointPixelX, dataPointPixelY)) {
      isDragging = true;
      clearPrecomputedFrames();
      canvas.style.cursor = 'grabbing';
      sampledPoints = [];
      render();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const dataPointPixelX = xScale(dataPoint[0]);
    const dataPointPixelY = yScale(dataPoint[1]);

    if (isDragging) {
      dataPoint = [xScale.inverse(pixelX), yScale.inverse(pixelY)];
      render();
    } else if (isPointNear(pixelX, pixelY, dataPointPixelX, dataPointPixelY)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isDragging) {
      computeGlobalMaxVectorLength();
      precomputeFrames();
    }
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
      computeGlobalMaxVectorLength();
      precomputeFrames();
    }
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  playBtn.addEventListener('click', () => {
    if (!animationState.isAnimating) {
      if (animationState.time >= 1) {
        animationState.time = 0;
      }
      animationStartTime = performance.now();
      animationState.isAnimating = true;
      playBtn.textContent = 'Pause';
      sampledPoints = [];
    } else {
      animationState.isAnimating = false;
      playBtn.textContent = 'Play';
    }
  });

  resetBtn.addEventListener('click', () => {
    animationState.time = 0;
    animationState.isAnimating = false;
    playBtn.textContent = 'Play';
    timeSlider.value = '0';
    timeValue.textContent = '0.00';
    dataPoint = [1, 0.5];
    animationStartTime = null;
    wallTimeDisplay.textContent = '';
    precomputeFrames();
    sampledPoints = [];
    render();
  });

  timeSlider.addEventListener('input', () => {
    animationState.time = parseFloat(timeSlider.value);
    timeValue.textContent = animationState.time.toFixed(2);
    if (animationState.isAnimating) {
      animationState.isAnimating = false;
      playBtn.textContent = 'Play';
    }
    animationStartTime = null;
    sampledPoints = [];
    render();
  });

  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      if (animationState.isAnimating) {
        return;
      }

      const { mean, variance } = computeGaussianParams(animationState.time);
      const sd = Math.sqrt(variance);
      sampledPoints = [];

      for (let i = 0; i < NUM_SAMPLES; i++) {
        const [sampleX, sampleY] = sample2DGaussian(mean, sd);
        sampledPoints.push({
          x: xScale(sampleX),
          y: yScale(sampleY)
        });
      }

      render();
    });
  }

  computeGlobalMaxVectorLength();
  precomputeFrames();
  render();

  // Memory check on demand - press 'm' key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      logTensorMemory('MANUAL CHECK');
    }
  });

  animate();
}

function sample2DGaussian(mean: [number, number], standardDeviation: number): [number, number] {
  const u1 = Math.random();
  const u2 = Math.random();
  const radius = Math.sqrt(-2 * Math.log(u1)) * standardDeviation;
  const theta = 2 * Math.PI * u2;
  const offsetX = radius * Math.cos(theta);
  const offsetY = radius * Math.sin(theta);
  return [mean[0] + offsetX, mean[1] + offsetY];
}

export function setUpConditionalProbabilityPathTfjs(
  noiseScheduler: NoiseScheduler
): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs',
    '#playBtnTfjs',
    '#resetBtnTfjs',
    '#timeSliderTfjs',
    '#timeValueTfjs',
    '#wallTimeTfjs',
    null,
    false,
    true,
    'TF.js on-the-fly',
    noiseScheduler
  );
}

export function setUpConditionalProbabilityPathTfjsPrecompute(
  noiseScheduler: NoiseScheduler
): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-precompute',
    '#playBtnTfjsPrecompute',
    '#resetBtnTfjsPrecompute',
    '#timeSliderTfjsPrecompute',
    '#timeValueTfjsPrecompute',
    '#wallTimeTfjsPrecompute',
    null,
    true,
    true,
    'TF.js with precomputation',
    noiseScheduler
  );
}

export function setUpConditionalProbabilityPathTfjsNoContours(
  noiseScheduler: NoiseScheduler,
  noiseSchedulerDerivative: NoiseSchedulerDerivative | null = null,
  vectorFieldCanvasId: string | null = null
): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-no-contours',
    '#playBtnTfjsNoContours',
    '#resetBtnTfjsNoContours',
    '#timeSliderTfjsNoContours',
    '#timeValueTfjsNoContours',
    '#wallTimeTfjsNoContours',
    '#sampleBtnTfjsNoContours',
    false,
    false,
    'TF.js on-the-fly (no contours)',
    noiseScheduler,
    noiseSchedulerDerivative,
    vectorFieldCanvasId
  );
}

export function setUpConditionalProbabilityPathTfjsPrecomputeNoContours(
  noiseScheduler: NoiseScheduler
): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-precompute-no-contours',
    '#playBtnTfjsPrecomputeNoContours',
    '#resetBtnTfjsPrecomputeNoContours',
    '#timeSliderTfjsPrecomputeNoContours',
    '#timeValueTfjsPrecomputeNoContours',
    '#wallTimeTfjsPrecomputeNoContours',
    null,
    true,
    false,
    'TF.js with precomputation (no contours)',
    noiseScheduler
  );
}

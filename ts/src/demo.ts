import {
  computeGaussianMixture,
  drawGaussianContours,
  drawGaussianMixturePDF,
  type GaussianComponent
} from './gaussian';
import { addDot, addFrameUsingScales, getContext } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import type { Scale } from './web-ui-common/types';
import { makeScale } from './web-ui-common/util';

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

interface AnimationState {
  isAnimating: boolean;
  time: number;
}


interface GaussianPdfResult {
  imageData: ImageData;
  probabilityGrid: number[][];
  maxValue: number;
}

function computeGaussianPdfTfjs(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  xScale: Scale,
  yScale: Scale,
  meanX: number,
  meanY: number,
  variance: number,
  withContours = false
): GaussianPdfResult {
  const width = canvas.width;
  const height = canvas.height;

  const pixelXs = tf.range(0, width, 1);
  const pixelYs = tf.range(0, height, 1);

  const [meshY, meshX] = tf.meshgrid(pixelYs, pixelXs);

  const dataXs = meshX.dataSync().map((px: number) => xScale.inverse(px));
  const dataYs = meshY.dataSync().map((py: number) => yScale.inverse(py));
  const dataXTensor = tf.tensor2d(dataXs, [width, height]);
  const dataYTensor = tf.tensor2d(dataYs, [width, height]);

  const dx = dataXTensor.sub(meanX);
  const dy = dataYTensor.sub(meanY);

  const dxSq = dx.square();
  const dySq = dy.square();
  const distSq = dxSq.add(dySq);
  const exponent = distSq.div(-2 * variance);
  const normalization = 1.0 / (2 * Math.PI * variance);
  const pdf = exponent.exp().mul(normalization);

  const maxValue = pdf.max().dataSync()[0];

  const normalized = pdf.div(maxValue);
  const intensity = normalized.mul(255);

  const imageData = ctx.createImageData(width, height);
  const intensityData = intensity.dataSync();

  // Build probability grid if needed for contours
  const probabilityGrid: number[][] = [];
  let pdfData: Float32Array | Int32Array | Uint8Array | undefined;
  if (withContours) {
    pdfData = pdf.dataSync();
    for (let x = 0; x < width; x++) {
      probabilityGrid[x] = [];
      for (let y = 0; y < height; y++) {
        const idx = x * height + y;
        probabilityGrid[x][y] = pdfData[idx];
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = x * height + y;
      const pixelIdx = (y * width + x) * 4;
      const intensityVal = intensityData[idx];

      imageData.data[pixelIdx] = 30;
      imageData.data[pixelIdx + 1] = 150;
      imageData.data[pixelIdx + 2] = 255;
      imageData.data[pixelIdx + 3] = intensityVal;
    }
  }

  pixelXs.dispose();
  pixelYs.dispose();
  meshX.dispose();
  meshY.dispose();
  dataXTensor.dispose();
  dataYTensor.dispose();
  dx.dispose();
  dy.dispose();
  dxSq.dispose();
  dySq.dispose();
  distSq.dispose();
  exponent.dispose();
  pdf.dispose();
  normalized.dispose();
  intensity.dispose();

  return { imageData, probabilityGrid, maxValue };
}

function setUpFrameExample(): void {
  const canvas = el(document, '#frame-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [0, 100] as [number, number];
  const yRange = [0, 360] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);
  addFrameUsingScales(ctx, xScale, yScale, 10);
}

function setUpGaussianCpu(): void {
  const canvas = el(document, '#gaussian-cpu-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let mean: [number, number] = [0, 0];
  let isDragging = false;

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gaussian: GaussianComponent = {
      mean,
      weight: 1,
      covariance: [[1, 0], [0, 1]]
    };

    const { probabilityGrid, maxValue } = computeGaussianMixture(
      xScale,
      yScale,
      [gaussian],
      canvas.width,
      canvas.height
    );

    drawGaussianMixturePDF(ctx, probabilityGrid, maxValue, canvas.width, canvas.height);
    drawGaussianContours(ctx, probabilityGrid, maxValue, canvas.width, canvas.height);

    addFrameUsingScales(ctx, xScale, yScale, 10);

    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);
    addDot(ctx, meanPixelX, meanPixelY, 6, '#FF5722');
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
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isDragging) {
      mean = [xScale.inverse(pixelX), yScale.inverse(pixelY)];
      render();
    } else if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  render();
}

function setUpGaussian(): void {
  const canvas = el(document, '#gaussian-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let mean: [number, number] = [0, 0];
  let isDragging = false;

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const result = computeGaussianPdfTfjs(canvas, ctx, xScale, yScale, mean[0], mean[1], 1, true);
    ctx.putImageData(result.imageData, 0, 0);
    drawGaussianContours(ctx, result.probabilityGrid, result.maxValue, canvas.width, canvas.height);

    addFrameUsingScales(ctx, xScale, yScale, 10);

    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);
    addDot(ctx, meanPixelX, meanPixelY, 6, '#FF5722');
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
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isDragging) {
      mean = [xScale.inverse(pixelX), yScale.inverse(pixelY)];
      render();
    } else if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  render();
}

function setUpConditionalProbabilityPathCpuOnTheFly(): void {
  const canvas = el(document, '#conditional-probability-canvas-cpu') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const playBtn = el(document, '#playBtnCpu') as HTMLButtonElement;
  const resetBtn = el(document, '#resetBtnCpu') as HTMLButtonElement;
  const timeSlider = el(document, '#timeSliderCpu') as HTMLInputElement;
  const timeValue = el(document, '#timeValueCpu') as HTMLSpanElement;
  const wallTimeDisplay = el(document, '#wallTimeCpu') as HTMLSpanElement;

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let dataPoint: [number, number] = [1, 0.5];
  let isDragging = false;
  const animationState: AnimationState = {
    isAnimating: false,
    time: 0
  };
  let animationStartTime: number | null = null;

  function computeFrameOnTheFly(t: number): ImageData {
    const startVariance = 1;
    const endVariance = 0.0001;

    const interpolatedMean: [number, number] = [
      t * dataPoint[0],
      t * dataPoint[1]
    ];
    const variance = startVariance + (endVariance - startVariance) * t;

    const gaussian: GaussianComponent = {
      mean: interpolatedMean,
      weight: 1,
      covariance: [[variance, 0], [0, variance]]
    };

    const { probabilityGrid, maxValue } = computeGaussianMixture(
      xScale,
      yScale,
      [gaussian],
      canvas.width,
      canvas.height
    );

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = getContext(tempCanvas);

    drawGaussianMixturePDF(tempCtx, probabilityGrid, maxValue, canvas.width, canvas.height);
    drawGaussianContours(tempCtx, probabilityGrid, maxValue, canvas.width, canvas.height);

    return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const imageData = computeFrameOnTheFly(animationState.time);
    ctx.putImageData(imageData, 0, 0);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    const dataPointPixelX = xScale(dataPoint[0]);
    const dataPointPixelY = yScale(dataPoint[1]);
    addDot(ctx, dataPointPixelX, dataPointPixelY, 6, '#2196F3');
  }

  function animate(): void {
    if (animationState.isAnimating) {
      animationState.time += 1 / 60;

      // Update wall time display
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
    }
    render();
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
      canvas.style.cursor = 'grabbing';
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
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
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
    render();
  });

  timeSlider.addEventListener('input', () => {
    animationState.time = parseFloat(timeSlider.value);
    timeValue.textContent = animationState.time.toFixed(2);
    if (animationState.isAnimating) {
      animationState.isAnimating = false;
      playBtn.textContent = 'Play';
    }
    render();
  });

  render();
  animate();
}

function setUpConditionalProbabilityPath(): void{
  const canvas = el(document, '#conditional-probability-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const playBtn = el(document, '#playBtn') as HTMLButtonElement;
  const resetBtn = el(document, '#resetBtn') as HTMLButtonElement;
  const timeSlider = el(document, '#timeSlider') as HTMLInputElement;
  const timeValue = el(document, '#timeValue') as HTMLSpanElement;
  const wallTimeDisplay = el(document, '#wallTime') as HTMLSpanElement;

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

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

  function computeFrameOnTheFly(t: number): ImageData {
    const startVariance = 1;
    const endVariance = 0.0001;

    const interpolatedMean: [number, number] = [
      t * dataPoint[0],
      t * dataPoint[1]
    ];
    const variance = startVariance + (endVariance - startVariance) * t;

    const gaussian: GaussianComponent = {
      mean: interpolatedMean,
      weight: 1,
      covariance: [[variance, 0], [0, variance]]
    };

    const { probabilityGrid, maxValue } = computeGaussianMixture(
      xScale,
      yScale,
      [gaussian],
      canvas.width,
      canvas.height
    );

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = getContext(tempCanvas);

    drawGaussianMixturePDF(tempCtx, probabilityGrid, maxValue, canvas.width, canvas.height);
    drawGaussianContours(tempCtx, probabilityGrid, maxValue, canvas.width, canvas.height);

    return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function clearPrecomputedFrames(): void {
    precomputedFrames = new Array(NUM_FRAMES + 1).fill(undefined) as (ImageData | undefined)[];
  }

  async function precomputeFrames(): Promise<void> {
    const currentComputationId = ++computationId;
    console.log(`[Precompute #${String(currentComputationId)}] Starting frame precomputation...`);
    const startTime = performance.now();

    for (let i = 0; i <= NUM_FRAMES; i++) {
      if (currentComputationId !== computationId) {
        const msg = `[Precompute #${String(currentComputationId)}] Aborted at frame ` +
                    `${String(i)}/${String(NUM_FRAMES)}`;
        console.log(msg);
        return;
      }

      const t = i / NUM_FRAMES;
      precomputedFrames[i] = computeFrameOnTheFly(t);

      if (i % 10 === 0) {
        await new Promise((resolve) => { setTimeout(resolve, 0); });
      }
    }

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    const finishMsg = `[Precompute #${String(currentComputationId)}] Finished ` +
                      `${String(NUM_FRAMES + 1)} frames in ${duration}ms`;
    console.log(finishMsg);
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frameIndex = Math.round(animationState.time * NUM_FRAMES);
    const frame = precomputedFrames[frameIndex];
    const imageData = frame ?? computeFrameOnTheFly(animationState.time);
    ctx.putImageData(imageData, 0, 0);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    const dataPointPixelX = xScale(dataPoint[0]);
    const dataPointPixelY = yScale(dataPoint[1]);
    addDot(ctx, dataPointPixelX, dataPointPixelY, 6, '#2196F3');
  }

  function animate(): void {
    if (animationState.isAnimating) {
      animationState.time += 1 / 60;

      // Update wall time display
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
    }
    render();
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
      void precomputeFrames();
    }
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
      void precomputeFrames();
    }
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  playBtn.addEventListener('click', () => {
    if (!animationState.isAnimating) {
      if (animationState.time >= 1) {
        animationState.time = 0;
      }
      animationStartTime = performance.now(); // Always start timer
      animationState.isAnimating = true;
      playBtn.textContent = 'Pause';
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
    wallTimeDisplay.textContent = ''; // Clear display
    void precomputeFrames();
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
    render();
  });

  void precomputeFrames();
  render();
  animate();
}

function setUpConditionalProbabilityPathTfjsImpl(
  canvasId: string,
  playBtnId: string,
  resetBtnId: string,
  timeSliderId: string,
  timeValueId: string,
  wallTimeDisplayId: string,
  usePrecomputation: boolean,
  withContours: boolean,
  logPrefix: string
): void {
  const canvas = el(document, canvasId) as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const playBtn = el(document, playBtnId) as HTMLButtonElement;
  const resetBtn = el(document, resetBtnId) as HTMLButtonElement;
  const timeSlider = el(document, timeSliderId) as HTMLInputElement;
  const timeValue = el(document, timeValueId) as HTMLSpanElement;
  const wallTimeDisplay = el(document, wallTimeDisplayId) as HTMLSpanElement;

  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

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

  function computeFrameOnTheFlyTfjs(t: number): ImageData {
    const startVariance = 1;
    const endVariance = 0.0001;

    const interpolatedMean: [number, number] = [
      t * dataPoint[0],
      t * dataPoint[1]
    ];
    const variance = startVariance + (endVariance - startVariance) * t;

    const result = computeGaussianPdfTfjs(
      canvas,
      ctx,
      xScale,
      yScale,
      interpolatedMean[0],
      interpolatedMean[1],
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
    const startVariance = 1;
    const endVariance = 0.0001;
    const frames: ImageData[] = [];

    // Create temp canvas once for contour rendering (reused across frames)
    let tempCanvas: HTMLCanvasElement | undefined;
    let tempCtx: CanvasRenderingContext2D | undefined;
    if (withContours) {
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCtx = getContext(tempCanvas);
    }

    // Create grid of pixel coordinates once for all frames
    const width = canvas.width;
    const height = canvas.height;

    const pixelXs = tf.range(0, width, 1);
    const pixelYs = tf.range(0, height, 1);

    const [meshY, meshX] = tf.meshgrid(pixelYs, pixelXs);

    // Convert to data coordinates using scale inverse
    const dataXs = meshX.dataSync().map((px: number) => xScale.inverse(px));
    const dataYs = meshY.dataSync().map((py: number) => yScale.inverse(py));
    const dataXTensor = tf.tensor2d(dataXs, [width, height]);
    const dataYTensor = tf.tensor2d(dataYs, [width, height]);

    for (let i = 0; i <= NUM_FRAMES; i++) {
      const t = i / NUM_FRAMES;
      const interpolatedMean: [number, number] = [
        t * dataPoint[0],
        t * dataPoint[1]
      ];
      const variance = startVariance + (endVariance - startVariance) * t;

      // Compute Gaussian PDF for all pixels at once
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

      const imageData = ctx.createImageData(width, height);
      const intensityData = intensity.dataSync();

      // Fill image data with color
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const idx = x * height + y;
          const pixelIdx = (y * width + x) * 4;
          const intensityVal = intensityData[idx];

          imageData.data[pixelIdx] = 30;
          imageData.data[pixelIdx + 1] = 150;
          imageData.data[pixelIdx + 2] = 255;
          imageData.data[pixelIdx + 3] = intensityVal;
        }
      }

      if (withContours && tempCtx) {
        // Build probability grid for contours (synchronous GPU->CPU transfer)
        const pdfData = pdf.dataSync();

        // Build probability grid
        const probabilityGrid: number[][] = new Array(width) as number[][];
        for (let x = 0; x < width; x++) {
          probabilityGrid[x] = new Array(height) as number[];
          for (let y = 0; y < height; y++) {
            probabilityGrid[x][y] = pdfData[x * height + y];
          }
        }

        // Draw base image to temp canvas
        tempCtx.putImageData(imageData, 0, 0);

        // Draw contours on top (vector graphics)
        drawGaussianContours(
          tempCtx, probabilityGrid, maxValue, canvas.width, canvas.height
        );

        // Capture final composite (expensive but necessary for rasterized output)
        frames.push(tempCtx.getImageData(0, 0, canvas.width, canvas.height));
      } else {
        // No contours - just use the raw ImageData directly
        frames.push(imageData);
      }

      // Clean up intermediate tensors
      dx.dispose();
      dy.dispose();
      dxSq.dispose();
      dySq.dispose();
      distSq.dispose();
      exponent.dispose();
      pdf.dispose();
      normalized.dispose();
      intensity.dispose();
    }

    // Clean up persistent tensors
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
    const msg = `[${logPrefix} #${String(currentComputationId)}] ` +
                'Starting frame precomputation...';
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
    addDot(ctx, dataPointPixelX, dataPointPixelY, 6, '#2196F3');
  }

  function animate(): void {
    if (animationState.isAnimating) {
      animationState.time += 1 / 60;

      // Update wall time display
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
    }
    render();
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
      precomputeFrames();
    }
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
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
      animationStartTime = performance.now(); // Always start timer
      animationState.isAnimating = true;
      playBtn.textContent = 'Pause';
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
    wallTimeDisplay.textContent = ''; // Clear display
    precomputeFrames();
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
    render();
  });

  precomputeFrames();
  render();
  animate();
}

function setUpConditionalProbabilityPathTfjs(): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs',
    '#playBtnTfjs',
    '#resetBtnTfjs',
    '#timeSliderTfjs',
    '#timeValueTfjs',
    '#wallTimeTfjs',
    false,
    true,
    'TF.js on-the-fly'
  );
}

function setUpConditionalProbabilityPathTfjsPrecompute(): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-precompute',
    '#playBtnTfjsPrecompute',
    '#resetBtnTfjsPrecompute',
    '#timeSliderTfjsPrecompute',
    '#timeValueTfjsPrecompute',
    '#wallTimeTfjsPrecompute',
    true,
    true,
    'TF.js with precomputation'
  );
}

function setUpConditionalProbabilityPathTfjsNoContours(): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-no-contours',
    '#playBtnTfjsNoContours',
    '#resetBtnTfjsNoContours',
    '#timeSliderTfjsNoContours',
    '#timeValueTfjsNoContours',
    '#wallTimeTfjsNoContours',
    false,
    false,
    'TF.js on-the-fly (no contours)'
  );
}

function setUpConditionalProbabilityPathTfjsPrecomputeNoContours(): void {
  setUpConditionalProbabilityPathTfjsImpl(
    '#conditional-probability-canvas-tfjs-precompute-no-contours',
    '#playBtnTfjsPrecomputeNoContours',
    '#resetBtnTfjsPrecomputeNoContours',
    '#timeSliderTfjsPrecomputeNoContours',
    '#timeValueTfjsPrecomputeNoContours',
    '#wallTimeTfjsPrecomputeNoContours',
    true,
    false,
    'TF.js with precomputation (no contours)'
  );
}


function run(): void {
  setUpFrameExample();
  setUpGaussianCpu();
  setUpGaussian();
  setUpConditionalProbabilityPathCpuOnTheFly();
  setUpConditionalProbabilityPath();
  setUpConditionalProbabilityPathTfjs();
  setUpConditionalProbabilityPathTfjsPrecompute();
  setUpConditionalProbabilityPathTfjsNoContours();
  setUpConditionalProbabilityPathTfjsPrecomputeNoContours();
}

run();

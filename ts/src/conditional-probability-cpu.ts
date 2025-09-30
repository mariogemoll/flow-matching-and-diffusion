import type { AnimationState } from './animation-state';
import { DATA_POINT_RADIUS } from './constants';
import {
  computeGaussianMixture,
  drawGaussianContours,
  drawGaussianMixturePDF,
  type GaussianComponent
} from './gaussian';
import type { NoiseScheduler } from './noise-schedulers';
import { addDot, addFrameUsingScales, getContext } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import { makeScale } from './web-ui-common/util';

const MIN_VARIANCE = 0.0001;

export function setUpConditionalProbabilityPathCpuOnTheFly(
  noiseScheduler: NoiseScheduler
): void {
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

  const computeGaussianParams = (t: number): { mean: [number, number]; variance: number } => {
    const { alpha, beta } = noiseScheduler(t);
    const mean: [number, number] = [
      alpha * dataPoint[0],
      alpha * dataPoint[1]
    ];
    const variance = Math.max(beta * beta, MIN_VARIANCE);
    return { mean, variance };
  };

  function computeFrameOnTheFly(t: number): ImageData {
    const { mean, variance } = computeGaussianParams(t);

    const gaussian: GaussianComponent = {
      mean,
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
    addDot(ctx, dataPointPixelX, dataPointPixelY, DATA_POINT_RADIUS, '#2196F3');
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

export function setUpConditionalProbabilityPath(
  noiseScheduler: NoiseScheduler
): void {
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

  const computeGaussianParams = (t: number): { mean: [number, number]; variance: number } => {
    const { alpha, beta } = noiseScheduler(t);
    const mean: [number, number] = [
      alpha * dataPoint[0],
      alpha * dataPoint[1]
    ];
    const variance = Math.max(beta * beta, MIN_VARIANCE);
    return { mean, variance };
  };

  function computeFrameOnTheFly(t: number): ImageData {
    const { mean, variance } = computeGaussianParams(t);

    const gaussian: GaussianComponent = {
      mean,
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
    addDot(ctx, dataPointPixelX, dataPointPixelY, DATA_POINT_RADIUS, '#2196F3');
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

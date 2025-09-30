import {
  computeGaussianMixture,
  drawGaussianContours,
  drawGaussianMixturePDF,
  type GaussianComponent
} from './gaussian';
import { addDot, addFrameUsingScales, getContext } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import { makeScale } from './web-ui-common/util';

interface AnimationState {
  isAnimating: boolean;
  time: number;
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

function setUpConditionalProbabilityPath(): void {
  const canvas = el(document, '#conditional-probability-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const playBtn = el(document, '#playBtn') as HTMLButtonElement;
  const resetBtn = el(document, '#resetBtn') as HTMLButtonElement;
  const timeSlider = el(document, '#timeSlider') as HTMLInputElement;
  const timeValue = el(document, '#timeValue') as HTMLSpanElement;

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
    render();
  });

  void precomputeFrames();
  render();
  animate();
}

function run(): void {
  setUpFrameExample();
  setUpGaussian();
  setUpConditionalProbabilityPath();
}

run();

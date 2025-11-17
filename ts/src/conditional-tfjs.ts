import { addDot, addFrameUsingScales, createMovableDot, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import type { AnimationState } from './animation-state';
import { viridis } from './color-maps';
import {
  computeGaussianParams,
  computeGlobalMaxVectorLength,
  computeVectorFieldArrows,
  propagateVectorFieldSamples,
  renderGaussianFrame,
  sampleGaussianPoints,
  sampleStandardNormalPoints
} from './conditional-tfjs-logic';
import {
  DATA_POINT_RADIUS,
  NUM_SAMPLES,
  SAMPLED_POINT_COLOR,
  SAMPLED_POINT_RADIUS
} from './constants';
import { computeGaussianPdfTfjs } from './gaussian-tf';
import type { NoiseScheduler, NoiseSchedulerDerivative } from './noise-schedulers';

export function setUpConditionalProbabilityPathTfjsImpl(
  canvasId: string,
  playBtnId: string,
  timeSliderId: string,
  timeValueId: string,
  wallTimeDisplayId: string,
  sampleBtnId: string | null,
  withContours: boolean,
  logPrefix: string,
  noiseScheduler: NoiseScheduler,
  noiseSchedulerDerivative: NoiseSchedulerDerivative | null = null,
  vectorFieldCanvasId: string | null = null,
  vectorFieldSampleBtnId: string | null = null,
  vectorFieldClearBtnId: string | null = null,
  sampleContinuouslyCheckboxId: string | null = null
): void {
  const canvas = el(document, canvasId) as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const playBtn = el(document, playBtnId) as HTMLButtonElement;
  const timeSlider = el(document, timeSliderId) as HTMLInputElement;
  const timeValue = el(document, timeValueId) as HTMLSpanElement;
  const wallTimeDisplay = el(document, wallTimeDisplayId) as HTMLSpanElement;
  const sampleBtn = sampleBtnId === null
    ? null
    : el(document, sampleBtnId) as HTMLButtonElement;
  const sampleContinuouslyCheckbox = sampleContinuouslyCheckboxId === null
    ? null
    : el(document, sampleContinuouslyCheckboxId) as HTMLInputElement;

  // Vector field canvas (optional)
  const vectorFieldCanvas = vectorFieldCanvasId === null
    ? null
    : el(document, vectorFieldCanvasId) as HTMLCanvasElement;
  const vectorFieldCtx = vectorFieldCanvas === null ? null : getContext(vectorFieldCanvas);
  const vectorFieldSampleBtn = vectorFieldSampleBtnId === null
    ? null
    : el(document, vectorFieldSampleBtnId) as HTMLButtonElement;
  const vectorFieldClearBtn = vectorFieldClearBtnId === null
    ? null
    : el(document, vectorFieldClearBtnId) as HTMLButtonElement;

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
  let isSliderDragging = false;
  const animationState: AnimationState = {
    isAnimating: false,
    time: 0
  };
  let animationStartTime: number | null = null;

  let sampledPoints: { x: number; y: number }[] = [];
  let vectorFieldSampledPoints: { x: number; y: number }[] = [];
  let vectorFieldInitialSamples: [number, number][] = []; // Store initial data coordinates
  let globalMaxVectorLength = 0; // Global max across all time points

  function recomputeGlobalMaxVectorLength(): void {
    if (vectorFieldXScale === null || vectorFieldYScale === null ||
        noiseSchedulerDerivative === null) {
      globalMaxVectorLength = 0;
      return;
    }

    globalMaxVectorLength = computeGlobalMaxVectorLength({
      xRange,
      yRange,
      dataPoint,
      noiseScheduler,
      noiseSchedulerDerivative,
      vectorFieldXScale,
      vectorFieldYScale
    });
  }


  function computeFrameImage(time: number): ImageData {
    const { mean, variance } = computeGaussianParams(noiseScheduler, dataPoint, time);
    return renderGaussianFrame({
      canvas,
      ctx,
      xScale,
      yScale,
      mean,
      variance,
      withContours
    });
  }


  function updateVectorFieldSampledPoints(): void {
    if (vectorFieldXScale === null || vectorFieldYScale === null) {
      return;
    }

    vectorFieldSampledPoints = propagateVectorFieldSamples({
      initialSamples: vectorFieldInitialSamples,
      time: animationState.time,
      dataPoint,
      noiseScheduler,
      vectorFieldXScale,
      vectorFieldYScale
    });
  }

  function renderVectorField(): void {
    if (vectorFieldCtx === null || vectorFieldCanvas === null ||
        vectorFieldXScale === null || vectorFieldYScale === null ||
        noiseSchedulerDerivative === null) {
      return;
    }

    vectorFieldCtx.clearRect(0, 0, vectorFieldCanvas.width, vectorFieldCanvas.height);

    if (animationState.time === 0) {
      const result = computeGaussianPdfTfjs(
        vectorFieldCanvas,
        vectorFieldCtx,
        vectorFieldXScale,
        vectorFieldYScale,
        0,
        0,
        1,
        false
      );
      vectorFieldCtx.putImageData(result.imageData, 0, 0);
    }

    updateVectorFieldSampledPoints();

    addFrameUsingScales(vectorFieldCtx, vectorFieldXScale, vectorFieldYScale, 11);

    const arrows = computeVectorFieldArrows({
      time: animationState.time,
      xRange,
      yRange,
      dataPoint,
      noiseScheduler,
      noiseSchedulerDerivative,
      vectorFieldXScale,
      vectorFieldYScale,
      globalMaxVectorLength
    });

    for (const { startX, startY, dx, dy, normalizedLength } of arrows) {
      const endX = startX + dx;
      const endY = startY + dy;
      const color = viridis(normalizedLength);

      vectorFieldCtx.strokeStyle = color;
      vectorFieldCtx.fillStyle = color;
      vectorFieldCtx.lineWidth = 1;
      vectorFieldCtx.beginPath();
      vectorFieldCtx.moveTo(startX, startY);
      vectorFieldCtx.lineTo(endX, endY);
      vectorFieldCtx.stroke();

      const angle = Math.atan2(dy, dx);
      const headLen = 5;
      vectorFieldCtx.beginPath();
      vectorFieldCtx.moveTo(endX, endY);
      vectorFieldCtx.lineTo(
        endX - headLen * Math.cos(angle - Math.PI / 6),
        endY - headLen * Math.sin(angle - Math.PI / 6)
      );
      vectorFieldCtx.lineTo(
        endX - headLen * Math.cos(angle + Math.PI / 6),
        endY - headLen * Math.sin(angle + Math.PI / 6)
      );
      vectorFieldCtx.closePath();
      vectorFieldCtx.fill();
    }

    const dataPointPixelX = vectorFieldXScale(dataPoint[0]);
    const dataPointPixelY = vectorFieldYScale(dataPoint[1]);
    addDot(vectorFieldCtx, dataPointPixelX, dataPointPixelY, DATA_POINT_RADIUS, '#2196F3');

    vectorFieldSampledPoints.forEach(({ x, y }) => {
      addDot(vectorFieldCtx, x, y, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    });
  }


  function updateSampleButtonState(): void {
    if (sampleBtn !== null) {
      sampleBtn.disabled = animationState.isAnimating || isSliderDragging;
    }
    if (vectorFieldSampleBtn !== null) {
      vectorFieldSampleBtn.disabled = animationState.time !== 0;
    }
    if (vectorFieldClearBtn !== null) {
      vectorFieldClearBtn.disabled = vectorFieldInitialSamples.length === 0;
    }
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update sample button state
    updateSampleButtonState();

    // Sample continuously if checkbox is checked
    if (sampleContinuouslyCheckbox?.checked === true) {
      const { mean, variance } = computeGaussianParams(
        noiseScheduler,
        dataPoint,
        animationState.time
      );
      const sd = Math.sqrt(variance);
      sampledPoints = sampleGaussianPoints({
        mean,
        standardDeviation: sd,
        count: NUM_SAMPLES,
        xScale,
        yScale
      });
    }

    const imageData = computeFrameImage(animationState.time);
    ctx.putImageData(imageData, 0, 0);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    // Render the movable dot at current position
    movableDotRenderer.render(dataPoint);

    sampledPoints.forEach(({ x, y }) => {
      addDot(ctx, x, y, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
    });

    // Render vector field if enabled
    renderVectorField();
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
      if (animationStartTime !== null) {
        const wallTime = performance.now() - animationStartTime;
        wallTimeDisplay.textContent = `${wallTime.toFixed(0)}ms`;
      }
      render();
    } else {
      // Still update button state even when not animating
      updateSampleButtonState();
    }
    requestAnimationFrame(animate);
  }

  // Create movable dot for the data point
  let isDragging = false;
  const movableDotRenderer = createMovableDot(canvas, ctx, xScale, yScale, dataPoint, {
    radius: DATA_POINT_RADIUS,
    fill: '#2196F3',
    onChange: (newPosition) => {
      isDragging = true;
      dataPoint = newPosition;
      sampledPoints = [];
      render();
    }
  });

  // Track when dragging ends to recompute
  canvas.addEventListener('mouseup', () => {
    if (isDragging) {
      recomputeGlobalMaxVectorLength();
      isDragging = false;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (isDragging) {
      recomputeGlobalMaxVectorLength();
      isDragging = false;
    }
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

  timeSlider.addEventListener('mousedown', () => {
    isSliderDragging = true;
    updateSampleButtonState();
  });

  timeSlider.addEventListener('mouseup', () => {
    isSliderDragging = false;
    updateSampleButtonState();
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

      const { mean, variance } = computeGaussianParams(
        noiseScheduler,
        dataPoint,
        animationState.time
      );
      const sd = Math.sqrt(variance);
      sampledPoints = sampleGaussianPoints({
        mean,
        standardDeviation: sd,
        count: NUM_SAMPLES,
        xScale,
        yScale
      });

      render();
    });
  }

  if (vectorFieldSampleBtn && vectorFieldXScale !== null && vectorFieldYScale !== null) {
    vectorFieldSampleBtn.addEventListener('click', () => {
      if (animationState.time !== 0) {
        return;
      }

      const { initialSamples, pixelSamples } = sampleStandardNormalPoints({
        count: NUM_SAMPLES,
        xScale: vectorFieldXScale,
        yScale: vectorFieldYScale
      });
      vectorFieldInitialSamples = initialSamples;
      vectorFieldSampledPoints = pixelSamples;

      renderVectorField();
    });
  }

  if (vectorFieldClearBtn) {
    vectorFieldClearBtn.addEventListener('click', () => {
      vectorFieldSampledPoints = [];
      vectorFieldInitialSamples = [];
      renderVectorField();
    });
  }

  recomputeGlobalMaxVectorLength();
  render();

  animate();
}

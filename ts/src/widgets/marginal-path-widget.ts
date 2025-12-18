import {
  addFrameUsingScales,
  defaultMargins,
  drawFunction1D,
  getContext
} from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import { gaussianPdf } from '../math/gaussian';
import {
  makeCircularCircularScheduler,
  makeConstantVarianceScheduler,
  makeInverseSqrtNoiseScheduler,
  makeLinearNoiseScheduler,
  makeSqrtNoiseScheduler,
  makeSqrtSqrtScheduler,
  type NoiseScheduler
} from '../math/noise-scheduler';
import { renderMeanPlot, renderSchedulerPlot, renderVariancePlot } from './plot-renderers';

export function setUpMarginalPathWidget(): void {
  const canvas = el(document, '#simple-frame-canvas') as HTMLCanvasElement;
  const slider = el(document, '#simple-slider') as HTMLInputElement;
  const playButton = el(document, '#simple-play') as HTMLButtonElement;
  const tValue = el(document, '#simple-t') as HTMLElement;
  const weightSummary = el(document, '#simple-weights') as HTMLElement;
  const schedulerRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="scheduler"]')
  );

  const ctx = getContext(canvas);
  const xRange = [-4, 4] as [number, number];
  const yRange = [0, 0.5] as [number, number];
  const margins = defaultMargins;
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let scheduler: NoiseScheduler = makeConstantVarianceScheduler();

  const readSliderValue = (): number => {
    const parsed = Number.parseFloat(slider.value);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed;
  };

  // Random initial Gaussian parameters
  let mean = (Math.random() - 0.5) * 4; // Random mean between -2 and 2
  let stdDev = 0.3 + Math.random() * 1.7; // Random stdDev between 0.3 and 2
  let t = readSliderValue();
  let isDraggingMean = false;
  let isDraggingStdDev = false;
  let isPlaying = false;
  let animationFrameId: number | null = null;
  let lastTimestamp: number | null = null;
  const handleRadius = 6;

  const clampMean = (value: number): number => {
    const [minX, maxX] = xRange;
    return Math.max(minX, Math.min(maxX, value));
  };

  const clampStdDev = (value: number): number => {
    return Math.max(0.1, Math.min(3, value));
  };

  const updateWeights = (alpha: number, beta: number): void => {
    const summaryParts = [`α_t = ${alpha.toFixed(2)}`, `β_t = ${beta.toFixed(2)}`];
    weightSummary.textContent = summaryParts.join(', ');
  };

  const updateTDisplay = (): void => {
    tValue.textContent = t.toFixed(2);
  };


  const updateSchedulerPlot = (): void => {
    const plotCanvas = el(document, '#scheduler-plot') as HTMLCanvasElement;
    renderSchedulerPlot(plotCanvas, scheduler, t);
  };

  const updateVariancePlot = (): void => {
    const plotCanvas = el(document, '#variance-plot') as HTMLCanvasElement;
    renderVariancePlot(plotCanvas, scheduler, t, stdDev, 'Variance');
  };

  const updateMeanPlot = (): void => {
    const plotCanvas = el(document, '#mean-plot') as HTMLCanvasElement;
    renderMeanPlot(plotCanvas, scheduler, t, mean, 'Mean');
  };

  const updateThumbnails = (): void => {
    updateSchedulerPlot();
    updateMeanPlot();
    updateVariancePlot();
  };

  const render = (): void => {
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);
    const marginalMean = alpha * mean;
    const marginalVariance = alpha * alpha * stdDev * stdDev + beta * beta;
    const marginalStdDev = Math.sqrt(marginalVariance);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    addFrameUsingScales(ctx, xScale, yScale, 10);

    // Draw marginal p_t(x)
    drawFunction1D(
      ctx,
      xScale,
      yScale,
      (x) => gaussianPdf(x, marginalMean, marginalStdDev),
      {
        stroke: 'midnightblue',
        lineWidth: 2,
        sampleCount: canvas.width
      }
    );

    // Only draw data controls when t = 1
    if (Math.abs(t - 1) < 0.01) {
      const axisY = yScale(0);
      const meanXPixel = xScale(mean);
      const leftHandleXPixel = xScale(mean - stdDev);
      const rightHandleXPixel = xScale(mean + stdDev);

      // Draw mean dot
      ctx.save();
      ctx.fillStyle = 'firebrick';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(meanXPixel, axisY, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Draw left handle
      ctx.save();
      ctx.fillStyle = 'steelblue';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(leftHandleXPixel, axisY, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Draw right handle
      ctx.save();
      ctx.fillStyle = 'steelblue';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rightHandleXPixel, axisY, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    updateTDisplay();
    updateWeights(alpha, beta);
    updateSchedulerPlot();
    updateMeanPlot();
    updateVariancePlot();
  };

  const getCanvasX = (event: MouseEvent | TouchEvent): number | undefined => {
    let clientX: number | undefined;
    if ('touches' in event) {
      const primaryTouch = event.touches.item(0);
      clientX = primaryTouch?.clientX;
    } else {
      clientX = event.clientX;
    }
    if (clientX === undefined) {
      return undefined;
    }
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left;
  };

  const isNearHandle = (canvasX: number, handleX: number): boolean => {
    return Math.abs(canvasX - handleX) <= handleRadius + 5;
  };

  canvas.addEventListener('mousedown', (event) => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }

    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const axisY = yScale(0);
    const rect = canvas.getBoundingClientRect();
    const canvasY = event.clientY - rect.top;

    if (Math.abs(canvasY - axisY) > handleRadius + 5) {
      return;
    }

    const meanXPixel = xScale(mean);
    const leftHandleXPixel = xScale(mean - stdDev);
    const rightHandleXPixel = xScale(mean + stdDev);

    if (isNearHandle(canvasX, meanXPixel)) {
      isDraggingMean = true;
    } else if (isNearHandle(canvasX, leftHandleXPixel)) {
      isDraggingStdDev = true;
    } else if (isNearHandle(canvasX, rightHandleXPixel)) {
      isDraggingStdDev = true;
    }
  });

  canvas.addEventListener('touchstart', (event) => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }

    event.preventDefault();
    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const primaryTouch = event.touches.item(0);
    if (!primaryTouch) {
      return;
    }

    const axisY = yScale(0);
    const rect = canvas.getBoundingClientRect();
    const canvasY = primaryTouch.clientY - rect.top;

    if (Math.abs(canvasY - axisY) > handleRadius + 5) {
      return;
    }

    const meanXPixel = xScale(mean);
    const leftHandleXPixel = xScale(mean - stdDev);
    const rightHandleXPixel = xScale(mean + stdDev);

    if (isNearHandle(canvasX, meanXPixel)) {
      isDraggingMean = true;
    } else if (isNearHandle(canvasX, leftHandleXPixel)) {
      isDraggingStdDev = true;
    } else if (isNearHandle(canvasX, rightHandleXPixel)) {
      isDraggingStdDev = true;
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDraggingMean && !isDraggingStdDev) {
      return;
    }

    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const xValue = xScale.inverse(canvasX);

    if (isDraggingMean) {
      mean = clampMean(xValue);
    } else if (isDraggingStdDev) {
      const newStdDev = Math.abs(xValue - mean);
      stdDev = clampStdDev(newStdDev);
    }

    updateThumbnails();
    render();
  });

  window.addEventListener('touchmove', (event) => {
    if (!isDraggingMean && !isDraggingStdDev) {
      return;
    }

    event.preventDefault();
    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const xValue = xScale.inverse(canvasX);

    if (isDraggingMean) {
      mean = clampMean(xValue);
    } else if (isDraggingStdDev) {
      const newStdDev = Math.abs(xValue - mean);
      stdDev = clampStdDev(newStdDev);
    }

    updateThumbnails();
    render();
  });

  const stopDragging = (): void => {
    isDraggingMean = false;
    isDraggingStdDev = false;
  };

  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('touchend', stopDragging);
  window.addEventListener('touchcancel', stopDragging);

  const stopAnimation = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isPlaying = false;
    lastTimestamp = null;
    playButton.textContent = 'Play';
  };

  const stepAnimation = (timestamp: number): void => {
    if (!isPlaying) {
      return;
    }

    const previousTimestamp = lastTimestamp ?? timestamp;
    lastTimestamp = timestamp;
    const delta = timestamp - previousTimestamp;
    const durationMs = 4000;
    t += delta / durationMs;

    if (t >= 1) {
      t = 1;
      slider.value = t.toFixed(3);
      render();
      stopAnimation();
      return;
    }

    slider.value = t.toFixed(3);
    render();
    animationFrameId = requestAnimationFrame(stepAnimation);
  };

  const startAnimation = (): void => {
    if (isPlaying) {
      return;
    }
    isPlaying = true;
    playButton.textContent = 'Pause';
    animationFrameId = requestAnimationFrame(stepAnimation);
  };

  const setTFromSlider = (): void => {
    t = Math.max(0, Math.min(1, readSliderValue()));
    render();
  };

  slider.addEventListener('input', () => {
    if (isPlaying) {
      stopAnimation();
    }
    setTFromSlider();
  });

  playButton.addEventListener('click', () => {
    if (isPlaying) {
      stopAnimation();
      return;
    }
    if (t >= 1) {
      t = 0;
      slider.value = t.toFixed(3);
      render();
    }
    startAnimation();
  });

  schedulerRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        if (radio.value === 'linear') {
          scheduler = makeLinearNoiseScheduler();
        } else if (radio.value === 'sqrt') {
          scheduler = makeSqrtNoiseScheduler();
        } else if (radio.value === 'inverse-sqrt') {
          scheduler = makeInverseSqrtNoiseScheduler();
        } else if (radio.value === 'constant') {
          scheduler = makeConstantVarianceScheduler();
        } else if (radio.value === 'sqrt-sqrt') {
          scheduler = makeSqrtSqrtScheduler();
        } else if (radio.value === 'circular-circular') {
          scheduler = makeCircularCircularScheduler();
        }
        updateThumbnails();
        render();
      }
    });
  });

  updateThumbnails();
  render();
}

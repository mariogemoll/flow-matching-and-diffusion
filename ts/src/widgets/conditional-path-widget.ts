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

export function setUpConditionalPathWidget(): void {
  const canvas = el(document, '#frame-canvas') as HTMLCanvasElement;
  const slider = el(document, '#conditional-slider') as HTMLInputElement;
  const playButton = el(document, '#conditional-play') as HTMLButtonElement;
  const tValue = el(document, '#conditional-t') as HTMLElement;
  const weightSummary = el(document, '#conditional-weights') as HTMLElement;
  const schedulerRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="conditional-scheduler"]')
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

  let targetX = (Math.random() - 0.5) * 6; // Random target between -3 and 3
  let t = readSliderValue();
  let isDragging = false;
  let isPlaying = false;
  let animationFrameId: number | null = null;
  let lastTimestamp: number | null = null;

  const clampTarget = (value: number): number => {
    const [minX, maxX] = xRange;
    return Math.max(minX, Math.min(maxX, value));
  };

  const updateWeights = (
    alpha: number,
    beta: number,
    mean: number,
    stdDev: number
  ): void => {
    const summaryParts = [
      `α_t = ${alpha.toFixed(2)}`,
      `β_t = ${beta.toFixed(2)}`,
      `μ_t = ${mean.toFixed(2)}`,
      `σ_t = ${stdDev.toFixed(2)}`
    ];
    weightSummary.textContent = summaryParts.join(', ');
  };

  const updateTDisplay = (): void => {
    tValue.textContent = t.toFixed(2);
  };

  const updateInfoCharts = (): void => {
    const schedulerPlot = el(
      document,
      '#conditional-scheduler-plot'
    ) as HTMLCanvasElement;
    const meanPlot = el(document, '#conditional-mean-plot') as HTMLCanvasElement;
    const variancePlot = el(
      document,
      '#conditional-variance-plot'
    ) as HTMLCanvasElement;

    renderSchedulerPlot(schedulerPlot, scheduler, t, 'Scheduler');
    renderMeanPlot(meanPlot, scheduler, t, targetX, 'Mean');
    renderVariancePlot(variancePlot, scheduler, t, 0, 'Variance'); // stdDev = 0 for Dirac delta
  };

  const render = (): void => {
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);
    const conditionalMean = alpha * targetX;
    const conditionalStdDev = beta;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    addFrameUsingScales(ctx, xScale, yScale, 10);

    const targetXPixel = xScale(targetX);

    if (conditionalStdDev > 0) {
      drawFunction1D(
        ctx,
        xScale,
        yScale,
        (x) => gaussianPdf(x, conditionalMean, conditionalStdDev),
        {
          stroke: 'midnightblue',
          lineWidth: 2,
          sampleCount: canvas.width
        }
      );
    } else {
      const [yMin, yMax] = yRange;
      ctx.save();
      ctx.strokeStyle = 'midnightblue';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(targetXPixel, yScale(yMax));
      ctx.lineTo(targetXPixel, yScale(yMin));
      ctx.stroke();
      ctx.restore();
    }

    // Only draw data control when t = 1
    if (Math.abs(t - 1) < 0.01) {
      const axisY = yScale(0);

      ctx.save();
      ctx.fillStyle = 'firebrick';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(targetXPixel, axisY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    updateTDisplay();
    updateWeights(alpha, beta, conditionalMean, conditionalStdDev);
    updateInfoCharts();
  };

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

  const updateTargetFromEvent = (event: MouseEvent | TouchEvent): void => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }

    let clientX: number | undefined;
    if ('touches' in event) {
      const primaryTouch = event.touches.item(0);
      clientX = primaryTouch?.clientX;
    } else {
      clientX = event.clientX;
    }
    if (clientX === undefined) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    targetX = clampTarget(xScale.inverse(canvasX));
    render();
  };

  canvas.addEventListener('mousedown', (event) => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }
    isDragging = true;
    updateTargetFromEvent(event);
  });

  canvas.addEventListener('touchstart', (event) => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }
    event.preventDefault();
    isDragging = true;
    updateTargetFromEvent(event);
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) {
      return;
    }
    updateTargetFromEvent(event);
  });

  window.addEventListener('touchmove', (event) => {
    if (!isDragging) {
      return;
    }
    event.preventDefault();
    updateTargetFromEvent(event);
  });

  const stopDragging = (): void => {
    isDragging = false;
  };

  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('touchend', stopDragging);
  window.addEventListener('touchcancel', stopDragging);

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
        render();
      }
    });
  });

  render();
}

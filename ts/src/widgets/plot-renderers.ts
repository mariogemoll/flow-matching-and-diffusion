import { type NoiseScheduler } from '../math/noise-scheduler';
import { addFrameUsingScales, drawFunction1D, getContext } from '../web-ui-common/canvas';
import { makeScale } from '../web-ui-common/util';

export function renderSchedulerPlot(
  canvas: HTMLCanvasElement,
  scheduler: NoiseScheduler,
  t: number,
  title?: string
): void {
  const ctx = getContext(canvas);
  const margins = { top: 15, right: 10, bottom: 20, left: 25 };
  const tScaleRange: [number, number] = [0, 1];
  const valueScaleRange: [number, number] = [0, 1];
  const tScale = makeScale(
    tScaleRange,
    [margins.left, canvas.width - margins.right]
  );
  const valueScale = makeScale(
    valueScaleRange,
    [canvas.height - margins.bottom, margins.top]
  );

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  addFrameUsingScales(ctx, tScale, valueScale, 5);

  // Draw alpha curve
  drawFunction1D(ctx, tScale, valueScale, (tVal) => scheduler.getAlpha(tVal), {
    stroke: 'firebrick',
    lineWidth: 2,
    sampleCount: 100
  });

  // Draw beta curve
  drawFunction1D(ctx, tScale, valueScale, (tVal) => scheduler.getBeta(tVal), {
    stroke: 'steelblue',
    lineWidth: 2,
    sampleCount: 100
  });

  // Draw current position dots
  const currentAlpha = scheduler.getAlpha(t);
  const currentBeta = scheduler.getBeta(t);
  const currentX = tScale(t);

  ctx.save();
  ctx.fillStyle = 'firebrick';
  ctx.beginPath();
  ctx.arc(currentX, valueScale(currentAlpha), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'steelblue';
  ctx.beginPath();
  ctx.arc(currentX, valueScale(currentBeta), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Labels with colored legend
  ctx.save();
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'firebrick';
  ctx.fillText('α', margins.left + 5, margins.top + 10);
  ctx.fillStyle = 'steelblue';
  ctx.fillText('β', margins.left + 5, margins.top + 20);
  ctx.restore();

  // Title
  if (title !== undefined && title !== '') {
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, 10);
    ctx.restore();
  }
}

export function renderMeanPlot(
  canvas: HTMLCanvasElement,
  scheduler: NoiseScheduler,
  t: number,
  dataMean: number,
  title?: string
): void {
  const ctx = getContext(canvas);
  const margins = { top: 15, right: 10, bottom: 20, left: 25 };

  // Calculate max/min mean to set scale
  let minMean = 0;
  let maxMean = 0;
  for (let i = 0; i <= 100; i++) {
    const tVal = i / 100;
    const alpha = scheduler.getAlpha(tVal);
    const marginalMean = alpha * dataMean;
    minMean = Math.min(minMean, marginalMean);
    maxMean = Math.max(maxMean, marginalMean);
  }

  // Add some padding to the scale
  const padding = Math.max(0.1, (maxMean - minMean) * 0.1);
  const tScaleRange: [number, number] = [0, 1];
  const meanScaleRange: [number, number] = [minMean - padding, maxMean + padding];
  const tScale = makeScale(
    tScaleRange,
    [margins.left, canvas.width - margins.right]
  );
  const meanScale = makeScale(
    meanScaleRange,
    [canvas.height - margins.bottom, margins.top]
  );

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  addFrameUsingScales(ctx, tScale, meanScale, 5);

  // Draw mean curve
  drawFunction1D(
    ctx,
    tScale,
    meanScale,
    (tVal) => {
      const alpha = scheduler.getAlpha(tVal);
      return alpha * dataMean;
    },
    {
      stroke: 'purple',
      lineWidth: 2,
      sampleCount: 100
    }
  );

  // Draw current position dot
  const currentAlpha = scheduler.getAlpha(t);
  const currentMean = currentAlpha * dataMean;

  ctx.save();
  ctx.fillStyle = 'purple';
  ctx.beginPath();
  ctx.arc(tScale(t), meanScale(currentMean), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Labels
  ctx.save();
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'purple';
  ctx.fillText('μ', margins.left + 5, margins.top + 10);
  ctx.restore();

  // Title
  if (title !== undefined && title !== '') {
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, 10);
    ctx.restore();
  }
}

export function renderVariancePlot(
  canvas: HTMLCanvasElement,
  scheduler: NoiseScheduler,
  t: number,
  dataStdDev: number,
  title?: string
): void {
  const ctx = getContext(canvas);
  const margins = { top: 15, right: 10, bottom: 20, left: 25 };

  // Calculate max variance and stdDev to set scale
  let maxVariance = 0;
  let maxStdDev = 0;
  for (let i = 0; i <= 100; i++) {
    const tVal = i / 100;
    const alpha = scheduler.getAlpha(tVal);
    const beta = scheduler.getBeta(tVal);
    const variance = alpha * alpha * dataStdDev * dataStdDev + beta * beta;
    const stdDevValue = Math.sqrt(variance);
    maxVariance = Math.max(maxVariance, variance);
    maxStdDev = Math.max(maxStdDev, stdDevValue);
  }

  const tScaleRange: [number, number] = [0, 1];
  const valueScaleRange: [number, number] = [
    0,
    Math.max(maxVariance, maxStdDev) * 1.1
  ];
  const tScale = makeScale(
    tScaleRange,
    [margins.left, canvas.width - margins.right]
  );
  const valueScale = makeScale(
    valueScaleRange,
    [canvas.height - margins.bottom, margins.top]
  );

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  addFrameUsingScales(ctx, tScale, valueScale, 5);

  // Draw stdDev curve (orange)
  drawFunction1D(
    ctx,
    tScale,
    valueScale,
    (tVal) => {
      const alpha = scheduler.getAlpha(tVal);
      const beta = scheduler.getBeta(tVal);
      const variance = alpha * alpha * dataStdDev * dataStdDev + beta * beta;
      return Math.sqrt(variance);
    },
    {
      stroke: 'darkorange',
      lineWidth: 2,
      sampleCount: 100
    }
  );

  // Draw variance curve (green)
  drawFunction1D(
    ctx,
    tScale,
    valueScale,
    (tVal) => {
      const alpha = scheduler.getAlpha(tVal);
      const beta = scheduler.getBeta(tVal);
      return alpha * alpha * dataStdDev * dataStdDev + beta * beta;
    },
    {
      stroke: 'darkgreen',
      lineWidth: 2,
      sampleCount: 100
    }
  );

  // Draw current position dots
  const currentAlpha = scheduler.getAlpha(t);
  const currentBeta = scheduler.getBeta(t);
  const currentVariance =
    currentAlpha * currentAlpha * dataStdDev * dataStdDev +
    currentBeta * currentBeta;
  const currentStdDev = Math.sqrt(currentVariance);

  ctx.save();
  ctx.fillStyle = 'darkorange';
  ctx.beginPath();
  ctx.arc(tScale(t), valueScale(currentStdDev), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'darkgreen';
  ctx.beginPath();
  ctx.arc(tScale(t), valueScale(currentVariance), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Labels
  ctx.save();
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'darkorange';
  ctx.fillText('σ', margins.left + 5, margins.top + 10);
  ctx.fillStyle = 'darkgreen';
  ctx.fillText('σ²', margins.left + 5, margins.top + 20);
  ctx.restore();

  // Title
  if (title !== undefined && title !== '') {
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, 10);
    ctx.restore();
  }
}

import { addDot, drawFunction1D, getContext } from 'web-ui-common/canvas';
import { makeScale } from 'web-ui-common/util';

import type { DiffusionCoefficientScheduler } from './math/diffusion-coefficient-scheduler';

export function renderDiffusionCoefficientPlot(
  canvas: HTMLCanvasElement,
  scheduler: DiffusionCoefficientScheduler,
  t: number
): void {
  const ctx = getContext(canvas);
  const margins = { top: 4, right: 4, bottom: 4, left: 4 };
  const tScaleRange: [number, number] = [0, 1];

  // Calculate max diffusion for the scale
  const maxVal = scheduler.getMaxDiffusion();
  const valueScaleRange: [number, number] = [0, Math.max(maxVal * 1.1, 0.1)];

  const tScale = makeScale(
    tScaleRange,
    [margins.left, canvas.width - margins.right]
  );
  const valueScale = makeScale(
    valueScaleRange,
    [canvas.height - margins.bottom, margins.top]
  );

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw just the rectangle frame without ticks or labels
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    margins.left,
    margins.top,
    canvas.width - margins.left - margins.right,
    canvas.height - margins.top - margins.bottom
  );

  // Draw diffusion curve
  drawFunction1D(ctx, tScale, valueScale, (tVal) => scheduler.getDiffusion(tVal), {
    stroke: '#000',
    lineWidth: 1,
    sampleCount: 100
  });

  // Draw current position dot
  const currentDiffusion = scheduler.getDiffusion(t);
  const currentX = tScale(t);
  const currentY = valueScale(currentDiffusion);

  addDot(ctx, currentX, currentY, 2, '#000');
}

export function initDiffusionCoefficientVisualizationWidget(
  container: HTMLElement
): (diffusionScheduler: DiffusionCoefficientScheduler, time: number) => void {
  // Create canvas for diffusion plot
  const diffusionPlotCanvas = document.createElement('canvas');
  diffusionPlotCanvas.width = 64;
  diffusionPlotCanvas.height = 64;
  container.appendChild(diffusionPlotCanvas);

  // Create value display
  const valueSummary = document.createElement('span');
  valueSummary.textContent = 'σ(t) = 0.00';
  container.appendChild(valueSummary);

  function update(diffusionScheduler: DiffusionCoefficientScheduler, time: number): void {
    const diffusion = diffusionScheduler.getDiffusion(time);

    // Update value summary
    valueSummary.textContent = `σ(t) = ${diffusion.toFixed(2)}`;

    // Update diffusion plot
    renderDiffusionCoefficientPlot(
      diffusionPlotCanvas, diffusionScheduler, time
    );
  }

  return update;
}

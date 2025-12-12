import { addFrameUsingScales, drawFunction1D, getContext } from 'web-ui-common/canvas';
import { makeScale } from 'web-ui-common/util';

import type { DiffusionCoefficientScheduler } from './math/diffusion-coefficient-scheduler';

export function renderDiffusionCoefficientPlot(
  canvas: HTMLCanvasElement,
  diffusionScheduler: DiffusionCoefficientScheduler,
  t: number,
  title?: string
): void {
  const ctx = getContext(canvas);
  const margins = { top: 15, right: 10, bottom: 20, left: 25 };
  const tScaleRange: [number, number] = [0, 1];

  // Calculate max diffusion for the scale
  const maxDiffusion = diffusionScheduler.getMaxDiffusion();
  const valueScaleRange: [number, number] = [0, Math.max(maxDiffusion * 1.1, 0.1)];

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

  // Draw diffusion curve
  drawFunction1D(ctx, tScale, valueScale, (tVal) => diffusionScheduler.getDiffusion(tVal), {
    stroke: 'darkorchid',
    lineWidth: 2,
    sampleCount: 100
  });

  // Draw current position dot
  const currentDiffusion = diffusionScheduler.getDiffusion(t);
  const currentX = tScale(t);

  ctx.save();
  ctx.fillStyle = 'darkorchid';
  ctx.beginPath();
  ctx.arc(currentX, valueScale(currentDiffusion), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Label
  ctx.save();
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'darkorchid';
  ctx.fillText('g', margins.left + 5, margins.top + 10);
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

export function initDiffusionCoefficientVisualizationWidget(
  container: HTMLElement
): (diffusionScheduler: DiffusionCoefficientScheduler, time: number) => void {
  // Create canvas for diffusion plot
  const diffusionPlotCanvas = document.createElement('canvas');
  diffusionPlotCanvas.width = 160;
  diffusionPlotCanvas.height = 160;
  container.appendChild(diffusionPlotCanvas);

  // Create value display
  const valueSummary = document.createElement('span');
  valueSummary.textContent = 'g_t = 0.00';
  container.appendChild(valueSummary);

  function update(diffusionScheduler: DiffusionCoefficientScheduler, time: number): void {
    const diffusion = diffusionScheduler.getDiffusion(time);

    // Update value summary
    valueSummary.textContent = `g_t = ${diffusion.toFixed(2)}`;

    // Update diffusion plot
    renderDiffusionCoefficientPlot(
      diffusionPlotCanvas, diffusionScheduler, time, 'Diffusion coefficient'
    );
  }

  return update;
}

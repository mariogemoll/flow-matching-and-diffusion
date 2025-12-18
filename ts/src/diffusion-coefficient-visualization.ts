import type { DiffusionCoefficientScheduler } from './math/diffusion-coefficient-scheduler';
import { renderMinimalPlot } from './widgets/plot-renderers';

export function renderDiffusionCoefficientPlot(
  canvas: HTMLCanvasElement,
  scheduler: DiffusionCoefficientScheduler,
  t: number
): void {
  // Calculate max diffusion for the scale
  const maxVal = scheduler.getMaxDiffusion();
  const valueScaleRange: [number, number] = [0, Math.max(maxVal * 1.1, 0.1)];

  const valueFunctions = [(tVal: number): number => scheduler.getDiffusion(tVal)];
  renderMinimalPlot(canvas, valueFunctions, t, valueScaleRange);
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

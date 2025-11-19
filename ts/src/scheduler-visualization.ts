import type { NoiseScheduler } from './math/noise-scheduler';
import { renderSchedulerPlot } from './widgets/plot-renderers';

export function initSchedulerVisualizationWidget(
  container: HTMLElement
): (scheduler: NoiseScheduler, time: number) => void {
  // Create canvas for scheduler plot
  const schedulerPlotCanvas = document.createElement('canvas');
  schedulerPlotCanvas.width = 160;
  schedulerPlotCanvas.height = 160;
  schedulerPlotCanvas.style.width = '160px';
  schedulerPlotCanvas.style.height = '160px';
  schedulerPlotCanvas.style.border = '1px solid #ccc';
  container.appendChild(schedulerPlotCanvas);

  // Create weight summary display
  const weightSummary = document.createElement('span');
  weightSummary.textContent = 'α_t = 0.00, β_t = 1.00';
  weightSummary.style.fontSize = '12px';
  weightSummary.style.textAlign = 'center';
  container.appendChild(weightSummary);

  function update(scheduler: NoiseScheduler, time: number): void {
    const alpha = scheduler.getAlpha(time);
    const beta = scheduler.getBeta(time);

    // Update weight summary
    const summaryParts = [`α_t = ${alpha.toFixed(2)}`, `β_t = ${beta.toFixed(2)}`];
    weightSummary.textContent = summaryParts.join(', ');

    // Update scheduler plot
    renderSchedulerPlot(schedulerPlotCanvas, scheduler, time, 'Scheduler');
  }

  return update;
}

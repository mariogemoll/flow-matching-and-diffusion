import { makeEl } from 'web-ui-common/dom';

import type { NoiseScheduler } from './math/noise-scheduler';
import { renderSchedulerPlot } from './widgets/plot-renderers';

export function initNoiseSchedulerWidget(
  container: HTMLElement,
  onChange: (schedulerType: string) => void
): (scheduler: NoiseScheduler, time: number) => void {
  // Add headline
  const headline = makeEl('h3', {});
  headline.textContent = 'Noise';
  container.appendChild(headline);

  // Create alpha and beta displays
  const alphaDisplay = makeEl('div', {}) as HTMLSpanElement;
  alphaDisplay.className = 'alpha';
  alphaDisplay.textContent = 'α(t) = 0.00';
  const betaDisplay = makeEl('div', {}) as HTMLSpanElement;
  betaDisplay.className = 'beta';
  betaDisplay.textContent = 'β(t) = 1.00';
  const valuesDiv = makeEl('div', {}) as HTMLDivElement;
  valuesDiv.className = 'values';
  valuesDiv.appendChild(alphaDisplay);
  valuesDiv.appendChild(betaDisplay);
  container.appendChild(valuesDiv);

  // Create scheduler selection
  const schedulers = [
    { value: 'linear', label: 'α=t, β=1-t' },
    { value: 'sqrt', label: 'α=t, β=√(1-t)' },
    { value: 'inverse-sqrt', label: 'α=t, β=1-t²' },
    { value: 'constant', label: 'α=t, β=√(1-t²)', checked: true },
    { value: 'sqrt-sqrt', label: 'α=√t, β=√(1-t)' },
    { value: 'circular-circular', label: 'α=sin(πt/2), β=cos(πt/2)' }
  ];

  const selectLabel = makeEl('label', {}) as HTMLLabelElement;
  selectLabel.textContent = 'Schedule: ';
  const select = makeEl('select', {}) as HTMLSelectElement;

  schedulers.forEach(({ value, label, checked }) => {
    const option = makeEl('option', { value }) as HTMLOptionElement;
    option.textContent = label;
    if (checked === true) { option.selected = true; }
    select.appendChild(option);
  });

  selectLabel.appendChild(select);
  container.appendChild(selectLabel);

  // Create canvas for scheduler plot (positioned absolutely in CSS)
  const schedulerPlotCanvas = makeEl('canvas', {
    width: '64',
    height: '64'
  }) as HTMLCanvasElement;
  schedulerPlotCanvas.className = 'noise-scheduler-canvas';
  container.appendChild(schedulerPlotCanvas);

  select.addEventListener('change', () => {
    onChange(select.value);
  });

  function update(scheduler: NoiseScheduler, time: number): void {
    const alpha = scheduler.getAlpha(time);
    const beta = scheduler.getBeta(time);

    // Update displays
    alphaDisplay.textContent = `α(t) = ${alpha.toFixed(2)}`;
    betaDisplay.textContent = `β(t) = ${beta.toFixed(2)}`;

    // Update scheduler plot
    renderSchedulerPlot(schedulerPlotCanvas, scheduler, time);
  }

  return update;
}

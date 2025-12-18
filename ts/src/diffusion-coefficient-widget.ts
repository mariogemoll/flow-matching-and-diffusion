import { makeEl } from 'web-ui-common/dom';

import type { DiffusionCoefficientScheduler } from './math/diffusion-coefficient-scheduler';
import { addSlider } from './slider';
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

export function initDiffusionCoefficientWidget(
  container: HTMLElement,
  onChange: (diffusionType: string, maxDiffusion: number) => void
): (scheduler: DiffusionCoefficientScheduler, time: number) => void {
  // Add headline
  const headline = makeEl('h3', {});
  headline.textContent = 'Diffusion coefficient';
  container.appendChild(headline);

  // Create diffusion value display
  const diffusionDisplay = makeEl('div', {}) as HTMLSpanElement;
  diffusionDisplay.className = 'diffusion';
  diffusionDisplay.textContent = 'σ(t) = 0.80';
  const valuesDiv = makeEl('div', {}) as HTMLDivElement;
  valuesDiv.className = 'values';
  valuesDiv.appendChild(diffusionDisplay);
  container.appendChild(valuesDiv);

  // Create diffusion type selection
  const diffusionTypes = [
    { value: 'constant', label: 'σ(t) = c', checked: true },
    { value: 'linear', label: 'σ(t) = c·t' },
    { value: 'linear-reverse', label: 'σ(t) = c·(1-t)' },
    { value: 'sine-bump', label: 'σ(t) = c·sin(πt)' }
  ];

  const selectLabel = makeEl('label', {}) as HTMLLabelElement;
  selectLabel.textContent = 'Schedule: ';
  const select = makeEl('select', {}) as HTMLSelectElement;

  diffusionTypes.forEach(({ value, label, checked }) => {
    const option = makeEl('option', { value }) as HTMLOptionElement;
    option.textContent = label;
    if (checked === true) { option.selected = true; }
    select.appendChild(option);
  });

  selectLabel.appendChild(select);
  container.appendChild(selectLabel);

  // Add max diffusion slider
  let currentMaxDiffusion = 0.8;

  function getSelectedDiffusionType(): string {
    return select.value;
  }

  addSlider(container, {
    label: 'Max: ',
    min: 0,
    max: 3,
    step: 0.05,
    initialValue: 0.8,
    className: 'slider max-diffusion-coefficient-slider',
    valueFormat: (v: number) => v.toFixed(2),
    onChange: (value: number) => {
      currentMaxDiffusion = value;
      onChange(getSelectedDiffusionType(), value);
    }
  });

  // Create canvas for diffusion plot (positioned absolutely in CSS)
  const diffusionPlotCanvas = makeEl('canvas', {
    width: '64',
    height: '64'
  }) as HTMLCanvasElement;
  diffusionPlotCanvas.className = 'diffusion-coefficient-canvas';
  container.appendChild(diffusionPlotCanvas);

  select.addEventListener('change', () => {
    onChange(select.value, currentMaxDiffusion);
  });

  function update(scheduler: DiffusionCoefficientScheduler, time: number): void {
    const diffusion = scheduler.getDiffusion(time);

    // Update display
    diffusionDisplay.textContent = `σ(t) = ${diffusion.toFixed(2)}`;

    // Update diffusion plot
    renderDiffusionCoefficientPlot(diffusionPlotCanvas, scheduler, time);
  }

  return update;
}

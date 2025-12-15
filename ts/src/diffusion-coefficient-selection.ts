import { addSlider } from './slider';

export function initDiffusionCoefficientSelectionWidget(
  container: HTMLElement,
  onChange: (diffusionType: string, maxDiffusion: number) => void,
  options?: {
    maxValue?: number;
    defaultValue?: number;
    step?: number;
  }
): { updateMaxDiffusion: (maxDiffusion: number) => void } {
  const maxValue = options?.maxValue ?? 3;
  const defaultValue = options?.defaultValue ?? 0.8;
  const step = options?.step ?? 0.05;

  const diffusionTypes = [
    { value: 'constant', label: 'σ(t) = c', checked: true },
    { value: 'linear', label: 'σ(t) = c·t' },
    { value: 'linear-reverse', label: 'σ(t) = c·(1-t)' },
    { value: 'sine-bump', label: 'σ(t) = c·sin(πt)' }
  ];

  const selectLabel = document.createElement('label');
  selectLabel.textContent = 'Schedule: ';
  const select = document.createElement('select');

  diffusionTypes.forEach(({ value, label, checked }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (checked === true) { option.selected = true; }
    select.appendChild(option);
  });

  selectLabel.appendChild(select);
  container.appendChild(selectLabel);

  // Add max diffusion slider
  let currentMaxDiffusion = defaultValue;

  function getSelectedDiffusionType(): string {
    return select.value;
  }

  const sliderWidget = addSlider(container, {
    label: 'Max diffusion coefficient: ',
    min: 0,
    max: maxValue,
    step,
    initialValue: defaultValue,
    className: 'max-diffusion-coefficient-slider',
    valueFormat: (v: number) => v.toFixed(2),
    onChange: (value: number) => {
      currentMaxDiffusion = value;
      onChange(getSelectedDiffusionType(), value);
    }
  });

  select.addEventListener('change', () => {
    onChange(select.value, currentMaxDiffusion);
  });

  return {
    updateMaxDiffusion: (maxDiffusion: number): void => {
      currentMaxDiffusion = maxDiffusion;
      sliderWidget.setValue(maxDiffusion);
    }
  };
}

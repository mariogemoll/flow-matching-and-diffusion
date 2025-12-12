import { addSlider } from './slider';

export function initDiffusionCoefficientSelectionWidget(
  container: HTMLElement,
  onChange: (diffusionType: string, maxDiffusion: number) => void,
  radioGroupName = 'diffusion-coefficient',
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

  const diffusionRadios: HTMLInputElement[] = [];
  diffusionTypes.forEach(({ value, label, checked }) => {
    const radioLabel = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioGroupName;
    radio.value = value;
    if (checked === true) { radio.checked = true; }
    diffusionRadios.push(radio);
    radioLabel.appendChild(radio);
    radioLabel.appendChild(document.createTextNode(` ${label}`));
    container.appendChild(radioLabel);
  });

  // Add max diffusion slider
  let currentMaxDiffusion = defaultValue;

  function getSelectedDiffusionType(): string {
    const selected = diffusionRadios.find(r => r.checked);
    return selected?.value ?? 'constant';
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

  diffusionRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        onChange(radio.value, currentMaxDiffusion);
      }
    });
  });

  return {
    updateMaxDiffusion: (maxDiffusion: number): void => {
      currentMaxDiffusion = maxDiffusion;
      sliderWidget.setValue(maxDiffusion);
    }
  };
}

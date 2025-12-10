export function initDiffusionCoefficientSelectionWidget(
  container: HTMLElement,
  onChange: (diffusionType: string, maxDiffusion: number) => void,
  radioGroupName = 'diffusion-coefficient'
): { updateMaxDiffusion: (maxDiffusion: number) => void } {
  const diffusionRadiosContainer = document.createElement('div');
  diffusionRadiosContainer.style.display = 'flex';
  diffusionRadiosContainer.style.flexDirection = 'column';
  diffusionRadiosContainer.style.gap = '4px';
  diffusionRadiosContainer.style.fontSize = '12px';
  container.appendChild(diffusionRadiosContainer);

  const diffusionTypes = [
    { value: 'constant', label: 'Constant', checked: true },
    { value: 'linear', label: 'Linear (0 → max)' },
    { value: 'linear-reverse', label: 'Linear (max → 0)' },
    { value: 'quadratic', label: 'Quadratic' },
    { value: 'sqrt', label: 'Square root' },
    { value: 'cosine', label: 'Cosine' }
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
    diffusionRadiosContainer.appendChild(radioLabel);
  });

  // Add max diffusion slider
  const sliderContainer = document.createElement('div');
  sliderContainer.style.marginTop = '8px';
  sliderContainer.style.display = 'flex';
  sliderContainer.style.flexDirection = 'column';
  sliderContainer.style.gap = '4px';
  container.appendChild(sliderContainer);

  const sliderLabel = document.createElement('label');
  sliderLabel.style.fontSize = '12px';
  sliderLabel.textContent = 'Max diffusion coefficient:';
  sliderContainer.appendChild(sliderLabel);

  const sliderRow = document.createElement('div');
  sliderRow.style.display = 'flex';
  sliderRow.style.alignItems = 'center';
  sliderRow.style.gap = '8px';
  sliderContainer.appendChild(sliderRow);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '3';
  slider.step = '0.05';
  slider.value = '0.8';
  slider.style.flex = '1';
  sliderRow.appendChild(slider);

  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = '0.80';
  valueDisplay.style.fontSize = '12px';
  valueDisplay.style.minWidth = '40px';
  sliderRow.appendChild(valueDisplay);

  let currentMaxDiffusion = 0.8;

  function getSelectedDiffusionType(): string {
    const selected = diffusionRadios.find(r => r.checked);
    return selected?.value ?? 'constant';
  }

  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    currentMaxDiffusion = value;
    valueDisplay.textContent = value.toFixed(2);
    onChange(getSelectedDiffusionType(), value);
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
      slider.value = maxDiffusion.toString();
      valueDisplay.textContent = maxDiffusion.toFixed(2);
    }
  };
}

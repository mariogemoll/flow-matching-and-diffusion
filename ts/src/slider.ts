import { addDiv, addEl } from 'web-ui-common/dom';

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  initialValue: number;
  className?: string;
  valueFormat?: (value: number) => string;
  onChange: (value: number) => void;
}

export function addSlider(
  container: HTMLElement,
  options: SliderOptions
): { slider: HTMLInputElement; getValue: () => number; setValue: (value: number) => void } {
  const sliderDiv = addDiv(container, { class: options.className ?? 'slider' });

  const sliderLabel = addEl(sliderDiv, 'label', {}) as HTMLLabelElement;
  sliderLabel.textContent = options.label;

  const slider = addEl(sliderDiv, 'input', {
    type: 'range',
    min: options.min.toString(),
    max: options.max.toString(),
    step: options.step.toString(),
    value: options.initialValue.toString()
  }) as HTMLInputElement;

  const valueFormat = options.valueFormat ?? ((v: number): string => v.toString());
  const valueDisplay = addEl(sliderDiv, 'span', {}) as HTMLSpanElement;
  valueDisplay.textContent = valueFormat(options.initialValue);

  slider.addEventListener('input', () => {
    const value = parseFloat(slider.value);
    valueDisplay.textContent = valueFormat(value);
    options.onChange(value);
  });

  return {
    slider,
    getValue: (): number => parseFloat(slider.value),
    setValue: (value: number): void => {
      slider.value = value.toString();
      valueDisplay.textContent = valueFormat(value);
    }
  };
}

import { makeInput } from 'web-ui-common/dom';

export function makeCheckbox(checked = false): HTMLInputElement {
  const checkbox = makeInput({ type: 'checkbox' });
  checkbox.checked = checked;
  return checkbox;
}

export function makeSlider(
  min: number, max: number, step: number, value: number
): HTMLInputElement {
  return makeInput({
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value)
  });
}

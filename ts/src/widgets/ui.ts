import { makeButton, makeSpan } from 'web-ui-common/dom';

import { makeSlider } from './dom';

export interface TimeSliderElements {
  playPauseBtn: HTMLButtonElement;
  timeSlider: HTMLInputElement;
  timeValue: HTMLSpanElement;
}

export function makeTimeSliderElements(): TimeSliderElements {
  const playPauseBtn = makeButton();
  playPauseBtn.textContent = 'Pause';

  const timeSlider = makeSlider(0, 100, 1, 0);

  const timeValue = makeSpan();
  timeValue.textContent = '0.00';

  return {
    playPauseBtn,
    timeSlider,
    timeValue
  };
}

import {
  addDiv,
  addLabel,
  addText,
  makeCanvas
} from 'web-ui-common/dom';

import { CANVAS_HEIGHT,CANVAS_WIDTH } from '../constants';
import { makeCheckbox } from '../dom';
import { makeTimeSliderElements } from '../ui';
import type { VectorFieldWidgetElements } from './types';

export function makeVectorFieldWidgetElements(): VectorFieldWidgetElements {
  const canvas = makeCanvas({
    width: CANVAS_WIDTH.toString(),
    height: CANVAS_HEIGHT.toString()
  });

  const { playPauseBtn, timeSlider, timeValue } = makeTimeSliderElements();
  const showTrajectoryCheckbox = makeCheckbox(true);
  return {
    canvas,
    playPauseBtn,
    showTrajectoryCheckbox,
    timeSlider,
    timeValue
  };
}

export function applyStandardLayoutAndDecoration(
  container: HTMLElement, elements: VectorFieldWidgetElements
): void {
  container.appendChild(elements.canvas);

  const controlsContainer = addDiv(container, { class: 'controls' });

  const optionsContainer = addDiv(controlsContainer, { class: 'options' });

  // Controls
  const showTrajectoryLabel = addLabel(optionsContainer);
  showTrajectoryLabel.appendChild(elements.showTrajectoryCheckbox);
  addText(showTrajectoryLabel, ' Display trajectory');

  // Timeline
  const timelineContainer = addDiv(container, { class: 'slider time-slider' });
  timelineContainer.appendChild(elements.playPauseBtn);
  timelineContainer.appendChild(elements.timeSlider);
  timelineContainer.appendChild(elements.timeValue);
}

import {
  addCanvas,
  addEl,
  removePlaceholder
} from 'web-ui-common/dom';

import { createAnimationControlsUI, initAnimationControls } from './animation-controls';
import { initDraggableDot } from './draggable-dot';

interface VectorFieldWidgetState {
  dotX: number;
  dotY: number;
  isDragging: boolean;
  showTrajectory: boolean;
}

export function initVectorFieldWidget(container: HTMLElement, workerPath: string): void {
  removePlaceholder(container);

  const header = addEl(container, 'h2', {});
  header.textContent = 'Vector field';

  const canvas = addCanvas(container, { width: '400', height: '300' });

  const controls = createAnimationControlsUI({ parent: container });
  const { playPauseButton, frameDisplay, slider } = controls;

  const worker = new Worker(new URL(workerPath, import.meta.url), { type: 'module' });

  const state: VectorFieldWidgetState = {
    dotX: canvas.width / 2,
    dotY: canvas.height / 2,
    isDragging: false,
    showTrajectory: true
  };

  const offscreen = canvas.transferControlToOffscreen();

  worker.postMessage({
    type: 'init',
    canvas: offscreen,
    width: canvas.width,
    height: canvas.height,
    state
  }, [offscreen]);

  const animationControls = initAnimationControls({
    worker,
    slider,
    playPauseButton,
    frameDisplay
  });
  let wasPlayingBeforeDrag = true;
  let lastIsDragging = state.isDragging;

  function updateState(
    update: Partial<VectorFieldWidgetState>,
    options: { resetFrame?: boolean } = {}
  ): void {
    Object.assign(state, update);
    worker.postMessage({
      type: 'state-update',
      state
    });

    if (options.resetFrame === true) {
      worker.postMessage({
        type: 'set-frame',
        frame: 0
      });
    }
  }

  initDraggableDot(canvas, state, (newState) => {
    const wasDragging = lastIsDragging;
    const isStartingDrag = newState.isDragging && !wasDragging;
    const isEndingDrag = !newState.isDragging && wasDragging;

    if (isStartingDrag) {
      wasPlayingBeforeDrag = animationControls.isPlaying();
      animationControls.pause();
    }

    updateState(newState, { resetFrame: true });

    if (isEndingDrag && wasPlayingBeforeDrag) {
      animationControls.resume();
    }

    lastIsDragging = newState.isDragging;
  });

  const checkboxContainer = addEl(container, 'div', {});
  const checkbox = addEl(
    checkboxContainer,
    'input',
    { type: 'checkbox', id: 'show-trajectory' }
  ) as HTMLInputElement;
  checkbox.checked = state.showTrajectory;
  const label = addEl(checkboxContainer, 'label', { htmlFor: 'show-trajectory' });
  label.textContent = ' Show trajectory';

  checkbox.addEventListener('change', () => {
    updateState({ showTrajectory: checkbox.checked });
  });
}

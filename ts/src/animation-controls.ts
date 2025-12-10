import { addDiv, addEl, addSpan } from 'web-ui-common/dom';

import { TOTAL_FRAMES } from './animation-common';

interface AnimationControlsUiOptions {
  parent: HTMLElement;
  sliderWidth?: string;
}

export interface AnimationControlElements {
  container: HTMLDivElement;
  playPauseButton: HTMLButtonElement;
  frameDisplay: HTMLSpanElement;
  slider: HTMLInputElement;
}

export interface AnimationControlHandles extends AnimationControlElements {
  pause(): void;
  resume(): void;
  isPlaying(): boolean;
}

export function createAnimationControlsUI({
  parent,
  sliderWidth = '400px'
}: AnimationControlsUiOptions): AnimationControlElements {
  const controls = addDiv(parent, {}, { marginTop: '16px' });
  const playPauseButton = addEl(controls, 'button', {}) as HTMLButtonElement;
  playPauseButton.textContent = 'Pause';
  const frameDisplay = addSpan(controls, {}, { marginLeft: '16px' });
  frameDisplay.textContent = 'Frame: 0';
  const slider = addEl(controls, 'input', {
    type: 'range',
    min: '0',
    max: '99',
    value: '0'
  }, { width: sliderWidth, marginLeft: '16px' }) as HTMLInputElement;

  return {
    container: controls,
    playPauseButton,
    frameDisplay,
    slider
  };
}

interface AnimationControlsOptions {
  slider: HTMLInputElement;
  playPauseButton: HTMLButtonElement;
  frameDisplay: HTMLElement;
  worker: Worker;
  totalFrames?: number;
}

export function initAnimationControls({
  slider,
  playPauseButton,
  frameDisplay,
  worker,
  totalFrames = TOTAL_FRAMES
}: AnimationControlsOptions): AnimationControlHandles {
  slider.min = slider.min || '0';
  slider.max = slider.max || String(totalFrames - 1);
  slider.value = slider.value || '0';

  let isPlaying = true;
  let wasPlayingBeforeDrag = true;

  const updateFrameDisplay = (frame: number): void => {
    slider.value = String(frame);
    frameDisplay.textContent = `Frame: ${frame}`;
  };

  worker.addEventListener('message', (e: MessageEvent<unknown>) => {
    const data = e.data as Record<string, unknown>;
    if (data.type === 'frame-update' && typeof data.frame === 'number') {
      updateFrameDisplay(data.frame);
    }
  });

  const pause = (): void => {
    isPlaying = false;
    playPauseButton.textContent = 'Play';
    worker.postMessage({ type: 'pause-animation' });
  };

  const resume = (): void => {
    isPlaying = true;
    playPauseButton.textContent = 'Pause';
    worker.postMessage({ type: 'resume-animation' });
  };

  slider.addEventListener('mousedown', () => {
    wasPlayingBeforeDrag = isPlaying;
    pause();
  });

  slider.addEventListener('touchstart', () => {
    wasPlayingBeforeDrag = isPlaying;
    pause();
  });

  const resumeIfNeeded = (): void => {
    if (wasPlayingBeforeDrag) {
      resume();
    }
  };

  slider.addEventListener('mouseup', resumeIfNeeded);
  slider.addEventListener('touchend', resumeIfNeeded);
  slider.addEventListener('touchcancel', resumeIfNeeded);

  slider.addEventListener('input', () => {
    const frame = parseInt(slider.value, 10);
    const clampedFrame = Number.isFinite(frame)
      ? Math.max(0, Math.min(totalFrames - 1, frame))
      : 0;

    updateFrameDisplay(clampedFrame);

    worker.postMessage({
      type: 'set-frame',
      frame: clampedFrame
    });
  });

  playPauseButton.addEventListener('click', () => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  });

  // Initialize UI to match defaults
  const safeInitialFrame = Number.parseInt(slider.value, 10) || 0;
  updateFrameDisplay(safeInitialFrame);
  playPauseButton.textContent = 'Pause';

  return {
    container: slider.parentElement as HTMLDivElement,
    playPauseButton,
    frameDisplay,
    slider,
    pause,
    resume,
    isPlaying: () => isPlaying
  };
}

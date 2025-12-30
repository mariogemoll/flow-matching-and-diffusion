import { ANIMATION_DURATION, PAUSE_DURATION } from '../constants';
import type { createStateMachine } from './events';
import { render } from './rendering';
import type { VectorFieldWidget, VectorFieldWidgetElements, VectorFieldWidgetState } from './types';

export function createUpdateTimeUI(
  elements: VectorFieldWidgetElements,
  state: VectorFieldWidgetState
): () => void {
  return (): void => {
    const sliderValue = Math.round(state.currentTime * 100);
    elements.timeSlider.value = sliderValue.toString();
    elements.timeValue.textContent = state.currentTime.toFixed(2);
  };
}

export function createAnimationLoop(
  state: VectorFieldWidgetState,
  widget: VectorFieldWidget,
  updateTimeUI: () => void,
  transition: ReturnType<typeof createStateMachine>
): { animate: () => void; start: () => void } {
  let animationFrameId: number | null = null;

  const animate = (): void => {
    const now = performance.now();
    const deltaTime = now - state.lastFrameTime;
    state.lastFrameTime = now;

    if (state.mode === 'animating') {
      const timeIncrement = deltaTime / ANIMATION_DURATION;
      state.currentTime += timeIncrement;
      if (state.currentTime >= 1.0) {
        state.currentTime = 1.0;
        transition('ANIMATION_REACHED_END');
        setTimeout(() => {
          if (state.mode === 'animatingPausingAtEnd') {
            state.currentTime = 0.0;
            transition('PAUSE_DURATION_ELAPSED');
            updateTimeUI();
            render(widget.webgl, state);
            animationFrameId = requestAnimationFrame(animate);
          }
        }, PAUSE_DURATION);
      }
      updateTimeUI();
      render(widget.webgl, state);
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = null;
    }
  };

  const start = (): void => {
    if (animationFrameId === null) {
      state.lastFrameTime = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    }
  };

  return { animate, start };
}

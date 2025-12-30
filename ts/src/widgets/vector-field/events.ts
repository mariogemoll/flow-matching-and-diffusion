import { CANVAS_HEIGHT, CANVAS_WIDTH, TRAJECTORY_STEPS } from '../constants';
import { demoVectorField } from '../demo-vector-field';
import { setUpCanvasDrag } from '../interactivity';
import { calculateTrajectory } from '../math/vector-field';
import { render } from './rendering';
import type { VectorFieldWidget, VectorFieldWidgetMode,VectorFieldWidgetState } from './types';

type StateEvent =
  | 'PLAY_PAUSE_CLICKED'
  | 'TIME_SLIDER_INPUT'
  | 'TIME_SLIDER_RELEASED'
  | 'CANVAS_DRAG_START'
  | 'CANVAS_DRAG_END'
  | 'ANIMATION_REACHED_END'
  | 'PAUSE_DURATION_ELAPSED';

const STATE_TRANSITIONS: Record<
  VectorFieldWidgetMode, Partial<Record<StateEvent, VectorFieldWidgetMode>>
> = {
  paused: {
    PLAY_PAUSE_CLICKED: 'animating',
    TIME_SLIDER_INPUT: 'slidingTimeThenPause',
    CANVAS_DRAG_START: 'movingDotThenPause'
  },
  animating: {
    PLAY_PAUSE_CLICKED: 'paused',
    TIME_SLIDER_INPUT: 'slidingTimeThenAnimate',
    CANVAS_DRAG_START: 'movingDotThenAnimate',
    ANIMATION_REACHED_END: 'animatingPausingAtEnd'
  },
  animatingPausingAtEnd: {
    PLAY_PAUSE_CLICKED: 'paused',
    TIME_SLIDER_INPUT: 'slidingTimeThenAnimate',
    CANVAS_DRAG_START: 'movingDotThenAnimate',
    PAUSE_DURATION_ELAPSED: 'animating'
  },
  movingDotThenAnimate: {
    PLAY_PAUSE_CLICKED: 'movingDotThenPause',
    CANVAS_DRAG_END: 'animating'
  },
  movingDotThenPause: {
    PLAY_PAUSE_CLICKED: 'movingDotThenAnimate',
    CANVAS_DRAG_END: 'paused'
  },
  slidingTimeThenAnimate: {
    PLAY_PAUSE_CLICKED: 'slidingTimeThenPause',
    TIME_SLIDER_RELEASED: 'animating'
  },
  slidingTimeThenPause: {
    PLAY_PAUSE_CLICKED: 'slidingTimeThenAnimate',
    TIME_SLIDER_RELEASED: 'paused'
  }
};

export function createStateMachine(state: VectorFieldWidgetState) {
  return (event: StateEvent): void => {
    const nextMode = STATE_TRANSITIONS[state.mode][event];
    if (nextMode !== undefined) {
      state.mode = nextMode;
    }
  };
}

export function setUpEventHandlers(
  widget: VectorFieldWidget,
  state: VectorFieldWidgetState,
  updateTimeUI: () => void,
  transition: ReturnType<typeof createStateMachine>,
  startAnimation: () => void
): void {
  const { elements, webgl } = widget;

  const updateTrajectory = (startX: number, startY: number, startTime: number): void => {
    state.trajectory = calculateTrajectory(
      (x, y, t) => demoVectorField(x, y, t, CANVAS_WIDTH, CANVAS_HEIGHT),
      { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      TRAJECTORY_STEPS,
      [startX, startY],
      startTime
    );
  };

  const updatePlayPauseButton = (): void => {
    const isPlaying = state.mode === 'animating' ||
                      state.mode === 'animatingPausingAtEnd' ||
                      state.mode === 'movingDotThenAnimate' ||
                      state.mode === 'slidingTimeThenAnimate';
    elements.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
  };

  elements.playPauseBtn.addEventListener('click', () => {
    transition('PLAY_PAUSE_CLICKED');
    updatePlayPauseButton();
    if (state.mode === 'animating') {
      startAnimation();
    }
  });

  elements.showTrajectoryCheckbox.addEventListener('change', () => {
    state.showTrajectory = elements.showTrajectoryCheckbox.checked;
    render(webgl, state);
  });

  elements.timeSlider.addEventListener('input', () => {
    const t = parseFloat(elements.timeSlider.value) / 100;
    state.currentTime = t;
    transition('TIME_SLIDER_INPUT');
    updateTimeUI();
    render(webgl, state);
  });

  elements.timeSlider.addEventListener('change', () => {
    transition('TIME_SLIDER_RELEASED');
    if (state.mode === 'animating') {
      startAnimation();
    }
  });

  setUpCanvasDrag(elements.canvas, {
    onDragStart: (x, y) => {
      transition('CANVAS_DRAG_START');
      state.currentTime = 0;
      state.startPos = [x, y];
      updateTrajectory(state.startPos[0], state.startPos[1], state.currentTime);
      updateTimeUI();
      render(webgl, state);
    },
    onDrag: (x, y) => {
      state.currentTime = 0;
      state.startPos = [x, y];
      updateTrajectory(state.startPos[0], state.startPos[1], state.currentTime);
      updateTimeUI();
      render(webgl, state);
    },
    onDragEnd: () => {
      if (state.trajectory.length > 0) {
        transition('CANVAS_DRAG_END');
        if (state.mode === 'animating') {
          startAnimation();
        }
      }
    }
  });
}

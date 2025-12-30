import { CANVAS_HEIGHT, CANVAS_WIDTH, TRAJECTORY_STEPS } from '../constants';
import { demoVectorField } from '../demo-vector-field';
import { calculateTrajectory } from '../math/vector-field';
import { initWebGl } from '../webgl';
import { createAnimationLoop, createUpdateTimeUI } from './animation';
import { createStateMachine,setUpEventHandlers } from './events';
import { createInitialState } from './state';
import type { VectorFieldWidget,VectorFieldWidgetElements } from './types';
import { applyStandardLayoutAndDecoration,makeVectorFieldWidgetElements } from './ui';

export { makeVectorFieldWidgetElements } from './ui';

export function initVectorFieldWidget(elements: VectorFieldWidgetElements): void {
  const state = createInitialState();

  const widget: VectorFieldWidget = {
    elements,
    webgl: initWebGl(elements.canvas)
  };

  state.trajectory = calculateTrajectory(
    (x, y, t) => demoVectorField(x, y, t, CANVAS_WIDTH, CANVAS_HEIGHT),
    { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    TRAJECTORY_STEPS,
    state.startPos,
    state.currentTime
  );

  const updateTimeUI = createUpdateTimeUI(elements, state);
  const transition = createStateMachine(state);
  const animationLoop = createAnimationLoop(state, widget, updateTimeUI, transition);
  setUpEventHandlers(widget, state, updateTimeUI, transition, animationLoop.start);

  updateTimeUI();
  animationLoop.start();
}

export function createVectorFieldWidget(container: HTMLElement): void {
  container.innerHTML = '';

  const elements = makeVectorFieldWidgetElements();
  applyStandardLayoutAndDecoration(container, elements);
  initVectorFieldWidget(elements);
}

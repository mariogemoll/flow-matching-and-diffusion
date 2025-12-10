import {
  addCanvas,
  addDiv,
  addEl,
  removePlaceholder
} from 'web-ui-common/dom';

import { createAnimationControlsUI, initAnimationControls } from './animation-controls';
import { initDraggableDot } from './draggable-dot';

interface OrbitWidgetState {
  dotX: number;
  dotY: number;
  isDragging: boolean;
}

export function initOrbitWidget(container: HTMLElement, workerPath: string): void {
  removePlaceholder(container);

  const header = addEl(container, 'h2', {});
  header.textContent = 'Orbit';

  const viewsWrapper = addDiv(container, {}, { display: 'flex', gap: '20px' });

  const view1 = addDiv(viewsWrapper, {}, {});
  const view1Title = addEl(view1, 'h3', {});
  view1Title.textContent = 'Circular';
  const canvas1 = addCanvas(view1, { width: '400', height: '300' });

  const view2 = addDiv(viewsWrapper, {}, {});
  const view2Title = addEl(view2, 'h3', {});
  view2Title.textContent = 'Elliptical';
  const canvas2 = addCanvas(view2, { width: '400', height: '300' });

  const controls = createAnimationControlsUI({ parent: container });
  const { slider, playPauseButton, frameDisplay } = controls;

  // State
  const state: OrbitWidgetState = {
    dotX: 200,  // Center of 400px canvas
    dotY: 150,  // Center of 300px canvas
    isDragging: false
  };

  // Transfer both canvases to worker
  const offscreen1 = canvas1.transferControlToOffscreen();
  const offscreen2 = canvas2.transferControlToOffscreen();

  // Create worker
  const worker = new Worker(new URL(workerPath, import.meta.url), {
    type: 'module'
  });

  initAnimationControls({ worker, slider, playPauseButton, frameDisplay });

  // Send both canvases to worker
  worker.postMessage({
    type: 'init',
    canvas1: offscreen1,
    canvas2: offscreen2,
    width: canvas1.width,
    height: canvas1.height
  }, [offscreen1, offscreen2]);

  function updateState(updates: Partial<OrbitWidgetState>): void {
    Object.assign(state, updates);
    worker.postMessage({
      type: 'state-update',
      state
    });
  }

  initDraggableDot(canvas1, state, updateState);
  initDraggableDot(canvas2, state, updateState);

  // Send initial state
  updateState({});
}

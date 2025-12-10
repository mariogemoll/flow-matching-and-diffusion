import { el } from 'web-ui-common/dom';

interface OrbitWidgetState {
  dotX: number;
  dotY: number;
  isDragging: boolean;
}

export function initOrbitWidget(container: HTMLElement, workerPath: string): void {
  const canvas1 = el(container, '#orbit-canvas') as HTMLCanvasElement;
  const canvas2 = el(container, '#orbit-canvas-2') as HTMLCanvasElement;
  const slider = el(container, '#animation-slider') as HTMLInputElement;
  const frameDisplay = el(container, '#frame-display') as HTMLElement;
  const playPauseButton = el(container, '#play-pause-button') as HTMLButtonElement;

  // State
  const state: OrbitWidgetState = {
    dotX: 200,  // Center of 400px canvas
    dotY: 150,  // Center of 300px canvas
    isDragging: false
  };

  let isPlaying = true;

  // Transfer both canvases to worker
  const offscreen1 = canvas1.transferControlToOffscreen();
  const offscreen2 = canvas2.transferControlToOffscreen();

  // Create worker
  const worker = new Worker(new URL(workerPath, import.meta.url), {
    type: 'module'
  });

  // Handle messages from worker
  worker.addEventListener('message', (e: MessageEvent<unknown>) => {
    const data = e.data as Record<string, unknown>;
    if (data.type === 'frame-update') {
      slider.value = String(data.frame);
      frameDisplay.textContent = `Frame: ${String(data.frame)}`;
    }
  });

  // Handle slider input to control animation
  let wasPlayingBeforeDrag = true;

  slider.addEventListener('mousedown', () => {
    wasPlayingBeforeDrag = isPlaying;
    worker.postMessage({ type: 'pause-animation' });
  });

  slider.addEventListener('input', () => {
    const frame = parseInt(slider.value, 10);
    frameDisplay.textContent = `Frame: ${frame}`;
    worker.postMessage({
      type: 'set-frame',
      frame
    });
  });

  slider.addEventListener('mouseup', () => {
    if (wasPlayingBeforeDrag) {
      worker.postMessage({ type: 'resume-animation' });
    }
  });

  // Handle play/pause button
  playPauseButton.addEventListener('click', () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
      playPauseButton.textContent = 'Pause';
      worker.postMessage({ type: 'resume-animation' });
    } else {
      playPauseButton.textContent = 'Play';
      worker.postMessage({ type: 'pause-animation' });
    }
  });

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

  // Helper to set up mouse events for a canvas
  function setupMouseEvents(canvas: HTMLCanvasElement): void {
    function getMousePos(event: MouseEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    canvas.addEventListener('mousedown', (event) => {
      const pos = getMousePos(event);
      updateState({
        dotX: pos.x,
        dotY: pos.y,
        isDragging: true
      });
    });

    canvas.addEventListener('mousemove', (event) => {
      if (state.isDragging) {
        const pos = getMousePos(event);
        updateState({
          dotX: pos.x,
          dotY: pos.y
        });
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (state.isDragging) {
        updateState({ isDragging: false });
      }
    });

    canvas.addEventListener('mouseleave', () => {
      if (state.isDragging) {
        updateState({ isDragging: false });
      }
    });
  }

  // Set up mouse events for both canvases
  setupMouseEvents(canvas1);
  setupMouseEvents(canvas2);

  // Send initial state
  updateState({});
}

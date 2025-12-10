export interface DraggableDotState {
  dotX: number;
  dotY: number;
  isDragging: boolean;
}

export function initDraggableDot(
  canvas: HTMLCanvasElement,
  state: DraggableDotState,
  onChange: (state: DraggableDotState) => void
): void {
  const getMousePos = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const updateState = (updates: Partial<DraggableDotState>): void => {
    Object.assign(state, updates);
    onChange(state);
  };

  canvas.addEventListener('mousedown', (event) => {
    const pos = getMousePos(event);
    updateState({
      dotX: pos.x,
      dotY: pos.y,
      isDragging: true
    });
  });

  canvas.addEventListener('mousemove', (event) => {
    if (!state.isDragging) {
      return;
    }
    const pos = getMousePos(event);
    updateState({
      dotX: pos.x,
      dotY: pos.y
    });
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

import type { Pair } from 'web-ui-common/types';

export interface CanvasDragHandlers {
  onDragStart?: (x: number, y: number) => void;
  onDrag?: (x: number, y: number) => void;
  onDragEnd?: () => void;
}

export function setUpCanvasDrag(
  canvas: HTMLCanvasElement,
  handlers: CanvasDragHandlers
): void {
  let isDragging = false;

  const getCoords = (event: MouseEvent): Pair<number> => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return [Math.floor(x), Math.floor(y)];
  };

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging = true;
    const [x, y] = getCoords(e);
    if (handlers.onDragStart) {
      handlers.onDragStart(x, y);
    }
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) {return;}
    const [x, y] = getCoords(e);
    if (handlers.onDrag) {
      handlers.onDrag(x, y);
    }
  });

  const endDrag = (): void => {
    isDragging = false;
    if (handlers.onDragEnd) {
      handlers.onDragEnd();
    }
  };

  canvas.addEventListener('mouseup', endDrag);
  canvas.addEventListener('mouseleave', endDrag);
}

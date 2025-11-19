import { addDot } from 'web-ui-common/canvas';
import type { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import { SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { computeGaussianPdfTfjs } from './gaussian-tf';

/**
 * Draw an arrow with an arrowhead in the specified color (pixel coordinates)
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  lineWidth = 1
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  // Draw arrow shaft
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw arrowhead
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLen = 5;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLen * Math.cos(angle - Math.PI / 6),
    endY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLen * Math.cos(angle + Math.PI / 6),
    endY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw an arrow with an arrowhead in the specified color (data coordinates)
 */
export function drawArrowDataSpace(
  ctx: CanvasRenderingContext2D,
  xScale: ReturnType<typeof makeScale>,
  yScale: ReturnType<typeof makeScale>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth = 1.5
): void {
  const px1 = xScale(x1);
  const py1 = yScale(y1);
  const px2 = xScale(x2);
  const py2 = yScale(y2);

  drawArrow(ctx, px1, py1, px2, py2, color, lineWidth);
}

export interface Arrow {
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  normalizedLength: number;
}

/**
 * Draw multiple arrows with viridis coloring based on normalized length
 */
export function drawArrows(ctx: CanvasRenderingContext2D, arrows: Arrow[]): void {
  for (const { startX, startY, dx, dy, normalizedLength } of arrows) {
    const endX = startX + dx;
    const endY = startY + dy;
    const color = viridis(normalizedLength);
    drawArrow(ctx, startX, startY, endX, endY, color);
  }
}

/**
 * Draw a standard normal distribution background at t=0
 */
export function drawStandardNormalBackground(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  xScale: ReturnType<typeof makeScale>,
  yScale: ReturnType<typeof makeScale>,
  time: number
): void {
  if (Math.abs(time) < 0.01) {
    const result = computeGaussianPdfTfjs(
      canvas,
      ctx,
      xScale,
      yScale,
      0,
      0,
      1,
      false
    );
    ctx.putImageData(result.imageData, 0, 0);
  }
}

/**
 * Draw sample points on the canvas
 */
export function drawSamplePoints(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[]
): void {
  ctx.save();
  ctx.fillStyle = SAMPLED_POINT_COLOR;
  for (const { x, y } of points) {
    addDot(ctx, x, y, SAMPLED_POINT_RADIUS, SAMPLED_POINT_COLOR);
  }
  ctx.restore();
}

export interface SampleButtonConfig {
  container: HTMLElement;
  onSample: () => void;
  onClear: () => void;
}

/**
 * Create Sample and Clear buttons with standard styling
 */
export function createSampleButtons(config: SampleButtonConfig): {
  sampleBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  updateButtonStates: (time: number, hasSamples: boolean) => void;
} {
  const controlsDiv = document.createElement('div');
  controlsDiv.style.marginTop = '8px';
  config.container.appendChild(controlsDiv);

  const sampleBtn = document.createElement('button');
  sampleBtn.textContent = 'Sample';
  controlsDiv.appendChild(sampleBtn);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.marginLeft = '8px';
  controlsDiv.appendChild(clearBtn);

  sampleBtn.addEventListener('click', config.onSample);
  clearBtn.addEventListener('click', config.onClear);

  function updateButtonStates(time: number, hasSamples: boolean): void {
    sampleBtn.disabled = Math.abs(time) >= 0.01;
    clearBtn.disabled = !hasSamples;
  }

  return { sampleBtn, clearBtn, updateButtonStates };
}

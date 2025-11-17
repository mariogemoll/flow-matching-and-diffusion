import { addDot, addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import {
  computeGaussianMixture,
  drawGaussianContours,
  drawGaussianMixturePDF,
  type GaussianComponent
} from './gaussian';

export function setUpGaussianCpu(): void {
  const canvas = el(document, '#gaussian-cpu-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let mean: [number, number] = [0, 0];
  let isDragging = false;

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gaussian: GaussianComponent = {
      mean,
      weight: 1,
      covariance: [[1, 0], [0, 1]]
    };

    const { probabilityGrid, maxValue } = computeGaussianMixture(
      xScale,
      yScale,
      [gaussian],
      canvas.width,
      canvas.height
    );

    drawGaussianMixturePDF(ctx, probabilityGrid, maxValue, canvas.width, canvas.height);
    drawGaussianContours(ctx, probabilityGrid, maxValue, canvas.width, canvas.height);

    addFrameUsingScales(ctx, xScale, yScale, 10);

    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);
    addDot(ctx, meanPixelX, meanPixelY, 6, '#FF5722');
  }

  function getMousePosition(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    return [pixelX, pixelY];
  }

  function isPointNear(px: number, py: number, x: number, y: number, threshold = 15): boolean {
    return Math.sqrt((px - x) ** 2 + (py - y) ** 2) < threshold;
  }

  canvas.addEventListener('mousedown', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isDragging) {
      mean = [xScale.inverse(pixelX), yScale.inverse(pixelY)];
      render();
    } else if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  render();
}

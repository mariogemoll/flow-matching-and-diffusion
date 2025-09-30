import type { Scale } from './web-ui-common/types';

export interface GaussianComponent {
  mean: [number, number];
  weight: number;
  covariance: [[number, number], [number, number]];
}

function gaussianValue(
  x: number,
  y: number,
  meanX: number,
  meanY: number,
  covariance: [[number, number], [number, number]]
): number {
  const dx = x - meanX;
  const dy = y - meanY;

  const det = covariance[0][0] * covariance[1][1] - covariance[0][1] * covariance[1][0];

  if (Math.abs(det) < 1e-10) {
    return 0;
  }

  const invCov = [
    [covariance[1][1] / det, -covariance[0][1] / det],
    [-covariance[1][0] / det, covariance[0][0] / det]
  ];

  const quadForm = dx * (invCov[0][0] * dx + invCov[0][1] * dy) +
                   dy * (invCov[1][0] * dx + invCov[1][1] * dy);

  const exponent = -0.5 * quadForm;
  const normalization = 1.0 / (2 * Math.PI * Math.sqrt(Math.abs(det)));

  return normalization * Math.exp(exponent);
}

export function computeGaussianMixture(
  xScale: Scale,
  yScale: Scale,
  components: GaussianComponent[],
  canvasWidth: number,
  canvasHeight: number
): { probabilityGrid: number[][], maxValue: number } {
  let maxValue = 0;
  const probabilityGrid: number[][] = [];

  const [xMin, xMax] = xScale.range;
  const [yMax, yMin] = yScale.range;

  for (let pixelX = 0; pixelX < canvasWidth; pixelX++) {
    probabilityGrid[pixelX] = [];
    for (let pixelY = 0; pixelY < canvasHeight; pixelY++) {
      if (pixelX < xMin || pixelX > xMax || pixelY < yMin || pixelY > yMax) {
        probabilityGrid[pixelX][pixelY] = 0;
        continue;
      }

      const dataX = xScale.inverse(pixelX);
      const dataY = yScale.inverse(pixelY);

      let value = 0;
      for (const component of components) {
        value += component.weight * gaussianValue(
          dataX,
          dataY,
          component.mean[0],
          component.mean[1],
          component.covariance
        );
      }

      probabilityGrid[pixelX][pixelY] = value;
      if (value > maxValue) {maxValue = value;}
    }
  }

  return { probabilityGrid, maxValue };
}

export function drawGaussianMixturePDF(
  ctx: CanvasRenderingContext2D,
  probabilityGrid: number[][],
  maxValue: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  const data = imageData.data;

  for (let pixelX = 0; pixelX < canvasWidth; pixelX++) {
    for (let pixelY = 0; pixelY < canvasHeight; pixelY++) {
      const value = probabilityGrid[pixelX][pixelY];
      const normalizedValue = maxValue > 0 ? value / maxValue : 0;

      const index = (pixelY * canvasWidth + pixelX) * 4;

      const intensity = Math.min(255, normalizedValue * 255);
      data[index] = 30;
      data[index + 1] = 150;
      data[index + 2] = 255;
      data[index + 3] = intensity;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function drawGaussianContours(
  ctx: CanvasRenderingContext2D,
  probabilityGrid: number[][],
  maxValue: number,
  canvasWidth: number,
  canvasHeight: number,
  levels: number[] = [0.1, 0.25, 0.5, 0.75, 0.9]
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const level of levels) {
    const threshold = level * maxValue;

    for (let x = 0; x < canvasWidth - 1; x += 1) {
      for (let y = 0; y < canvasHeight - 1; y += 1) {
        const v00 = probabilityGrid[x]?.[y] ?? 0;
        const v10 = probabilityGrid[Math.min(x + 1, canvasWidth - 1)]?.[y] ?? 0;
        const v01 = probabilityGrid[x]?.[Math.min(y + 1, canvasHeight - 1)] ?? 0;
        const v11 = probabilityGrid[Math.min(x + 1, canvasWidth - 1)]?.[
          Math.min(y + 1, canvasHeight - 1)
        ] ?? 0;

        const edges: [number, number][] = [];

        if ((v00 > threshold) !== (v10 > threshold)) {
          const t = (threshold - v00) / (v10 - v00);
          edges.push([x + t, y]);
        }
        if ((v10 > threshold) !== (v11 > threshold)) {
          const t = (threshold - v10) / (v11 - v10);
          edges.push([x + 1, y + t]);
        }
        if ((v01 > threshold) !== (v11 > threshold)) {
          const t = (threshold - v01) / (v11 - v01);
          edges.push([x + t, y + 1]);
        }
        if ((v00 > threshold) !== (v01 > threshold)) {
          const t = (threshold - v00) / (v01 - v00);
          edges.push([x, y + t]);
        }

        if (edges.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(edges[0][0], edges[0][1]);
          for (let i = 1; i < edges.length; i++) {
            ctx.lineTo(edges[i][0], edges[i][1]);
          }
          ctx.stroke();
        }
      }
    }
  }

  ctx.restore();
}

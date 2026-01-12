import type { Pair } from '../types';

export function createDataToClipMatrix(
  xDomain: Pair<number>,
  yDomain: Pair<number>,
  logicalWidth: number,
  logicalHeight: number,
  canvasWidth: number,
  canvasHeight: number
): Float32Array {
  const [dataXMin, dataXMax] = xDomain;
  const [dataYMin, dataYMax] = yDomain;

  const dataWidth = dataXMax - dataXMin;
  const dataHeight = dataYMax - dataYMin;

  const scaleX = logicalWidth / dataWidth;
  const scaleY = -logicalHeight / dataHeight; // flip Y
  const translateX = 0 - dataXMin * scaleX;
  const translateY = logicalHeight - dataYMin * scaleY;

  const dpr = window.devicePixelRatio || 1;
  const clipScaleX = (2 * dpr) / canvasWidth;
  const clipScaleY = (-2 * dpr) / canvasHeight;

  const finalScaleX = scaleX * clipScaleX;
  const finalScaleY = scaleY * clipScaleY;
  const finalTranslateX = translateX * clipScaleX - 1;
  const finalTranslateY = translateY * clipScaleY + 1;

  return new Float32Array([
    finalScaleX, 0, 0,
    0, finalScaleY, 0,
    finalTranslateX, finalTranslateY, 1
  ]);
}

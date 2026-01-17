import type { Pair } from '../types';

export function createDataToClipMatrix(
  xDomain: Pair<number>,
  yDomain: Pair<number>
): Float32Array {
  const [dataXMin, dataXMax] = xDomain;
  const [dataYMin, dataYMax] = yDomain;

  const dataWidth = dataXMax - dataXMin;
  const dataHeight = dataYMax - dataYMin;

  // Map [dataXMin, dataXMax] to [-1, 1]
  const finalScaleX = 2 / dataWidth;
  const finalTranslateX = -1 - (2 * dataXMin) / dataWidth;

  // Map [dataYMin, dataYMax] to [-1, 1]
  const finalScaleY = 2 / dataHeight;
  const finalTranslateY = -1 - (2 * dataYMin) / dataHeight;

  return new Float32Array([
    finalScaleX, 0, 0,
    0, finalScaleY, 0,
    finalTranslateX, finalTranslateY, 1
  ]);
}

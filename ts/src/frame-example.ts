import { addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

export function setUpFrameExample(): void {
  const canvas = el(document, '#frame-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [0, 100] as [number, number];
  const yRange = [0, 360] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);
  addFrameUsingScales(ctx, xScale, yScale, 10);
}

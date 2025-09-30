import { addFrameUsingScales, defaultMargins, getContext  } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import { makeScale } from './web-ui-common/util';

function setUpFrameExample(): void {
  const canvas = el(document, '#frame-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [0, 100] as [number, number];
  const yRange = [0, 360] as [number, number];
  const margins = defaultMargins;
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);
  addFrameUsingScales(ctx, xScale, yScale, 10);
}

function run(): void {
  setUpFrameExample();
}

run();

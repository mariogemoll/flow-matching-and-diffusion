import { addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

function setUpVectorField(): void {
  const canvas = el(document, '#vf-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);

  // Set up coordinate system
  const xRange = [0, 800] as [number, number];
  const yRange = [0, 600] as [number, number];
  const margins = { top: 20, right: 20, bottom: 20, left: 20 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  // Draw the frame
  addFrameUsingScales(ctx, xScale, yScale, 10);
}

function run(): void {
  setUpVectorField();
}

run();

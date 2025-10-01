import { drawGaussianContours, drawGaussianMixturePDF, type GaussianComponent } from './gaussian';
import { computeGaussianMixtureTfjs } from './gaussian-tf';
import { addFrameUsingScales, getContext } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import { makeScale } from './web-ui-common/util';

function run(): void {
  const leftCanvas = el(document, '#marginal-left-canvas') as HTMLCanvasElement;
  const leftCtx = getContext(leftCanvas);

  const rightCanvas = el(document, '#marginal-right-canvas') as HTMLCanvasElement;
  const rightCtx = getContext(rightCanvas);

  // Define coordinate system (in data space)
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, leftCanvas.width - margins.right]);
  const yScale = makeScale(yRange, [leftCanvas.height - margins.bottom, margins.top]);

  // Define a test Gaussian mixture
  const components: GaussianComponent[] = [
    {
      mean: [1, 0.5],
      weight: 0.4,
      covariance: [[0.5, 0.2], [0.2, 0.3]]
    },
    {
      mean: [-1, -0.5],
      weight: 0.35,
      covariance: [[0.3, -0.1], [-0.1, 0.4]]
    },
    {
      mean: [0, 1.5],
      weight: 0.25,
      covariance: [[0.6, 0], [0, 0.2]]
    }
  ];

  function render(): void {
    // Clear both canvases
    leftCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);

    // Compute and render the mixture PDF using TF.js on left canvas
    const { probabilityGrid, maxValue } = computeGaussianMixtureTfjs(
      xScale,
      yScale,
      components,
      leftCanvas.width,
      leftCanvas.height
    );

    drawGaussianMixturePDF(
      leftCtx,
      probabilityGrid,
      maxValue,
      leftCanvas.width,
      leftCanvas.height
    );
    drawGaussianContours(leftCtx, probabilityGrid, maxValue, leftCanvas.width, leftCanvas.height);

    // Add coordinate frames to both canvases
    addFrameUsingScales(leftCtx, xScale, yScale, 11);
    addFrameUsingScales(rightCtx, xScale, yScale, 11);
  }

  render();

  console.log('Marginal probability path initialized with TF.js');
}

run();

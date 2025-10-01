import { drawGaussianContours, drawGaussianMixturePDF, type GaussianComponent } from './gaussian';
import { computeGaussianMixtureTfjs } from './gaussian-tf';
import { addDot, addFrameUsingScales, getContext } from './web-ui-common/canvas';
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

  // Interaction state
  let selectedComponentIndex = -1;
  let isDragging = false;
  let dragOffset: [number, number] = [0, 0];

  // Color palette for components
  const colorPalette = ['#FF5722', '#4CAF50', '#2196F3', '#AB47BC', '#FFB300', '#009688'];

  function getComponentColor(index: number): string {
    return colorPalette[index % colorPalette.length] ?? '#FF5722';
  }

  function isPointInEllipse(
    px: number,
    py: number,
    component: GaussianComponent,
    scale = 2.0
  ): boolean {
    const dx = px - component.mean[0];
    const dy = py - component.mean[1];

    const [[a, b], [c, d]] = component.covariance;
    const det = a * d - b * c;

    if (det <= 0) {return false;}

    const invA = d / det;
    const invB = -b / det;
    const invC = -c / det;
    const invD = a / det;

    const quadForm = dx * (invA * dx + invB * dy) + dy * (invC * dx + invD * dy);
    const threshold = scale * scale;

    return quadForm <= threshold;
  }

  function getMousePosition(e: MouseEvent): [number, number] {
    const rect = leftCanvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    return [xScale.inverse(pixelX), yScale.inverse(pixelY)];
  }

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

    // Draw component centers
    components.forEach((component, index) => {
      const pixelX = xScale(component.mean[0]);
      const pixelY = yScale(component.mean[1]);
      const color = getComponentColor(index);
      const radius = selectedComponentIndex === index ? 8 : 6;
      addDot(leftCtx, pixelX, pixelY, radius, color);
    });
  }

  leftCanvas.addEventListener('mousedown', (e) => {
    const [dataX, dataY] = getMousePosition(e);

    // Check if clicking on any component
    for (let i = components.length - 1; i >= 0; i--) {
      if (isPointInEllipse(dataX, dataY, components[i])) {
        selectedComponentIndex = i;
        isDragging = true;
        dragOffset = [dataX - components[i].mean[0], dataY - components[i].mean[1]];
        leftCanvas.style.cursor = 'grabbing';
        render();
        return;
      }
    }

    // Clicked on empty space - deselect
    selectedComponentIndex = -1;
    render();
  });

  leftCanvas.addEventListener('mousemove', (e) => {
    const [dataX, dataY] = getMousePosition(e);

    if (isDragging && selectedComponentIndex >= 0) {
      // Update component position
      components[selectedComponentIndex].mean = [dataX - dragOffset[0], dataY - dragOffset[1]];
      render();
    } else {
      // Update cursor based on hover
      let hovering = false;
      for (const component of components) {
        if (isPointInEllipse(dataX, dataY, component)) {
          hovering = true;
          break;
        }
      }
      leftCanvas.style.cursor = hovering ? 'grab' : 'default';
    }
  });

  leftCanvas.addEventListener('mouseup', () => {
    isDragging = false;
    leftCanvas.style.cursor = 'default';
  });

  leftCanvas.addEventListener('mouseleave', () => {
    isDragging = false;
    leftCanvas.style.cursor = 'default';
  });

  render();

  console.log('Marginal probability path initialized with TF.js');
}

run();

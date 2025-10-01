import { drawGaussianContours, drawGaussianMixturePDF, type GaussianComponent } from './gaussian';
import { computeGaussianMixtureTfjs } from './gaussian-tf';
import { addDot, addFrameUsingScales, getContext } from './web-ui-common/canvas';
import { el } from './web-ui-common/dom';
import { makeScale } from './web-ui-common/util';

interface ExtendedGaussianComponent extends GaussianComponent {
  majorAxis: [number, number]; // In data space
  minorAxis: [number, number]; // In data space
}

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

  // Helper to build covariance from axes
  function buildCovarianceFromAxes(
    majorAxis: [number, number],
    minorAxis: [number, number]
  ): [[number, number], [number, number]] {
    const [mx, my] = majorAxis;
    const [nx, ny] = minorAxis;

    const majorVar = mx * mx + my * my;
    const minorVar = nx * nx + ny * ny;

    const majorLen = Math.sqrt(majorVar);
    if (majorLen === 0) {return [[1, 0], [0, 1]];}

    const cos = mx / majorLen;
    const sin = my / majorLen;

    return [
      [majorVar * cos * cos + minorVar * sin * sin, (majorVar - minorVar) * cos * sin],
      [(majorVar - minorVar) * cos * sin, majorVar * sin * sin + minorVar * cos * cos]
    ];
  }

  // Define a test Gaussian mixture with axes
  const components: ExtendedGaussianComponent[] = [
    {
      mean: [1, 0.5],
      weight: 0.4,
      majorAxis: [0.8, 0.3],
      minorAxis: [-0.2, 0.5],
      covariance: [[0, 0], [0, 0]]
    },
    {
      mean: [-1, -0.5],
      weight: 0.35,
      majorAxis: [0.6, -0.2],
      minorAxis: [0.3, 0.7],
      covariance: [[0, 0], [0, 0]]
    },
    {
      mean: [0, 1.5],
      weight: 0.25,
      majorAxis: [0.9, 0],
      minorAxis: [0, 0.4],
      covariance: [[0, 0], [0, 0]]
    }
  ];

  // Initialize covariance from axes
  components.forEach((c) => {
    c.covariance = buildCovarianceFromAxes(c.majorAxis, c.minorAxis);
  });

  // Interaction state
  let selectedComponentIndex = -1;
  let isDragging = false;
  let dragOffset: [number, number] = [0, 0];
  let selectedHandleType:
    | 'center'
    | 'major-pos'
    | 'major-neg'
    | 'minor-pos'
    | 'minor-neg'
    | null = null;

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

  interface Handle {
    x: number;
    y: number;
    type: 'center' | 'major-pos' | 'major-neg' | 'minor-pos' | 'minor-neg';
    componentIndex: number;
  }

  function getHandlePositions(componentIndex: number): Handle[] {
    if (componentIndex < 0 || componentIndex >= components.length) {return [];}
    const component = components[componentIndex];

    const [centerX, centerY] = component.mean;
    const [majorX, majorY] = component.majorAxis;
    const [minorX, minorY] = component.minorAxis;

    const VISUAL_SCALE = 0.6;

    return [
      { x: centerX, y: centerY, type: 'center', componentIndex },
      {
        x: centerX + majorX * VISUAL_SCALE,
        y: centerY + majorY * VISUAL_SCALE,
        type: 'major-pos',
        componentIndex
      },
      {
        x: centerX - majorX * VISUAL_SCALE,
        y: centerY - majorY * VISUAL_SCALE,
        type: 'major-neg',
        componentIndex
      },
      {
        x: centerX + minorX * VISUAL_SCALE,
        y: centerY + minorY * VISUAL_SCALE,
        type: 'minor-pos',
        componentIndex
      },
      {
        x: centerX - minorX * VISUAL_SCALE,
        y: centerY - minorY * VISUAL_SCALE,
        type: 'minor-neg',
        componentIndex
      }
    ];
  }

  function isPointNearHandle(px: number, py: number, handle: Handle, threshold = 0.2): boolean {
    return Math.sqrt((px - handle.x) ** 2 + (py - handle.y) ** 2) < threshold;
  }

  function findNearestHandle(dataX: number, dataY: number): Handle | null {
    if (selectedComponentIndex < 0) {return null;}

    const handles = getHandlePositions(selectedComponentIndex);
    for (const handle of handles) {
      if (isPointNearHandle(dataX, dataY, handle)) {
        return handle;
      }
    }
    return null;
  }

  function drawHandles(componentIndex: number): void {
    if (selectedComponentIndex !== componentIndex) {return;}

    const component = components[componentIndex];

    const [centerX, centerY] = component.mean;
    const centerPixelX = xScale(centerX);
    const centerPixelY = yScale(centerY);

    const VISUAL_SCALE = 0.6;
    const majorPixelX = xScale(
      centerX + component.majorAxis[0] * VISUAL_SCALE
    );
    const majorPixelY = yScale(
      centerY + component.majorAxis[1] * VISUAL_SCALE
    );
    const minorPixelX = xScale(
      centerX + component.minorAxis[0] * VISUAL_SCALE
    );
    const minorPixelY = yScale(
      centerY + component.minorAxis[1] * VISUAL_SCALE
    );

    leftCtx.save();

    // Draw crosshair lines
    leftCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    leftCtx.lineWidth = 2;
    leftCtx.setLineDash([5, 5]);

    // Major axis line
    leftCtx.beginPath();
    leftCtx.moveTo(2 * centerPixelX - majorPixelX, 2 * centerPixelY - majorPixelY);
    leftCtx.lineTo(majorPixelX, majorPixelY);
    leftCtx.stroke();

    // Minor axis line
    leftCtx.beginPath();
    leftCtx.moveTo(2 * centerPixelX - minorPixelX, 2 * centerPixelY - minorPixelY);
    leftCtx.lineTo(minorPixelX, minorPixelY);
    leftCtx.stroke();

    leftCtx.setLineDash([]);

    // Draw handles
    const handleRadius = 6;
    const color = getComponentColor(componentIndex);
    leftCtx.fillStyle = color;
    leftCtx.strokeStyle = 'white';
    leftCtx.lineWidth = 2;

    // Center handle
    leftCtx.beginPath();
    leftCtx.arc(centerPixelX, centerPixelY, handleRadius, 0, 2 * Math.PI);
    leftCtx.fill();
    leftCtx.stroke();

    // Major axis handles
    leftCtx.beginPath();
    leftCtx.arc(majorPixelX, majorPixelY, handleRadius, 0, 2 * Math.PI);
    leftCtx.fill();
    leftCtx.stroke();

    leftCtx.beginPath();
    leftCtx.arc(
      2 * centerPixelX - majorPixelX,
      2 * centerPixelY - majorPixelY,
      handleRadius,
      0,
      2 * Math.PI
    );
    leftCtx.fill();
    leftCtx.stroke();

    // Minor axis handles
    leftCtx.beginPath();
    leftCtx.arc(minorPixelX, minorPixelY, handleRadius, 0, 2 * Math.PI);
    leftCtx.fill();
    leftCtx.stroke();

    leftCtx.beginPath();
    leftCtx.arc(
      2 * centerPixelX - minorPixelX,
      2 * centerPixelY - minorPixelY,
      handleRadius,
      0,
      2 * Math.PI
    );
    leftCtx.fill();
    leftCtx.stroke();

    leftCtx.restore();
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

    // Draw handles for selected component
    if (selectedComponentIndex >= 0) {
      drawHandles(selectedComponentIndex);
    }
  }

  function handleMajorAxisDrag(mouseX: number, mouseY: number, componentIndex: number): void {
    const component = components[componentIndex];
    const [centerX, centerY] = component.mean;

    const VISUAL_SCALE = 0.6;

    // Calculate new major axis vector (unscaled)
    const dx = (mouseX - centerX) / VISUAL_SCALE;
    const dy = (mouseY - centerY) / VISUAL_SCALE;
    const newMajorLength = Math.sqrt(dx * dx + dy * dy);

    if (newMajorLength < 0.01) {return;}

    // Get current minor axis length
    const currentMinorLength = Math.sqrt(
      component.minorAxis[0] ** 2 + component.minorAxis[1] ** 2
    );

    // Normalize the new major axis direction
    const majorUnitX = dx / newMajorLength;
    const majorUnitY = dy / newMajorLength;

    // Create perpendicular minor axis (rotate major axis 90 degrees)
    const minorUnitX = -majorUnitY;
    const minorUnitY = majorUnitX;

    // Update both axes
    component.majorAxis = [majorUnitX * newMajorLength, majorUnitY * newMajorLength];
    component.minorAxis = [minorUnitX * currentMinorLength, minorUnitY * currentMinorLength];

    // Rebuild covariance matrix
    component.covariance = buildCovarianceFromAxes(component.majorAxis, component.minorAxis);
  }

  function handleMinorAxisDrag(mouseX: number, mouseY: number, componentIndex: number): void {
    const component = components[componentIndex];
    const [centerX, centerY] = component.mean;

    const VISUAL_SCALE = 0.6;

    // Calculate new minor axis vector (unscaled)
    const dx = (mouseX - centerX) / VISUAL_SCALE;
    const dy = (mouseY - centerY) / VISUAL_SCALE;
    const newMinorLength = Math.sqrt(dx * dx + dy * dy);

    if (newMinorLength < 0.01) {return;}

    // Get current major axis length
    const currentMajorLength = Math.sqrt(
      component.majorAxis[0] ** 2 + component.majorAxis[1] ** 2
    );

    // Normalize the new minor axis direction
    const minorUnitX = dx / newMinorLength;
    const minorUnitY = dy / newMinorLength;

    // Create perpendicular major axis (rotate minor axis -90 degrees)
    const majorUnitX = minorUnitY;
    const majorUnitY = -minorUnitX;

    // Update both axes
    component.majorAxis = [majorUnitX * currentMajorLength, majorUnitY * currentMajorLength];
    component.minorAxis = [minorUnitX * newMinorLength, minorUnitY * newMinorLength];

    // Rebuild covariance matrix
    component.covariance = buildCovarianceFromAxes(component.majorAxis, component.minorAxis);
  }

  leftCanvas.addEventListener('mousedown', (e) => {
    const [dataX, dataY] = getMousePosition(e);

    // Check for handle interaction if component is selected
    const handle = findNearestHandle(dataX, dataY);
    if (handle) {
      isDragging = true;
      selectedHandleType = handle.type;
      if (handle.type === 'center') {
        dragOffset = [dataX - handle.x, dataY - handle.y];
      }
      leftCanvas.style.cursor = 'grabbing';
      return;
    }

    // Check if clicking on any component
    for (let i = components.length - 1; i >= 0; i--) {
      if (isPointInEllipse(dataX, dataY, components[i])) {
        selectedComponentIndex = i;
        isDragging = true;
        selectedHandleType = 'center';
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
      if (selectedHandleType === 'center') {
        // Update component position
        components[selectedComponentIndex].mean = [dataX - dragOffset[0], dataY - dragOffset[1]];
      } else if (selectedHandleType?.startsWith('major') === true) {
        // Handle major axis dragging
        handleMajorAxisDrag(dataX, dataY, selectedComponentIndex);
      } else if (selectedHandleType?.startsWith('minor') === true) {
        // Handle minor axis dragging
        handleMinorAxisDrag(dataX, dataY, selectedComponentIndex);
      }
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
    selectedHandleType = null;
    leftCanvas.style.cursor = 'default';
  });

  leftCanvas.addEventListener('mouseleave', () => {
    isDragging = false;
    selectedHandleType = null;
    leftCanvas.style.cursor = 'default';
  });

  render();

  console.log('Marginal probability path initialized with TF.js');
}

run();

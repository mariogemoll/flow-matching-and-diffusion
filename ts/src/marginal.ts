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

  const addComponentBtn = el(document, '#addComponentBtn') as HTMLButtonElement;
  const controlColorPicker = el(document, '#controlColorPicker') as HTMLInputElement;
  const pdfColorPicker = el(document, '#pdfColorPicker') as HTMLInputElement;
  const controlColorValue = el(document, '#controlColorValue') as HTMLSpanElement;
  const pdfColorValue = el(document, '#pdfColorValue') as HTMLSpanElement;

  // Color state
  let controlColor = controlColorPicker.value;
  let pdfColor = pdfColorPicker.value;

  // Throttle state
  let renderTimeout: number | null = null;

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
    | 'weight-slider'
    | null = null;
  let showAllWeightSliders = false;
  let activeRemoveButton: {
    componentIndex: number; x: number; y: number; size: number
  } | null = null;

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
      : { r: 100, g: 150, b: 255 };
  }

  function getComponentColor(): string {
    const rgb = hexToRgb(controlColor);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
  }

  function getControlColorWithAlpha(alpha: number): string {
    const rgb = hexToRgb(controlColor);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
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

  function getMousePixelPosition(e: MouseEvent): [number, number] {
    const rect = leftCanvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
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

  function drawWeightSlider(componentIndex: number, isActive = true): void {
    const component = components[componentIndex];
    const [centerX, centerY] = component.mean;

    // Position slider above the component (in data space)
    const sliderYOffset = 1.0; // data space units above center
    const sliderWidthData = 1.2; // data space units

    const sliderCenterX = centerX;
    const sliderCenterY = centerY + sliderYOffset; // + because y-axis is inverted
    const sliderX = sliderCenterX - sliderWidthData / 2;

    // Convert to pixel space
    const sliderPixelX = xScale(sliderX);
    const sliderPixelY = yScale(sliderCenterY);
    const sliderPixelWidth = xScale(sliderX + sliderWidthData) - sliderPixelX;
    const sliderHeight = 6;

    leftCtx.save();

    // Draw slider background (more transparent for inactive sliders)
    leftCtx.fillStyle = isActive ? getControlColorWithAlpha(0.4) : getControlColorWithAlpha(0.3);
    leftCtx.fillRect(sliderPixelX - 10, sliderPixelY - 20, sliderPixelWidth + 20, 40);

    // Draw slider track
    leftCtx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)';
    leftCtx.fillRect(sliderPixelX, sliderPixelY, sliderPixelWidth, sliderHeight);

    // Draw slider fill
    const color = getComponentColor();
    leftCtx.fillStyle = color;
    leftCtx.globalAlpha = isActive ? 1.0 : 0.7;
    leftCtx.fillRect(
      sliderPixelX,
      sliderPixelY,
      sliderPixelWidth * component.weight,
      sliderHeight
    );

    // Draw slider handle (only for active slider)
    if (isActive) {
      const handleX = sliderPixelX + sliderPixelWidth * component.weight;
      leftCtx.globalAlpha = 1.0;
      leftCtx.fillStyle = 'white';
      leftCtx.strokeStyle = color;
      leftCtx.lineWidth = 2;
      leftCtx.beginPath();
      leftCtx.arc(handleX, sliderPixelY + sliderHeight / 2, 8, 0, 2 * Math.PI);
      leftCtx.fill();
      leftCtx.stroke();
    }

    // Draw weight text
    leftCtx.globalAlpha = isActive ? 1.0 : 0.8;
    leftCtx.fillStyle = 'white';
    leftCtx.font = '12px Arial';
    leftCtx.textAlign = 'center';
    leftCtx.fillText(
      `Weight: ${component.weight.toFixed(2)}`,
      xScale(sliderCenterX),
      sliderPixelY - 5
    );

    // Draw remove button (only for active slider and if more than 1 component)
    if (isActive && components.length > 1) {
      const removeSize = 22;
      const desiredX = sliderPixelX + sliderPixelWidth + 20;
      const clampedX = Math.min(desiredX, leftCanvas.width - removeSize - 10);
      const desiredY = sliderPixelY + sliderHeight / 2 - removeSize / 2;
      const clampedY = Math.max(20, Math.min(desiredY, leftCanvas.height - removeSize - 20));

      leftCtx.globalAlpha = 1.0;
      leftCtx.fillStyle = 'rgba(211, 47, 47, 0.9)';
      leftCtx.strokeStyle = 'white';
      leftCtx.lineWidth = 2;
      leftCtx.beginPath();
      leftCtx.rect(clampedX, clampedY, removeSize, removeSize);
      leftCtx.fill();
      leftCtx.stroke();

      leftCtx.beginPath();
      leftCtx.moveTo(clampedX + 6, clampedY + 6);
      leftCtx.lineTo(clampedX + removeSize - 6, clampedY + removeSize - 6);
      leftCtx.moveTo(clampedX + removeSize - 6, clampedY + 6);
      leftCtx.lineTo(clampedX + 6, clampedY + removeSize - 6);
      leftCtx.stroke();

      activeRemoveButton = { componentIndex, x: clampedX, y: clampedY, size: removeSize };
    }

    leftCtx.restore();
  }

  function drawAllWeightSliders(): void {
    for (let i = 0; i < components.length; i++) {
      const isActive = i === selectedComponentIndex;
      drawWeightSlider(i, isActive);
    }
  }

  function isPointInWeightSlider(
    dataX: number,
    dataY: number,
    componentIndex: number
  ): boolean {
    if (selectedComponentIndex !== componentIndex) {return false;}

    const component = components[componentIndex];
    const [centerX, centerY] = component.mean;

    const sliderYOffset = 1.0;
    const sliderWidthData = 1.2;

    const sliderCenterX = centerX;
    const sliderCenterY = centerY + sliderYOffset; // + because y-axis is inverted
    const sliderX = sliderCenterX - sliderWidthData / 2;

    // Check if point is within slider bounds (with some padding)
    const padding = 0.15;
    return (
      dataX >= sliderX - padding &&
      dataX <= sliderX + sliderWidthData + padding &&
      dataY >= sliderCenterY - padding &&
      dataY <= sliderCenterY + padding
    );
  }

  function handleWeightSliderDrag(mouseX: number, componentIndex: number): void {
    const component = components[componentIndex];
    const [centerX] = component.mean;

    const sliderWidthData = 1.2;
    const sliderX = centerX - sliderWidthData / 2;

    // Calculate new weight based on mouse position
    const relativeX = Math.max(0, Math.min(sliderWidthData, mouseX - sliderX));
    const newWeight = relativeX / sliderWidthData;

    // Update weight
    components[componentIndex].weight = newWeight;
    normalizeWeights();

    // Show all weight sliders when adjusting
    showAllWeightSliders = true;
  }

  function normalizeWeights(): void {
    const totalWeight = components.reduce((sum, comp) => sum + comp.weight, 0);
    if (totalWeight > 0) {
      components.forEach((comp) => {
        comp.weight /= totalWeight;
      });
    }
  }

  function getRemoveButtonHit(pixelX: number, pixelY: number): number {
    if (!activeRemoveButton) {return -1;}

    const { x, y, size, componentIndex } = activeRemoveButton;
    const withinBounds = pixelX >= x && pixelX <= x + size && pixelY >= y && pixelY <= y + size;

    if (!withinBounds) {return -1;}

    // Only allow removal of the currently selected component
    return componentIndex === selectedComponentIndex ? componentIndex : -1;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function createGaussianComponent(): ExtendedGaussianComponent {
    const index = components.length;
    const angle = (index % 6) * (Math.PI / 3);
    const ring = Math.floor(index / 6);
    const radius = 1.5 + ring * 0.5;

    const candidateX = Math.cos(angle) * radius;
    const candidateY = Math.sin(angle) * radius;

    const mean: [number, number] = [
      clamp(candidateX, xRange[0] + 0.8, xRange[1] - 0.8),
      clamp(candidateY, yRange[0] + 0.6, yRange[1] - 0.6)
    ];

    const component: ExtendedGaussianComponent = {
      mean,
      weight: 1 / (components.length + 1),
      majorAxis: [0.7, 0.2],
      minorAxis: [-0.2, 0.6],
      covariance: [[0, 0], [0, 0]]
    };

    component.covariance = buildCovarianceFromAxes(component.majorAxis, component.minorAxis);
    return component;
  }

  function addNewComponent(): void {
    const newComponent = createGaussianComponent();
    components.push(newComponent);
    normalizeWeights();
    showAllWeightSliders = false;
    selectedComponentIndex = components.length - 1;
    render();
  }

  function removeComponent(componentIndex: number): void {
    if (componentIndex < 0 || componentIndex >= components.length) {
      return;
    }

    if (components.length <= 1) {
      return;
    }

    components.splice(componentIndex, 1);
    normalizeWeights();
    showAllWeightSliders = false;
    activeRemoveButton = null;

    isDragging = false;
    selectedComponentIndex = -1;

    if (components.length > 0) {
      const nextIndex = Math.min(componentIndex, components.length - 1);
      selectedComponentIndex = nextIndex;
    }

    render();
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
    leftCtx.strokeStyle = getControlColorWithAlpha(0.5);
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

    // Draw weight slider (single slider when not showing all)
    if (!showAllWeightSliders) {
      drawWeightSlider(componentIndex, true);
    }

    // Draw handles
    const handleRadius = 6;
    const color = getComponentColor();
    leftCtx.fillStyle = color;
    leftCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
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
    activeRemoveButton = null;

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
      leftCanvas.height,
      pdfColor
    );
    drawGaussianContours(leftCtx, probabilityGrid, maxValue, leftCanvas.width, leftCanvas.height);

    // Add coordinate frames to both canvases
    addFrameUsingScales(leftCtx, xScale, yScale, 11);
    addFrameUsingScales(rightCtx, xScale, yScale, 11);

    // Draw component centers
    components.forEach((component, index) => {
      const pixelX = xScale(component.mean[0]);
      const pixelY = yScale(component.mean[1]);
      const radius = selectedComponentIndex === index ? 8 : 6;
      addDot(leftCtx, pixelX, pixelY, radius, 'rgba(255, 255, 255, 0.6)');
    });

    // Draw handles for selected component
    if (selectedComponentIndex >= 0) {
      drawHandles(selectedComponentIndex);
    }

    // Draw all weight sliders when weight is being adjusted
    if (showAllWeightSliders && selectedComponentIndex >= 0) {
      drawAllWeightSliders();
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
    const [pixelX, pixelY] = getMousePixelPosition(e);
    const [dataX, dataY] = getMousePosition(e);

    // Check for remove button click
    const removeHit = getRemoveButtonHit(pixelX, pixelY);
    if (removeHit >= 0) {
      removeComponent(removeHit);
      return;
    }

    // First check for weight slider interaction
    if (
      selectedComponentIndex >= 0 &&
      isPointInWeightSlider(dataX, dataY, selectedComponentIndex)
    ) {
      isDragging = true;
      selectedHandleType = 'weight-slider';
      dragOffset = [dataX, dataY];
      leftCanvas.style.cursor = 'grabbing';
      return;
    }

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
    showAllWeightSliders = false;
    render();
  });

  leftCanvas.addEventListener('mousemove', (e) => {
    const [dataX, dataY] = getMousePosition(e);

    if (isDragging && selectedComponentIndex >= 0) {
      if (selectedHandleType === 'center') {
        // Update component position
        components[selectedComponentIndex].mean = [dataX - dragOffset[0], dataY - dragOffset[1]];
      } else if (selectedHandleType === 'weight-slider') {
        // Handle weight slider dragging
        handleWeightSliderDrag(dataX, selectedComponentIndex);
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
    if (isDragging && selectedHandleType === 'weight-slider') {
      // Keep showing weight sliders briefly after weight adjustment
      setTimeout(() => {
        if (!isDragging) {
          showAllWeightSliders = false;
          render();
        }
      }, 1500); // Hide after 1.5 seconds
    }
    isDragging = false;
    selectedHandleType = null;
    leftCanvas.style.cursor = 'default';
  });

  leftCanvas.addEventListener('mouseleave', () => {
    isDragging = false;
    selectedHandleType = null;
    leftCanvas.style.cursor = 'default';
  });

  addComponentBtn.addEventListener('click', () => {
    addNewComponent();
  });

  controlColorPicker.addEventListener('input', () => {
    controlColor = controlColorPicker.value;
    controlColorValue.textContent = controlColor;

    // Throttle render updates
    if (renderTimeout !== null) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = window.setTimeout(() => {
      render();
      renderTimeout = null;
    }, 50); // 50ms throttle
  });

  pdfColorPicker.addEventListener('input', () => {
    pdfColor = pdfColorPicker.value;
    pdfColorValue.textContent = pdfColor;

    // Throttle render updates
    if (renderTimeout !== null) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = window.setTimeout(() => {
      render();
      renderTimeout = null;
    }, 50); // 50ms throttle
  });

  render();

  console.log('Marginal probability path initialized with TF.js');
}

run();

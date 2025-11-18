import { addDot, addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { removePlaceholder } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import { viridis } from './color-maps';
import { NUM_SAMPLES, SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';
import { drawGaussianContours, drawGaussianMixturePDF, type GaussianComponent } from './gaussian';
import { computeGaussianMixtureTfjs, computeGaussianPdfTfjs } from './gaussian-tf';
import {
  makeCircularCircularScheduler,
  makeConstantVarianceScheduler,
  makeInverseSqrtNoiseScheduler,
  makeLinearNoiseScheduler,
  makeSqrtNoiseScheduler,
  makeSqrtSqrtScheduler,
  type NoiseScheduler
} from './math/noise-scheduler';
import { renderSchedulerPlot } from './widgets/plot-renderers';

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

interface ExtendedGaussianComponent extends GaussianComponent {
  majorAxis: [number, number]; // In data space
  minorAxis: [number, number]; // In data space
}

export function initMarginalProbPathAndVectorFieldWidget(container: HTMLElement): void {
  removePlaceholder(container);
  // Create main layout structure
  const mainDiv = document.createElement('div');
  mainDiv.style.display = 'flex';
  mainDiv.style.gap = '20px';
  container.appendChild(mainDiv);

  // Left canvas section
  const leftSection = document.createElement('div');
  mainDiv.appendChild(leftSection);

  const leftCanvas = document.createElement('canvas');
  leftCanvas.width = 480;
  leftCanvas.height = 350;
  leftCanvas.style.width = '480px';
  leftCanvas.style.height = '350px';
  leftCanvas.style.border = '1px solid #ccc';
  leftSection.appendChild(leftCanvas);
  const leftCtx = getContext(leftCanvas);

  const leftControls = document.createElement('div');
  leftSection.appendChild(leftControls);

  const sampleBtn = document.createElement('button');
  sampleBtn.textContent = 'Sample';
  sampleBtn.style.marginLeft = '0';
  leftControls.appendChild(sampleBtn);

  const addComponentBtn = document.createElement('button');
  addComponentBtn.textContent = 'Add Component';
  leftControls.appendChild(addComponentBtn);

  // Color controls below left canvas
  const leftColorControls = document.createElement('div');
  leftColorControls.style.marginTop = '8px';
  leftColorControls.style.display = 'flex';
  leftColorControls.style.gap = '8px';
  leftColorControls.style.alignItems = 'center';
  leftSection.appendChild(leftColorControls);

  const controlColorLabel = document.createElement('label');
  controlColorLabel.textContent = 'Control:';
  controlColorLabel.style.fontSize = '12px';
  leftColorControls.appendChild(controlColorLabel);

  const controlColorPicker = document.createElement('input');
  controlColorPicker.type = 'color';
  controlColorPicker.value = '#6496ff';
  leftColorControls.appendChild(controlColorPicker);

  const controlColorValue = document.createElement('span');
  controlColorValue.textContent = '#6496ff';
  controlColorValue.style.fontFamily = 'monospace';
  controlColorValue.style.fontSize = '12px';
  leftColorControls.appendChild(controlColorValue);

  const pdfColorLabel = document.createElement('label');
  pdfColorLabel.textContent = 'PDF:';
  pdfColorLabel.style.fontSize = '12px';
  pdfColorLabel.style.marginLeft = '8px';
  leftColorControls.appendChild(pdfColorLabel);

  const pdfColorPicker = document.createElement('input');
  pdfColorPicker.type = 'color';
  pdfColorPicker.value = '#c850c8';
  leftColorControls.appendChild(pdfColorPicker);

  const pdfColorValue = document.createElement('span');
  pdfColorValue.textContent = '#c850c8';
  pdfColorValue.style.fontFamily = 'monospace';
  pdfColorValue.style.fontSize = '12px';
  leftColorControls.appendChild(pdfColorValue);

  // Right canvas section
  const rightSection = document.createElement('div');
  mainDiv.appendChild(rightSection);

  const rightCanvas = document.createElement('canvas');
  rightCanvas.width = 480;
  rightCanvas.height = 350;
  rightCanvas.style.width = '480px';
  rightCanvas.style.height = '350px';
  rightCanvas.style.border = '1px solid #ccc';
  rightSection.appendChild(rightCanvas);
  const rightCtx = getContext(rightCanvas);

  const rightControls = document.createElement('div');
  rightSection.appendChild(rightControls);

  const sampleBtnRight = document.createElement('button');
  sampleBtnRight.textContent = 'Sample';
  sampleBtnRight.style.marginLeft = '0';
  rightControls.appendChild(sampleBtnRight);

  const clearBtnRight = document.createElement('button');
  clearBtnRight.textContent = 'Clear';
  rightControls.appendChild(clearBtnRight);

  // Plot canvases section
  const plotSection = document.createElement('div');
  plotSection.style.display = 'flex';
  plotSection.style.flexDirection = 'column';
  plotSection.style.gap = '10px';
  mainDiv.appendChild(plotSection);

  const schedulerPlotCanvas = document.createElement('canvas');
  schedulerPlotCanvas.width = 160;
  schedulerPlotCanvas.height = 160;
  schedulerPlotCanvas.style.width = '160px';
  schedulerPlotCanvas.style.height = '160px';
  schedulerPlotCanvas.style.border = '1px solid #ccc';
  plotSection.appendChild(schedulerPlotCanvas);

  // Weight summary between chart and radio buttons
  const weightSummary = document.createElement('span');
  weightSummary.textContent = 'α_t = 0.00, β_t = 1.00';
  weightSummary.style.fontSize = '12px';
  weightSummary.style.textAlign = 'center';
  plotSection.appendChild(weightSummary);

  // Scheduler radio buttons
  const schedulerRadiosContainer = document.createElement('div');
  schedulerRadiosContainer.style.display = 'flex';
  schedulerRadiosContainer.style.flexDirection = 'column';
  schedulerRadiosContainer.style.gap = '4px';
  schedulerRadiosContainer.style.fontSize = '12px';
  plotSection.appendChild(schedulerRadiosContainer);

  const schedulers = [
    { value: 'linear', label: 'α=t, β=1-t' },
    { value: 'sqrt', label: 'α=t, β=√(1-t)' },
    { value: 'inverse-sqrt', label: 'α=t, β=1-t²' },
    { value: 'constant', label: 'α=t, β=√(1-t²)', checked: true },
    { value: 'sqrt-sqrt', label: 'α=√t, β=√(1-t)' },
    { value: 'circular-circular', label: 'α=sin(πt/2), β=cos(πt/2)' }
  ];

  const schedulerRadios: HTMLInputElement[] = [];
  schedulers.forEach(({ value, label, checked }) => {
    const radioLabel = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'marginal-scheduler';
    radio.value = value;
    if (checked === true) { radio.checked = true; }
    schedulerRadios.push(radio);
    radioLabel.appendChild(radio);
    radioLabel.appendChild(document.createTextNode(` ${label}`));
    schedulerRadiosContainer.appendChild(radioLabel);
  });

  // Bottom controls
  const bottomControls = document.createElement('div');
  bottomControls.className = 'bottom-controls';
  bottomControls.style.display = 'flex';
  bottomControls.style.justifyContent = 'center';
  bottomControls.style.alignItems = 'center';
  bottomControls.style.gap = '8px';
  bottomControls.style.marginTop = '16px';
  container.appendChild(bottomControls);

  const playBtn = document.createElement('button');
  playBtn.textContent = 'Play';
  playBtn.style.width = '60px';
  bottomControls.appendChild(playBtn);

  const timeLabel = document.createElement('label');
  timeLabel.textContent = 't = ';
  bottomControls.appendChild(timeLabel);

  const timeValue = document.createElement('span');
  timeValue.textContent = '0.00';
  timeLabel.appendChild(timeValue);

  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.min = '0';
  timeSlider.max = '1';
  timeSlider.step = '0.001';
  timeSlider.value = '0';
  timeSlider.style.width = '320px';
  bottomControls.appendChild(timeSlider);

  // Color state
  let controlColor = controlColorPicker.value;
  let pdfColor = pdfColorPicker.value;

  // Throttle state
  let renderTimeout: number | null = null;

  // Animation state
  let t = 0;
  let isPlaying = false;
  let animationFrameId: number | null = null;
  let lastTimestamp: number | null = null;
  let scheduler: NoiseScheduler = makeConstantVarianceScheduler();

  // Sample state
  let sampledPoints: { x: number; y: number }[] = [];
  let rightInitialSamples: [number, number][] = [];
  let rightCurrentSamples: [number, number][] = [];
  let lastPropagationTime = 0;

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

  // Compute vector field for a batch of samples (simple CPU version for speed)
  function computeMarginalVectorFieldBatch(
    samplesTensor: ReturnType<typeof tf.tensor2d>,
    components: GaussianComponent[],
    alpha: number,
    beta: number,
    alphaDot: number,
    betaDot: number
  ): ReturnType<typeof tf.tensor2d> {
    // For small batches, CPU computation is actually faster
    const samplesData = samplesTensor.arraySync();
    const velocities: number[][] = [];

    for (const [x, y] of samplesData) {
      const [ux, uy] = computeMarginalVectorField(
        x,
        y,
        components,
        alpha,
        beta,
        alphaDot,
        betaDot
      );
      velocities.push([ux, uy]);
    }

    return tf.tensor2d(velocities);
  }

  // Update sample positions using Euler method with TF.js
  // Propagates from lastPropagationTime to currentT
  function updateMarginalSamples(currentT: number): void {
    if (rightCurrentSamples.length === 0) {
      return;
    }

    // If we're going backward or jumping, reset from initial samples
    if (currentT < lastPropagationTime || Math.abs(currentT - lastPropagationTime) > 0.1) {
      rightCurrentSamples = rightInitialSamples.map(([x, y]) => [x, y]);
      lastPropagationTime = 0;
    }

    const dt = currentT - lastPropagationTime;
    if (Math.abs(dt) < 1e-6) {
      return;
    }

    // Use multiple Euler steps for better accuracy
    // Reduce steps to 20 per unit time for better performance
    const numSteps = Math.max(1, Math.ceil(Math.abs(dt) * 20));
    const stepSize = dt / numSteps;

    // Do all the Euler steps inside a single tf.tidy to reuse memory
    const newSamplesArray = tf.tidy(() => {
      let samplesTensor: ReturnType<typeof tf.tensor2d> = tf.tensor2d(rightCurrentSamples);

      for (let step = 0; step < numSteps; step++) {
        const stepT = lastPropagationTime + (step + 0.5) * stepSize;
        const alpha = scheduler.getAlpha(stepT);
        const beta = scheduler.getBeta(stepT);
        const alphaDot = getAlphaDerivative(scheduler, stepT);
        const betaDot = getBetaDerivative(scheduler, stepT);

        // Compute vector field for all samples at once
        const velocities = computeMarginalVectorFieldBatch(
          samplesTensor,
          components,
          alpha,
          beta,
          alphaDot,
          betaDot
        );

        // Update: x_{n+1} = x_n + dt * u_t(x_n)
        const updated = samplesTensor.add(velocities.mul(stepSize));
        samplesTensor = updated as ReturnType<typeof tf.tensor2d>;
      }

      // Convert back to array before leaving tidy
      return samplesTensor.arraySync();
    });

    rightCurrentSamples = newSamplesArray.map(([x, y]) => [x, y]);
    lastPropagationTime = currentT;
  }

  // Get the current sample positions in pixel coordinates
  function getCurrentSamplePixels(): { x: number; y: number }[] {
    return rightCurrentSamples.map(([x, y]) => ({ x: xScale(x), y: yScale(y) }));
  }

  // Sample from a 2D Gaussian mixture
  function sampleFromGaussianMixture(
    count: number,
    components: ExtendedGaussianComponent[]
  ): [number, number][] {
    const samples: [number, number][] = [];

    // Normalize weights
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    const normalizedWeights = components.map((c) => c.weight / totalWeight);

    // Sample component indices according to weights
    for (let i = 0; i < count; i++) {
      // Choose component according to weight
      const rand = Math.random();
      let cumulative = 0;
      let componentIndex = 0;
      for (let k = 0; k < components.length; k++) {
        cumulative += normalizedWeights[k];
        if (rand <= cumulative) {
          componentIndex = k;
          break;
        }
      }

      const component = components[componentIndex];
      const [meanX, meanY] = component.mean;
      const [[covXX], [covYX, covYY]] = component.covariance;

      // Cholesky decomposition for sampling: Σ = L L^T
      // For 2D: L = [[sqrt(a), 0], [b/sqrt(a), sqrt(d - b²/a)]]
      const L11 = Math.sqrt(Math.max(0, covXX));
      const L21 = L11 > 1e-10 ? covYX / L11 : 0;
      const L22 = Math.sqrt(Math.max(0, covYY - L21 * L21));

      // Sample from standard normal
      const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
      const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

      // Transform: x = μ + L z
      const x = meanX + L11 * z1;
      const y = meanY + L21 * z1 + L22 * z2;

      samples.push([x, y]);
    }

    return samples;
  }

  function render(): void {
    // Clear both canvases
    leftCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
    activeRemoveButton = null;

    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);

    // Compute and render the marginal path PDF on left canvas
    // The transformation is done inside computeGaussianMixtureTfjs for efficiency
    const { probabilityGrid, maxValue } = computeGaussianMixtureTfjs(
      xScale,
      yScale,
      components,
      leftCanvas.width,
      leftCanvas.height,
      alpha,
      beta
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

    // Add coordinate frame to left canvas
    addFrameUsingScales(leftCtx, xScale, yScale, 11);

    // Draw sampled points on left canvas
    if (sampledPoints.length > 0) {
      leftCtx.save();
      leftCtx.fillStyle = SAMPLED_POINT_COLOR;
      for (const point of sampledPoints) {
        leftCtx.beginPath();
        leftCtx.arc(point.x, point.y, SAMPLED_POINT_RADIUS, 0, 2 * Math.PI);
        leftCtx.fill();
      }
      leftCtx.restore();
    }

    // Draw standard normal PDF at t=0 on right canvas
    if (Math.abs(t) < 0.01) {
      const result = computeGaussianPdfTfjs(
        rightCanvas,
        rightCtx,
        xScale,
        yScale,
        0,
        0,
        1,
        false
      );
      rightCtx.putImageData(result.imageData, 0, 0);
    }

    // Draw marginal vector field on right canvas
    drawMarginalVectorField(rightCtx, xScale, yScale, components, t, scheduler);

    // Add coordinate frame to right canvas
    addFrameUsingScales(rightCtx, xScale, yScale, 11);

    // Update and draw sampled points on right canvas
    if (rightCurrentSamples.length > 0) {
      updateMarginalSamples(t);
      const currentPoints = getCurrentSamplePixels();
      rightCtx.save();
      rightCtx.fillStyle = SAMPLED_POINT_COLOR;
      for (const point of currentPoints) {
        rightCtx.beginPath();
        rightCtx.arc(point.x, point.y, SAMPLED_POINT_RADIUS, 0, 2 * Math.PI);
        rightCtx.fill();
      }
      rightCtx.restore();
    }

    // Only draw data controls when t = 1
    if (Math.abs(t - 1) < 0.01) {
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

    // Update time display and weights
    timeValue.textContent = t.toFixed(2);
    const summaryParts = [`α_t = ${alpha.toFixed(2)}`, `β_t = ${beta.toFixed(2)}`];
    weightSummary.textContent = summaryParts.join(', ');

    // Update scheduler plot
    renderSchedulerPlot(schedulerPlotCanvas, scheduler, t, 'Scheduler');
  }

  function drawMarginalVectorField(
    ctx: CanvasRenderingContext2D,
    xScale: ReturnType<typeof makeScale>,
    yScale: ReturnType<typeof makeScale>,
    components: GaussianComponent[],
    t: number,
    scheduler: NoiseScheduler
  ): void {
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);

    // Get scheduler derivatives
    const alphaDot = getAlphaDerivative(scheduler, t);
    const betaDot = getBetaDerivative(scheduler, t);

    const gridSize = 20;
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const dx = (xMax - xMin) / gridSize;
    const dy = (yMax - yMin) / gridSize;

    // Find max vector length for normalization
    let maxLength = 0;
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const [vx, vy] = computeMarginalVectorField(
          x,
          y,
          components,
          alpha,
          beta,
          alphaDot,
          betaDot
        );
        const length = Math.sqrt(vx * vx + vy * vy);
        maxLength = Math.max(maxLength, length);
      }
    }

    // Draw vector field
    const arrowScale = Math.min(dx, dy) * 0.4;
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const [vx, vy] = computeMarginalVectorField(
          x,
          y,
          components,
          alpha,
          beta,
          alphaDot,
          betaDot
        );

        const length = Math.sqrt(vx * vx + vy * vy);
        if (length < 1e-6) {
          continue;
        }

        const normalizedLength = length / (maxLength + 1e-10);
        const colorValue = Math.min(1, normalizedLength);
        const color = viridis(colorValue);

        const scale = arrowScale / (maxLength + 1e-10);
        const endX = x + vx * scale;
        const endY = y + vy * scale;

        drawArrow(ctx, xScale, yScale, x, y, endX, endY, color);
      }
    }
  }

  function computeMarginalVectorField(
    x: number,
    y: number,
    components: GaussianComponent[],
    alpha: number,
    beta: number,
    alphaDot: number,
    betaDot: number
  ): [number, number] {
    // Compute posterior weights γ_k(x,t) = π_k N(x; α_t μ_k, α_t² Σ_k + β_t² I) / p_t(x)
    const gammas: number[] = [];
    let totalProb = 0;

    const alpha2 = alpha * alpha;
    const beta2 = beta * beta;

    for (const comp of components) {
      const [muX, muY] = comp.mean;
      const [[covXX, covXY], [, covYY]] = comp.covariance;

      // Transformed parameters
      const meanX = alpha * muX;
      const meanY = alpha * muY;
      const sigmaXX = alpha2 * covXX + beta2;
      const sigmaXY = alpha2 * covXY;
      const sigmaYY = alpha2 * covYY + beta2;

      // Compute Gaussian PDF
      const det = sigmaXX * sigmaYY - sigmaXY * sigmaXY;
      if (det <= 1e-10) {
        gammas.push(0);
        continue;
      }

      const invXX = sigmaYY / det;
      const invXY = -sigmaXY / det;
      const invYY = sigmaXX / det;

      const dx = x - meanX;
      const dy = y - meanY;

      const quadForm = dx * (invXX * dx + invXY * dy) + dy * (invXY * dx + invYY * dy);
      const normalization = 1 / (2 * Math.PI * Math.sqrt(det));
      const prob = comp.weight * normalization * Math.exp(-0.5 * quadForm);

      gammas.push(prob);
      totalProb += prob;
    }

    // Normalize gammas
    if (totalProb < 1e-10) {
      return [0, 0];
    }

    for (let k = 0; k < gammas.length; k++) {
      gammas[k] /= totalProb;
    }

    // Compute vector field: u_t(x) = (β̇_t/β_t) x + (α̇_t - (β̇_t/β_t) α_t) Σ_k γ_k(x,t) [...]
    const betaRatio = beta > 1e-10 ? betaDot / beta : 0;
    const coeff = alphaDot - betaRatio * alpha;

    let ux = betaRatio * x;
    let uy = betaRatio * y;

    for (let k = 0; k < components.length; k++) {
      const comp = components[k];
      const [muX, muY] = comp.mean;
      const [[covXX, covXY], [, covYY]] = comp.covariance;

      const alpha2 = alpha * alpha;
      const beta2 = beta * beta;

      // Σ_t = α_t² Σ_k + β_t² I
      const sigmaXX = alpha2 * covXX + beta2;
      const sigmaXY = alpha2 * covXY;
      const sigmaYY = alpha2 * covYY + beta2;

      // Inverse of Σ_t
      const det = sigmaXX * sigmaYY - sigmaXY * sigmaXY;
      if (det <= 1e-10) {continue;}

      const invXX = sigmaYY / det;
      const invXY = -sigmaXY / det;
      const invYY = sigmaXX / det;

      // (x - α_t μ_k)
      const dx = x - alpha * muX;
      const dy = y - alpha * muY;

      // α_t Σ_k (α_t² Σ_k + β_t² I)^{-1} (x - α_t μ_k)
      const termX = alpha * (covXX * (invXX * dx + invXY * dy) + covXY * (invXY * dx + invYY * dy));
      const termY = alpha * (covXY * (invXX * dx + invXY * dy) + covYY * (invXY * dx + invYY * dy));

      // μ_k + α_t Σ_k (...)^{-1} (...)
      const targetX = muX + termX;
      const targetY = muY + termY;

      ux += coeff * gammas[k] * targetX;
      uy += coeff * gammas[k] * targetY;
    }

    return [ux, uy];
  }

  function getAlphaDerivative(scheduler: NoiseScheduler, t: number): number {
    const dt = 1e-5;
    const alpha1 = scheduler.getAlpha(Math.max(0, t - dt));
    const alpha2 = scheduler.getAlpha(Math.min(1, t + dt));
    return (alpha2 - alpha1) / (2 * dt);
  }

  function getBetaDerivative(scheduler: NoiseScheduler, t: number): number {
    const dt = 1e-5;
    const beta1 = scheduler.getBeta(Math.max(0, t - dt));
    const beta2 = scheduler.getBeta(Math.min(1, t + dt));
    return (beta2 - beta1) / (2 * dt);
  }

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    xScale: ReturnType<typeof makeScale>,
    yScale: ReturnType<typeof makeScale>,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string
  ): void {
    const px1 = xScale(x1);
    const py1 = yScale(y1);
    const px2 = xScale(x2);
    const py2 = yScale(y2);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    // Draw line
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(py2 - py1, px2 - px1);
    const headLength = 5;

    ctx.beginPath();
    ctx.moveTo(px2, py2);
    ctx.lineTo(
      px2 - headLength * Math.cos(angle - Math.PI / 6),
      py2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      px2 - headLength * Math.cos(angle + Math.PI / 6),
      py2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
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
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }

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

  const stopAnimation = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isPlaying = false;
    lastTimestamp = null;
    playBtn.textContent = 'Play';
  };

  const stepAnimation = (timestamp: number): void => {
    if (!isPlaying) {
      return;
    }

    const previousTimestamp = lastTimestamp ?? timestamp;
    lastTimestamp = timestamp;
    const delta = timestamp - previousTimestamp;
    const durationMs = 4000;
    t += delta / durationMs;

    if (t >= 1) {
      t = 1;
      timeSlider.value = t.toFixed(3);
      render();
      stopAnimation();
      return;
    }

    timeSlider.value = t.toFixed(3);
    render();
    animationFrameId = requestAnimationFrame(stepAnimation);
  };

  const startAnimation = (): void => {
    if (isPlaying) {
      return;
    }
    sampledPoints = [];
    isPlaying = true;
    playBtn.textContent = 'Pause';
    animationFrameId = requestAnimationFrame(stepAnimation);
  };

  timeSlider.addEventListener('input', () => {
    if (isPlaying) {
      stopAnimation();
    }
    sampledPoints = [];
    t = Math.max(0, Math.min(1, Number.parseFloat(timeSlider.value)));
    render();
  });

  playBtn.addEventListener('click', () => {
    if (isPlaying) {
      stopAnimation();
      return;
    }
    if (t >= 1) {
      t = 0;
      timeSlider.value = t.toFixed(3);
      render();
    }
    startAnimation();
  });

  sampleBtn.addEventListener('click', () => {
    // Sample from the data distribution (t=1)
    const dataSamples = sampleFromGaussianMixture(NUM_SAMPLES, components);

    // Apply marginal path transformation to get samples at current time t
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);

    sampledPoints = [];
    for (const [dataX, dataY] of dataSamples) {
      // Apply conditional path: X_t | X_1 ~ N(α_t X_1, β_t² I)
      const conditionalMeanX = alpha * dataX;
      const conditionalMeanY = alpha * dataY;
      const conditionalStdDev = beta;

      // Sample from conditional distribution
      const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
      const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

      const sampleX = conditionalMeanX + conditionalStdDev * z1;
      const sampleY = conditionalMeanY + conditionalStdDev * z2;

      sampledPoints.push({ x: xScale(sampleX), y: yScale(sampleY) });
    }

    render();
  });

  sampleBtnRight.addEventListener('click', () => {
    if (Math.abs(t) >= 0.01) {
      return;
    }

    // Sample from standard normal at t=0
    const samples = tf.randomNormal([NUM_SAMPLES, 2], 0, 1);
    const flat = samples.dataSync() as Float32Array;

    rightInitialSamples = [];
    rightCurrentSamples = [];
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const sx = flat[2 * i];
      const sy = flat[2 * i + 1];
      rightInitialSamples.push([sx, sy]);
      rightCurrentSamples.push([sx, sy]);
    }

    lastPropagationTime = 0;
    samples.dispose();
    render();
  });

  clearBtnRight.addEventListener('click', () => {
    rightInitialSamples = [];
    rightCurrentSamples = [];
    lastPropagationTime = 0;
    render();
  });

  schedulerRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        if (radio.value === 'linear') {
          scheduler = makeLinearNoiseScheduler();
        } else if (radio.value === 'sqrt') {
          scheduler = makeSqrtNoiseScheduler();
        } else if (radio.value === 'inverse-sqrt') {
          scheduler = makeInverseSqrtNoiseScheduler();
        } else if (radio.value === 'constant') {
          scheduler = makeConstantVarianceScheduler();
        } else if (radio.value === 'sqrt-sqrt') {
          scheduler = makeSqrtSqrtScheduler();
        } else if (radio.value === 'circular-circular') {
          scheduler = makeCircularCircularScheduler();
        }
        render();
      }
    });
  });

  render();

  console.log('Marginal probability path initialized with TF.js');
}

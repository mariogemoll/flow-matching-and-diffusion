import { addDot, addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { makeScale } from 'web-ui-common/util';

import { SAMPLED_POINT_COLOR, SAMPLED_POINT_RADIUS } from './constants';

const NUM_SAMPLES = 1024;
import { drawGaussianContours, drawGaussianMixturePDF, type GaussianComponent } from './gaussian';
import { computeGaussianMixtureTfjs } from './gaussian-tf';
import type { NoiseScheduler } from './math/noise-scheduler';

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 350;

interface ExtendedGaussianComponent extends GaussianComponent {
  majorAxis: [number, number]; // In data space
  minorAxis: [number, number]; // In data space
}

export function initMarginalProbPathView(
  container: HTMLElement,
  initialComponents: ExtendedGaussianComponent[],
  initialTime: number,
  scheduler: NoiseScheduler,
  onComponentsChange: (components: ExtendedGaussianComponent[]) => void
): (components: ExtendedGaussianComponent[], time: number, scheduler: NoiseScheduler) => void {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  canvas.style.border = '1px solid #ccc';
  container.appendChild(canvas);
  const ctx = getContext(canvas);

  const controls = document.createElement('div');
  container.appendChild(controls);

  const sampleBtn = document.createElement('button');
  sampleBtn.textContent = 'Sample';
  sampleBtn.style.marginLeft = '0';
  controls.appendChild(sampleBtn);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  controls.appendChild(clearBtn);

  // Create sample continuously checkbox
  const sampleContinuouslyLabel = document.createElement('label');
  sampleContinuouslyLabel.style.marginLeft = '12px';
  const sampleContinuouslyCheckbox = document.createElement('input');
  sampleContinuouslyCheckbox.type = 'checkbox';
  sampleContinuouslyCheckbox.checked = true;
  sampleContinuouslyLabel.appendChild(sampleContinuouslyCheckbox);
  sampleContinuouslyLabel.appendChild(document.createTextNode(' Sample continuously'));
  controls.appendChild(sampleContinuouslyLabel);

  const addComponentBtn = document.createElement('button');
  addComponentBtn.textContent = 'Add Component';
  addComponentBtn.disabled = initialTime <= 0.99;
  controls.appendChild(addComponentBtn);

  // Color controls
  const colorControls = document.createElement('div');
  colorControls.style.marginTop = '8px';
  colorControls.style.display = 'none'; // Hidden for now
  colorControls.style.gap = '8px';
  colorControls.style.alignItems = 'center';
  container.appendChild(colorControls);

  const controlColorLabel = document.createElement('label');
  controlColorLabel.textContent = 'Control:';
  controlColorLabel.style.fontSize = '12px';
  colorControls.appendChild(controlColorLabel);

  const controlColorPicker = document.createElement('input');
  controlColorPicker.type = 'color';
  controlColorPicker.value = '#6496ff';
  colorControls.appendChild(controlColorPicker);

  const controlColorValue = document.createElement('span');
  controlColorValue.textContent = '#6496ff';
  controlColorValue.style.fontFamily = 'monospace';
  controlColorValue.style.fontSize = '12px';
  colorControls.appendChild(controlColorValue);

  const pdfColorLabel = document.createElement('label');
  pdfColorLabel.textContent = 'PDF:';
  pdfColorLabel.style.fontSize = '12px';
  pdfColorLabel.style.marginLeft = '8px';
  colorControls.appendChild(pdfColorLabel);

  const pdfColorPicker = document.createElement('input');
  pdfColorPicker.type = 'color';
  pdfColorPicker.value = '#c850c8';
  colorControls.appendChild(pdfColorPicker);

  const pdfColorValue = document.createElement('span');
  pdfColorValue.textContent = '#c850c8';
  pdfColorValue.style.fontFamily = 'monospace';
  pdfColorValue.style.fontSize = '12px';
  colorControls.appendChild(pdfColorValue);

  // State
  let components = initialComponents;
  let currentTime = initialTime;
  let currentScheduler = scheduler;
  let controlColor = controlColorPicker.value;
  let pdfColor = pdfColorPicker.value;
  let renderTimeout: number | null = null;
  let sampledPoints: { x: number; y: number }[] = [];

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

  // Define coordinate system
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, CANVAS_WIDTH - margins.right]);
  const yScale = makeScale(yRange, [CANVAS_HEIGHT - margins.bottom, margins.top]);

  // Helper functions
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
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    return [xScale.inverse(pixelX), yScale.inverse(pixelY)];
  }

  function getMousePixelPosition(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
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

    const sliderYOffset = 1.0;
    const sliderWidthData = 1.2;

    const sliderCenterX = centerX;
    const sliderCenterY = centerY + sliderYOffset;
    const sliderX = sliderCenterX - sliderWidthData / 2;

    const sliderPixelX = xScale(sliderX);
    const sliderPixelY = yScale(sliderCenterY);
    const sliderPixelWidth = xScale(sliderX + sliderWidthData) - sliderPixelX;
    const sliderHeight = 6;

    ctx.save();

    ctx.fillStyle = isActive ? getControlColorWithAlpha(0.4) : getControlColorWithAlpha(0.3);
    ctx.fillRect(sliderPixelX - 10, sliderPixelY - 20, sliderPixelWidth + 20, 40);

    ctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(sliderPixelX, sliderPixelY, sliderPixelWidth, sliderHeight);

    const color = getComponentColor();
    ctx.fillStyle = color;
    ctx.globalAlpha = isActive ? 1.0 : 0.7;
    ctx.fillRect(
      sliderPixelX,
      sliderPixelY,
      sliderPixelWidth * component.weight,
      sliderHeight
    );

    if (isActive) {
      const handleX = sliderPixelX + sliderPixelWidth * component.weight;
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(handleX, sliderPixelY + sliderHeight / 2, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = isActive ? 1.0 : 0.8;
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Weight: ${component.weight.toFixed(2)}`,
      xScale(sliderCenterX),
      sliderPixelY - 5
    );

    if (isActive && components.length > 1) {
      const removeSize = 22;
      const desiredX = sliderPixelX + sliderPixelWidth + 20;
      const clampedX = Math.min(desiredX, CANVAS_WIDTH - removeSize - 10);
      const desiredY = sliderPixelY + sliderHeight / 2 - removeSize / 2;
      const clampedY = Math.max(20, Math.min(desiredY, CANVAS_HEIGHT - removeSize - 20));

      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'rgba(211, 47, 47, 0.9)';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(clampedX, clampedY, removeSize, removeSize);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(clampedX + 6, clampedY + 6);
      ctx.lineTo(clampedX + removeSize - 6, clampedY + removeSize - 6);
      ctx.moveTo(clampedX + removeSize - 6, clampedY + 6);
      ctx.lineTo(clampedX + 6, clampedY + removeSize - 6);
      ctx.stroke();

      activeRemoveButton = { componentIndex, x: clampedX, y: clampedY, size: removeSize };
    }

    ctx.restore();
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
    const sliderCenterY = centerY + sliderYOffset;
    const sliderX = sliderCenterX - sliderWidthData / 2;

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

    const relativeX = Math.max(0, Math.min(sliderWidthData, mouseX - sliderX));
    const newWeight = relativeX / sliderWidthData;

    components[componentIndex].weight = newWeight;
    normalizeWeights();

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
    onComponentsChange(components);
    resampleIfNeeded();
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

    onComponentsChange(components);
    resampleIfNeeded();
    render();
  }

  function drawHandles(componentIndex: number): void {
    if (selectedComponentIndex !== componentIndex) {return;}

    const component = components[componentIndex];

    const [centerX, centerY] = component.mean;
    const centerPixelX = xScale(centerX);
    const centerPixelY = yScale(centerY);

    const VISUAL_SCALE = 0.6;
    const majorPixelX = xScale(centerX + component.majorAxis[0] * VISUAL_SCALE);
    const majorPixelY = yScale(centerY + component.majorAxis[1] * VISUAL_SCALE);
    const minorPixelX = xScale(centerX + component.minorAxis[0] * VISUAL_SCALE);
    const minorPixelY = yScale(centerY + component.minorAxis[1] * VISUAL_SCALE);

    ctx.save();

    ctx.strokeStyle = getControlColorWithAlpha(0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(2 * centerPixelX - majorPixelX, 2 * centerPixelY - majorPixelY);
    ctx.lineTo(majorPixelX, majorPixelY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2 * centerPixelX - minorPixelX, 2 * centerPixelY - minorPixelY);
    ctx.lineTo(minorPixelX, minorPixelY);
    ctx.stroke();

    ctx.setLineDash([]);

    if (!showAllWeightSliders) {
      drawWeightSlider(componentIndex, true);
    }

    const handleRadius = 6;
    const color = getComponentColor();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(centerPixelX, centerPixelY, handleRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(majorPixelX, majorPixelY, handleRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      2 * centerPixelX - majorPixelX,
      2 * centerPixelY - majorPixelY,
      handleRadius,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(minorPixelX, minorPixelY, handleRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      2 * centerPixelX - minorPixelX,
      2 * centerPixelY - minorPixelY,
      handleRadius,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function resampleIfNeeded(): void {
    if (!sampleContinuouslyCheckbox.checked) {
      sampledPoints = [];
      return;
    }

    const dataSamples = sampleFromGaussianMixture(NUM_SAMPLES, components);
    const alpha = currentScheduler.getAlpha(currentTime);
    const beta = currentScheduler.getBeta(currentTime);

    sampledPoints = [];
    for (const [dataX, dataY] of dataSamples) {
      const conditionalMeanX = alpha * dataX;
      const conditionalMeanY = alpha * dataY;
      const conditionalStdDev = beta;

      const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
      const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

      const sampleX = conditionalMeanX + conditionalStdDev * z1;
      const sampleY = conditionalMeanY + conditionalStdDev * z2;

      sampledPoints.push({ x: xScale(sampleX), y: yScale(sampleY) });
    }
  }

  function sampleFromGaussianMixture(
    count: number,
    components: ExtendedGaussianComponent[]
  ): [number, number][] {
    const samples: [number, number][] = [];

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    const normalizedWeights = components.map((c) => c.weight / totalWeight);

    for (let i = 0; i < count; i++) {
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

      const L11 = Math.sqrt(Math.max(0, covXX));
      const L21 = L11 > 1e-10 ? covYX / L11 : 0;
      const L22 = Math.sqrt(Math.max(0, covYY - L21 * L21));

      const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
      const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

      const x = meanX + L11 * z1;
      const y = meanY + L21 * z1 + L22 * z2;

      samples.push([x, y]);
    }

    return samples;
  }

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    activeRemoveButton = null;

    const alpha = currentScheduler.getAlpha(currentTime);
    const beta = currentScheduler.getBeta(currentTime);

    const { probabilityGrid, maxValue } = computeGaussianMixtureTfjs(
      xScale,
      yScale,
      components,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      alpha,
      beta
    );

    drawGaussianMixturePDF(
      ctx,
      probabilityGrid,
      maxValue,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      pdfColor
    );
    drawGaussianContours(ctx, probabilityGrid, maxValue, CANVAS_WIDTH, CANVAS_HEIGHT);

    addFrameUsingScales(ctx, xScale, yScale, 11);

    if (sampledPoints.length > 0) {
      ctx.save();
      ctx.fillStyle = SAMPLED_POINT_COLOR;
      for (const point of sampledPoints) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, SAMPLED_POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }

    if (Math.abs(currentTime - 1) < 0.01) {
      components.forEach((component, index) => {
        const pixelX = xScale(component.mean[0]);
        const pixelY = yScale(component.mean[1]);
        const radius = selectedComponentIndex === index ? 8 : 6;
        addDot(ctx, pixelX, pixelY, radius, 'rgba(255, 255, 255, 0.6)');
      });

      if (selectedComponentIndex >= 0) {
        drawHandles(selectedComponentIndex);
      }

      if (showAllWeightSliders && selectedComponentIndex >= 0) {
        drawAllWeightSliders();
      }
    }
  }

  function handleMajorAxisDrag(mouseX: number, mouseY: number, componentIndex: number): void {
    const component = components[componentIndex];
    const [centerX, centerY] = component.mean;

    const VISUAL_SCALE = 0.6;

    const dx = (mouseX - centerX) / VISUAL_SCALE;
    const dy = (mouseY - centerY) / VISUAL_SCALE;
    const newMajorLength = Math.sqrt(dx * dx + dy * dy);

    if (newMajorLength < 0.01) {return;}

    const currentMinorLength = Math.sqrt(
      component.minorAxis[0] ** 2 + component.minorAxis[1] ** 2
    );

    const majorUnitX = dx / newMajorLength;
    const majorUnitY = dy / newMajorLength;

    const minorUnitX = -majorUnitY;
    const minorUnitY = majorUnitX;

    component.majorAxis = [majorUnitX * newMajorLength, majorUnitY * newMajorLength];
    component.minorAxis = [minorUnitX * currentMinorLength, minorUnitY * currentMinorLength];

    component.covariance = buildCovarianceFromAxes(component.majorAxis, component.minorAxis);
  }

  function handleMinorAxisDrag(mouseX: number, mouseY: number, componentIndex: number): void {
    const component = components[componentIndex];
    const [centerX, centerY] = component.mean;

    const VISUAL_SCALE = 0.6;

    const dx = (mouseX - centerX) / VISUAL_SCALE;
    const dy = (mouseY - centerY) / VISUAL_SCALE;
    const newMinorLength = Math.sqrt(dx * dx + dy * dy);

    if (newMinorLength < 0.01) {return;}

    const currentMajorLength = Math.sqrt(
      component.majorAxis[0] ** 2 + component.majorAxis[1] ** 2
    );

    const minorUnitX = dx / newMinorLength;
    const minorUnitY = dy / newMinorLength;

    const majorUnitX = minorUnitY;
    const majorUnitY = -minorUnitX;

    component.majorAxis = [majorUnitX * currentMajorLength, majorUnitY * currentMajorLength];
    component.minorAxis = [minorUnitX * newMinorLength, minorUnitY * newMinorLength];

    component.covariance = buildCovarianceFromAxes(component.majorAxis, component.minorAxis);
  }

  // Event handlers
  canvas.addEventListener('mousedown', (e) => {
    if (Math.abs(currentTime - 1) >= 0.01) {
      return;
    }

    const [pixelX, pixelY] = getMousePixelPosition(e);
    const [dataX, dataY] = getMousePosition(e);

    const removeHit = getRemoveButtonHit(pixelX, pixelY);
    if (removeHit >= 0) {
      removeComponent(removeHit);
      return;
    }

    if (
      selectedComponentIndex >= 0 &&
      isPointInWeightSlider(dataX, dataY, selectedComponentIndex)
    ) {
      isDragging = true;
      selectedHandleType = 'weight-slider';
      dragOffset = [dataX, dataY];
      canvas.style.cursor = 'grabbing';
      return;
    }

    const handle = findNearestHandle(dataX, dataY);
    if (handle) {
      isDragging = true;
      selectedHandleType = handle.type;
      if (handle.type === 'center') {
        dragOffset = [dataX - handle.x, dataY - handle.y];
      }
      canvas.style.cursor = 'grabbing';
      return;
    }

    for (let i = components.length - 1; i >= 0; i--) {
      if (isPointInEllipse(dataX, dataY, components[i])) {
        selectedComponentIndex = i;
        isDragging = true;
        selectedHandleType = 'center';
        dragOffset = [dataX - components[i].mean[0], dataY - components[i].mean[1]];
        canvas.style.cursor = 'grabbing';
        render();
        return;
      }
    }

    selectedComponentIndex = -1;
    showAllWeightSliders = false;
    render();
  });

  canvas.addEventListener('mousemove', (e) => {
    const [dataX, dataY] = getMousePosition(e);

    if (isDragging && selectedComponentIndex >= 0) {
      if (selectedHandleType === 'center') {
        components[selectedComponentIndex].mean = [dataX - dragOffset[0], dataY - dragOffset[1]];
        onComponentsChange(components);
      } else if (selectedHandleType === 'weight-slider') {
        handleWeightSliderDrag(dataX, selectedComponentIndex);
        onComponentsChange(components);
      } else if (selectedHandleType?.startsWith('major') === true) {
        handleMajorAxisDrag(dataX, dataY, selectedComponentIndex);
        onComponentsChange(components);
      } else if (selectedHandleType?.startsWith('minor') === true) {
        handleMinorAxisDrag(dataX, dataY, selectedComponentIndex);
        onComponentsChange(components);
      }
      resampleIfNeeded();
      render();
    } else {
      // Only show grab cursor when editing is enabled (at t=1)
      if (Math.abs(currentTime - 1) < 0.01) {
        let hovering = false;
        for (const component of components) {
          if (isPointInEllipse(dataX, dataY, component)) {
            hovering = true;
            break;
          }
        }
        canvas.style.cursor = hovering ? 'grab' : 'default';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isDragging && selectedHandleType === 'weight-slider') {
      setTimeout(() => {
        if (!isDragging) {
          showAllWeightSliders = false;
          render();
        }
      }, 1500);
    }
    isDragging = false;
    selectedHandleType = null;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    selectedHandleType = null;
    canvas.style.cursor = 'default';
  });

  addComponentBtn.addEventListener('click', () => {
    addNewComponent();
  });

  controlColorPicker.addEventListener('input', () => {
    controlColor = controlColorPicker.value;
    controlColorValue.textContent = controlColor;

    if (renderTimeout !== null) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = window.setTimeout(() => {
      render();
      renderTimeout = null;
    }, 50);
  });

  pdfColorPicker.addEventListener('input', () => {
    pdfColor = pdfColorPicker.value;
    pdfColorValue.textContent = pdfColor;

    if (renderTimeout !== null) {
      clearTimeout(renderTimeout);
    }
    renderTimeout = window.setTimeout(() => {
      render();
      renderTimeout = null;
    }, 50);
  });

  sampleBtn.addEventListener('click', () => {
    const dataSamples = sampleFromGaussianMixture(NUM_SAMPLES, components);

    const alpha = currentScheduler.getAlpha(currentTime);
    const beta = currentScheduler.getBeta(currentTime);

    sampledPoints = [];
    for (const [dataX, dataY] of dataSamples) {
      const conditionalMeanX = alpha * dataX;
      const conditionalMeanY = alpha * dataY;
      const conditionalStdDev = beta;

      const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
      const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

      const sampleX = conditionalMeanX + conditionalStdDev * z1;
      const sampleY = conditionalMeanY + conditionalStdDev * z2;

      sampledPoints.push({ x: xScale(sampleX), y: yScale(sampleY) });
    }

    render();
  });

  clearBtn.addEventListener('click', () => {
    sampledPoints = [];
    render();
  });

  render();

  // Generate initial sample
  resampleIfNeeded();
  render();

  // Sample continuously checkbox handler
  sampleContinuouslyCheckbox.addEventListener('change', () => {
    if (sampleContinuouslyCheckbox.checked) {
      // Trigger a sample when checkbox is enabled
      const dataSamples = sampleFromGaussianMixture(NUM_SAMPLES, components);
      const alpha = currentScheduler.getAlpha(currentTime);
      const beta = currentScheduler.getBeta(currentTime);

      sampledPoints = [];
      for (const [dataX, dataY] of dataSamples) {
        const conditionalMeanX = alpha * dataX;
        const conditionalMeanY = alpha * dataY;
        const conditionalStdDev = beta;

        const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
        const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

        const sampleX = conditionalMeanX + conditionalStdDev * z1;
        const sampleY = conditionalMeanY + conditionalStdDev * z2;

        sampledPoints.push({ x: xScale(sampleX), y: yScale(sampleY) });
      }

      render();
    }
  });

  function update(
    newComponents: ExtendedGaussianComponent[],
    newTime: number,
    newScheduler: NoiseScheduler
  ): void {
    // Clear samples if components or time changed
    const componentsChanged = newComponents !== components;
    const timeChanged = newTime !== currentTime;
    if (componentsChanged || timeChanged) {
      sampledPoints = [];
    }

    components = newComponents;
    currentTime = newTime;
    currentScheduler = newScheduler;

    // Update Add Component button state
    addComponentBtn.disabled = currentTime <= 0.99;

    // Sample continuously if checkbox is checked
    if (sampleContinuouslyCheckbox.checked) {
      const dataSamples = sampleFromGaussianMixture(NUM_SAMPLES, components);
      const alpha = currentScheduler.getAlpha(currentTime);
      const beta = currentScheduler.getBeta(currentTime);

      sampledPoints = [];
      for (const [dataX, dataY] of dataSamples) {
        const conditionalMeanX = alpha * dataX;
        const conditionalMeanY = alpha * dataY;
        const conditionalStdDev = beta;

        const z1 = tf.randomNormal([1], 0, 1).dataSync()[0];
        const z2 = tf.randomNormal([1], 0, 1).dataSync()[0];

        const sampleX = conditionalMeanX + conditionalStdDev * z1;
        const sampleY = conditionalMeanY + conditionalStdDev * z2;

        sampledPoints.push({ x: xScale(sampleX), y: yScale(sampleY) });
      }
    }

    render();
  }

  return update;
}

import {
  addFrameUsingScales,
  defaultMargins,
  drawFunction1D,
  getContext
} from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import { makeScale } from 'web-ui-common/util';

import {
  type GaussianComponent,
  makeGaussianMixture,
  normalizeGaussianComponents
} from '../math/gaussian';
import {
  makeCircularCircularScheduler,
  makeConstantVarianceScheduler,
  makeInverseSqrtNoiseScheduler,
  makeLinearNoiseScheduler,
  makeSqrtNoiseScheduler,
  makeSqrtSqrtScheduler,
  type NoiseScheduler
} from '../math/noise-scheduler';
import { renderMeanPlot, renderSchedulerPlot, renderVariancePlot } from './plot-renderers';

export function setUpMixtureWidget(): void {
  const canvas = el(document, '#mixture-canvas') as HTMLCanvasElement;
  const slider = el(document, '#mixture-slider') as HTMLInputElement;
  const playButton = el(document, '#mixture-play') as HTMLButtonElement;
  const addComponentButton = el(document, '#mixture-add-component') as HTMLButtonElement;
  const tValue = el(document, '#mixture-t') as HTMLElement;
  const weightSummary = el(document, '#mixture-weights') as HTMLElement;
  const schedulerRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="mixture-scheduler"]')
  );

  const ctx = getContext(canvas);
  const xRange = [-6, 6] as [number, number];
  const yRange = [0, 0.6] as [number, number];
  const margins = defaultMargins;
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let scheduler: NoiseScheduler = makeConstantVarianceScheduler();

  const readSliderValue = (): number => {
    const parsed = Number.parseFloat(slider.value);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed;
  };

  let t = readSliderValue();
  let isPlaying = false;
  let animationFrameId: number | null = null;
  let lastTimestamp: number | null = null;

  const handleRadius = 6;
  const deleteButtonRadius = 8;
  let draggedComponent: number | null = null;
  let draggedHandle: 'mean' | 'left' | 'right' | null = null;
  let hoveredDeleteIndex: number | null = null;
  let activeComponentIndex: number | null = null;
  let inactivityTimeout: number | null = null;

  const componentColors = [
    'tomato',
    'steelblue',
    'goldenrod',
    'mediumseagreen',
    'mediumpurple',
    'coral',
    'teal',
    'crimson'
  ];

  const clampMean = (value: number): number => {
    const [minX, maxX] = xRange;
    return Math.max(minX, Math.min(maxX, value));
  };

  const clampStdDev = (value: number): number => {
    return Math.max(0.1, Math.min(3, value));
  };

  const updateWeights = (alpha: number, beta: number): void => {
    const summaryParts = [`α_t = ${alpha.toFixed(2)}`, `β_t = ${beta.toFixed(2)}`];
    weightSummary.textContent = summaryParts.join(', ');
  };

  const updateTDisplay = (): void => {
    tValue.textContent = t.toFixed(2);
  };

  const updateInfoCharts = (components: GaussianComponent[]): void => {
    const schedulerPlot = el(
      document,
      '#mixture-scheduler-plot'
    ) as HTMLCanvasElement;
    const meanPlot = el(document, '#mixture-mean-plot') as HTMLCanvasElement;
    const variancePlot = el(
      document,
      '#mixture-variance-plot'
    ) as HTMLCanvasElement;

    renderSchedulerPlot(schedulerPlot, scheduler, t);

    // For mixture, compute weighted average of means and variances
    const normalizedComponents = normalizeGaussianComponents(components);
    const weightedMean = normalizedComponents.reduce(
      (sum, c) => sum + c.weight * c.mean,
      0
    );
    const weightedVariance = normalizedComponents.reduce(
      (sum, c) => sum + c.weight * (c.stdDev * c.stdDev + c.mean * c.mean),
      0
    ) - weightedMean * weightedMean;
    const weightedStdDev = Math.sqrt(weightedVariance);

    renderMeanPlot(meanPlot, scheduler, t, weightedMean, 'Mean (weighted avg)');
    renderVariancePlot(variancePlot, scheduler, t, weightedStdDev, 'Variance (weighted avg)');
  };

  const getComponentColor = (index: number): string => {
    return componentColors[index % componentColors.length];
  };

  const setActiveComponent = (index: number | null): void => {
    activeComponentIndex = index;
    if (inactivityTimeout !== null) {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = null;
    }
    if (index !== null) {
      inactivityTimeout = window.setTimeout(() => {
        activeComponentIndex = null;
        render(components);
      }, 3000);
    }
    render(components);
  };

  const render = (components: GaussianComponent[]): void => {
    const alpha = scheduler.getAlpha(t);
    const beta = scheduler.getBeta(t);

    // Apply marginal path transformation: p_t(x) = sum_k π_k N(α*μ_k, α²*σ_k² + β²)
    const marginalComponents: GaussianComponent[] = components.map(c => ({
      weight: c.weight,
      mean: alpha * c.mean,
      stdDev: Math.sqrt(alpha * alpha * c.stdDev * c.stdDev + beta * beta)
    }));

    const normalizedMarginalComponents = normalizeGaussianComponents(marginalComponents);
    const marginalMixture = makeGaussianMixture(normalizedMarginalComponents);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    addFrameUsingScales(ctx, xScale, yScale, 10);

    const axisY = yScale(0);

    // Enable/disable add component button based on t
    addComponentButton.disabled = Math.abs(t - 1) >= 0.01;

    // Draw marginal mixture
    drawFunction1D(ctx, xScale, yScale, marginalMixture, {
      stroke: 'darkmagenta',
      lineWidth: 2.5,
      sampleCount: canvas.width
    });

    // Only draw handles when t = 1
    if (Math.abs(t - 1) < 0.01) {
      // Draw handles for all components
      components.forEach((component, index) => {
        const color = getComponentColor(index);
        const meanXPixel = xScale(component.mean);
        const leftHandleXPixel = xScale(component.mean - component.stdDev);
        const rightHandleXPixel = xScale(component.mean + component.stdDev);
        const isActive = activeComponentIndex === index;

        // Always draw mean handle
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(meanXPixel, axisY, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Only draw stdDev handles and delete button if this component is active
        if (isActive) {
        // Draw left handle
          ctx.save();
          ctx.fillStyle = color;
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(leftHandleXPixel, axisY, handleRadius - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Draw right handle
          ctx.save();
          ctx.fillStyle = color;
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(rightHandleXPixel, axisY, handleRadius - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Draw delete button (x) below mean handle if there are at least 2 components
          if (components.length >= 2) {
            const deleteY = axisY + handleRadius + deleteButtonRadius + 4;
            const isHovered = hoveredDeleteIndex === index;

            ctx.save();
            ctx.fillStyle = isHovered ? 'rgba(255, 0, 0, 0.8)' : 'rgba(200, 0, 0, 0.6)';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(meanXPixel, deleteY, deleteButtonRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Draw X
            ctx.save();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            const xSize = 4;
            ctx.beginPath();
            ctx.moveTo(meanXPixel - xSize, deleteY - xSize);
            ctx.lineTo(meanXPixel + xSize, deleteY + xSize);
            ctx.moveTo(meanXPixel + xSize, deleteY - xSize);
            ctx.lineTo(meanXPixel - xSize, deleteY + xSize);
            ctx.stroke();
            ctx.restore();
          }
        }
      });
    }

    updateTDisplay();
    updateWeights(alpha, beta);
    updateInfoCharts(components);
  };

  const components: GaussianComponent[] = [
    { weight: 0.55, mean: -1.5, stdDev: 0.7 },
    { weight: 0.45, mean: 1.25, stdDev: 1.1 }
  ];

  const getCanvasX = (event: MouseEvent | TouchEvent): number | undefined => {
    let clientX: number | undefined;
    if ('touches' in event) {
      const primaryTouch = event.touches.item(0);
      clientX = primaryTouch?.clientX;
    } else {
      clientX = event.clientX;
    }
    if (clientX === undefined) {
      return undefined;
    }
    const rect = canvas.getBoundingClientRect();
    return clientX - rect.left;
  };

  const isNearHandle = (canvasX: number, handleX: number): boolean => {
    return Math.abs(canvasX - handleX) <= handleRadius + 5;
  };

  const isNearDeleteButton = (
    canvasX: number,
    canvasY: number,
    meanX: number,
    deleteY: number
  ): boolean => {
    const dist = Math.sqrt((canvasX - meanX) ** 2 + (canvasY - deleteY) ** 2);
    return dist <= deleteButtonRadius + 3;
  };

  canvas.addEventListener('mousedown', (event) => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }

    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const axisY = yScale(0);
    const rect = canvas.getBoundingClientRect();
    const canvasY = event.clientY - rect.top;

    // Check delete buttons first (only for active component)
    if (activeComponentIndex !== null && components.length >= 2) {
      const deleteY = axisY + handleRadius + deleteButtonRadius + 4;
      const meanXPixel = xScale(components[activeComponentIndex].mean);
      if (isNearDeleteButton(canvasX, canvasY, meanXPixel, deleteY)) {
        components.splice(activeComponentIndex, 1);
        setActiveComponent(null);
        return;
      }
    }

    if (Math.abs(canvasY - axisY) > handleRadius + 5) {
      return;
    }

    // Check all component handles
    for (let i = 0; i < components.length; i++) {
      const meanXPixel = xScale(components[i].mean);

      // Check mean handle first
      if (isNearHandle(canvasX, meanXPixel)) {
        draggedComponent = i;
        draggedHandle = 'mean';
        setActiveComponent(i);
        return;
      }

      // Only check stdDev handles if this component is active
      if (i === activeComponentIndex) {
        const leftHandleXPixel = xScale(components[i].mean - components[i].stdDev);
        const rightHandleXPixel = xScale(components[i].mean + components[i].stdDev);

        if (isNearHandle(canvasX, leftHandleXPixel)) {
          draggedComponent = i;
          draggedHandle = 'left';
          setActiveComponent(i);
          return;
        }
        if (isNearHandle(canvasX, rightHandleXPixel)) {
          draggedComponent = i;
          draggedHandle = 'right';
          setActiveComponent(i);
          return;
        }
      }
    }
  });

  canvas.addEventListener('touchstart', (event) => {
    // Only allow interaction when t = 1
    if (Math.abs(t - 1) >= 0.01) {
      return;
    }

    event.preventDefault();
    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const primaryTouch = event.touches.item(0);
    if (!primaryTouch) {
      return;
    }

    const axisY = yScale(0);
    const rect = canvas.getBoundingClientRect();
    const canvasY = primaryTouch.clientY - rect.top;

    // Check delete buttons first (only for active component)
    if (activeComponentIndex !== null && components.length >= 2) {
      const deleteY = axisY + handleRadius + deleteButtonRadius + 4;
      const meanXPixel = xScale(components[activeComponentIndex].mean);
      if (isNearDeleteButton(canvasX, canvasY, meanXPixel, deleteY)) {
        components.splice(activeComponentIndex, 1);
        setActiveComponent(null);
        return;
      }
    }

    if (Math.abs(canvasY - axisY) > handleRadius + 5) {
      return;
    }

    // Check all component handles
    for (let i = 0; i < components.length; i++) {
      const meanXPixel = xScale(components[i].mean);

      // Check mean handle first
      if (isNearHandle(canvasX, meanXPixel)) {
        draggedComponent = i;
        draggedHandle = 'mean';
        setActiveComponent(i);
        return;
      }

      // Only check stdDev handles if this component is active
      if (i === activeComponentIndex) {
        const leftHandleXPixel = xScale(components[i].mean - components[i].stdDev);
        const rightHandleXPixel = xScale(components[i].mean + components[i].stdDev);

        if (isNearHandle(canvasX, leftHandleXPixel)) {
          draggedComponent = i;
          draggedHandle = 'left';
          setActiveComponent(i);
          return;
        }
        if (isNearHandle(canvasX, rightHandleXPixel)) {
          draggedComponent = i;
          draggedHandle = 'right';
          setActiveComponent(i);
          return;
        }
      }
    }
  });

  window.addEventListener('mousemove', (event) => {
    if (draggedComponent === null || draggedHandle === null) {
      return;
    }

    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const xValue = xScale.inverse(canvasX);

    if (draggedHandle === 'mean') {
      components[draggedComponent].mean = clampMean(xValue);
    } else {
      const newStdDev = Math.abs(xValue - components[draggedComponent].mean);
      components[draggedComponent].stdDev = clampStdDev(newStdDev);
    }

    // Reset inactivity timer while dragging
    setActiveComponent(draggedComponent);
  });

  window.addEventListener('touchmove', (event) => {
    if (draggedComponent === null || draggedHandle === null) {
      return;
    }

    event.preventDefault();
    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const xValue = xScale.inverse(canvasX);

    if (draggedHandle === 'mean') {
      components[draggedComponent].mean = clampMean(xValue);
    } else {
      const newStdDev = Math.abs(xValue - components[draggedComponent].mean);
      components[draggedComponent].stdDev = clampStdDev(newStdDev);
    }

    // Reset inactivity timer while dragging
    setActiveComponent(draggedComponent);
  });

  const stopDragging = (): void => {
    draggedComponent = null;
    draggedHandle = null;
  };

  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('touchend', stopDragging);
  window.addEventListener('touchcancel', stopDragging);

  const stopAnimation = (): void => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    isPlaying = false;
    lastTimestamp = null;
    playButton.textContent = 'Play';
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
      slider.value = t.toFixed(3);
      render(components);
      stopAnimation();
      return;
    }

    slider.value = t.toFixed(3);
    render(components);
    animationFrameId = requestAnimationFrame(stepAnimation);
  };

  const startAnimation = (): void => {
    if (isPlaying) {
      return;
    }
    isPlaying = true;
    playButton.textContent = 'Pause';
    animationFrameId = requestAnimationFrame(stepAnimation);
  };

  const setTFromSlider = (): void => {
    t = Math.max(0, Math.min(1, readSliderValue()));
    render(components);
  };

  slider.addEventListener('input', () => {
    if (isPlaying) {
      stopAnimation();
    }
    setTFromSlider();
  });

  playButton.addEventListener('click', () => {
    if (isPlaying) {
      stopAnimation();
      return;
    }
    if (t >= 1) {
      t = 0;
      slider.value = t.toFixed(3);
      render(components);
    }
    startAnimation();
  });

  addComponentButton.addEventListener('click', () => {
    const [minX, maxX] = xRange;
    const newComponent: GaussianComponent = {
      weight: 1 / (components.length + 1),
      mean: minX + Math.random() * (maxX - minX),
      stdDev: 0.5 + Math.random() * 1.5
    };
    components.push(newComponent);
    render(components);
  });

  // Track hover over delete button (only for active component)
  canvas.addEventListener('mousemove', (event) => {
    if (draggedComponent !== null) {
      return; // Already handled by drag logic
    }

    const canvasX = getCanvasX(event);
    if (canvasX === undefined) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasY = event.clientY - rect.top;
    const axisY = yScale(0);
    const deleteY = axisY + handleRadius + deleteButtonRadius + 4;

    let newHoveredIndex: number | null = null;

    if (activeComponentIndex !== null && components.length >= 2) {
      const meanXPixel = xScale(components[activeComponentIndex].mean);
      if (isNearDeleteButton(canvasX, canvasY, meanXPixel, deleteY)) {
        newHoveredIndex = activeComponentIndex;
      }
    }

    if (newHoveredIndex !== hoveredDeleteIndex) {
      hoveredDeleteIndex = newHoveredIndex;
      render(components);
    }
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
        render(components);
      }
    });
  });

  render(components);
}

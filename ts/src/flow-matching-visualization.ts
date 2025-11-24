import type { Tensor2D } from 'flow-models-common/tf-types';
import { addFrameUsingScales, drawScatter, getContext } from 'web-ui-common/canvas';
import { removePlaceholder } from 'web-ui-common/dom';
import type { Pair } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;
const MARGIN = 40;

/**
 * Interpolate between two frames using linear interpolation
 * @param frame1 First frame (t=0)
 * @param frame2 Second frame (t=1)
 * @param t Interpolation parameter (0 to 1)
 * @returns Array of interpolated coordinates
 */
function interpolateFrames(frame1: Tensor2D, frame2: Tensor2D, t: number): Pair<number>[] {
  const data1 = frame1.arraySync();
  const data2 = frame2.arraySync();

  const result: Pair<number>[] = [];
  for (let i = 0; i < data1.length; i++) {
    const x = data1[i][0] + (data2[i][0] - data1[i][0]) * t;
    const y = data1[i][1] + (data2[i][1] - data1[i][1]) * t;
    result.push([x, y]);
  }

  return result;
}

/**
 * Get data bounds for scaling across all frames
 */
function getAllFramesBounds(frames: Tensor2D[]): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const frame of frames) {
    const min = frame.min(0).arraySync() as number[];
    const max = frame.max(0).arraySync() as number[];

    xMin = Math.min(xMin, min[0]);
    xMax = Math.max(xMax, max[0]);
    yMin = Math.min(yMin, min[1]);
    yMax = Math.max(yMax, max[1]);
  }

  return { xMin, xMax, yMin, yMax };
}

export interface FlowMatchingVisualizationOptions {
  onResample?: (numSamples: number) => Tensor2D[];
  initialSamples?: number;
  autoplay?: boolean;
}

export function initWidget(
  container: HTMLDivElement,
  initialFrames: Tensor2D[],
  options?: FlowMatchingVisualizationOptions
): void {
  removePlaceholder(container);

  if (initialFrames.length === 0) {
    container.textContent = 'No frames to display';
    return;
  }

  let frames = initialFrames;

  // Create control panel
  const controlPanel = document.createElement('div');
  controlPanel.className = 'control-panel';
  controlPanel.style.display = 'flex';
  controlPanel.style.alignItems = 'center';
  controlPanel.style.gap = '15px';
  controlPanel.style.marginBottom = '10px';

  // Play/Pause button
  const playButton = document.createElement('button');
  playButton.textContent = 'Play';
  playButton.style.minWidth = '80px';
  controlPanel.appendChild(playButton);

  // Time label
  const timeLabel = document.createElement('label');
  timeLabel.textContent = 'Time: ';
  controlPanel.appendChild(timeLabel);

  // Time slider (represents time t from 0 to 1)
  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.min = '0';
  timeSlider.max = '1';
  timeSlider.step = '0.001'; // Fine-grained control
  timeSlider.value = '0';
  timeSlider.style.flex = '1';
  controlPanel.appendChild(timeSlider);

  // Time display
  const timeDisplay = document.createElement('span');
  timeDisplay.textContent = 't = 0.000';
  timeDisplay.style.minWidth = '80px';
  controlPanel.appendChild(timeDisplay);

  container.appendChild(controlPanel);

  // Resample control panel (if callback provided)
  let resampleButton: HTMLButtonElement | null = null;
  let sampleInput: HTMLInputElement | null = null;

  if (options?.onResample) {
    const resamplePanel = document.createElement('div');
    resamplePanel.className = 'control-panel';
    resamplePanel.style.display = 'flex';
    resamplePanel.style.alignItems = 'center';
    resamplePanel.style.gap = '15px';
    resamplePanel.style.marginBottom = '10px';

    // Sample size input
    const sampleLabel = document.createElement('label');
    sampleLabel.textContent = 'Samples: ';
    sampleInput = document.createElement('input');
    sampleInput.type = 'number';
    sampleInput.value = (options.initialSamples ?? 500).toString();
    sampleInput.min = '100';
    sampleInput.max = '10000';
    sampleInput.step = '100';
    sampleLabel.appendChild(sampleInput);
    resamplePanel.appendChild(sampleLabel);

    // Resample button
    resampleButton = document.createElement('button');
    resampleButton.textContent = 'Resample';
    resamplePanel.appendChild(resampleButton);

    container.appendChild(resamplePanel);
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.marginTop = '10px';
  container.appendChild(canvas);

  const ctx = getContext(canvas);

  // Scales (will be updated by updateBoundsAndScales)
  let xScale: ReturnType<typeof makeScale>;
  let yScale: ReturnType<typeof makeScale>;

  function updateBoundsAndScales(): void {
    // Get bounds for all frames (for consistent scaling)
    const bounds = getAllFramesBounds(frames);
    const xPadding = (bounds.xMax - bounds.xMin) * 0.1;
    const yPadding = (bounds.yMax - bounds.yMin) * 0.1;

    // Create scales
    xScale = makeScale(
      [bounds.xMin - xPadding, bounds.xMax + xPadding],
      [MARGIN, CANVAS_WIDTH - MARGIN]
    );
    yScale = makeScale(
      [bounds.yMin - yPadding, bounds.yMax + yPadding],
      [CANVAS_HEIGHT - MARGIN, MARGIN]
    );
  }

  // Initialize scales
  updateBoundsAndScales();

  // Animation state
  let isPlaying = false;
  let animationId: number | null = null;
  let currentTime = 0; // Time t from 0 to 1
  const ANIMATION_DURATION_MS = 3000; // Full animation from t=0 to t=1
  const PAUSE_AT_END_MS = 1000;
  const PAUSE_AT_START_MS = 1000;

  /**
   * Draw the visualization at time t (0 to 1)
   * @param t Time parameter from 0 to 1
   */
  function drawAtTime(t: number): void {
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, 5);

    // Map time t to frame index (fractional)
    const frameProgress = t * (frames.length - 1);
    const frameIndex = Math.floor(frameProgress);
    const nextFrameIndex = Math.min(frameIndex + 1, frames.length - 1);
    const interpolationT = frameProgress - frameIndex;

    let coords: Pair<number>[];
    if (interpolationT === 0 || frameIndex === nextFrameIndex) {
      // No interpolation needed - we're exactly on a frame
      const dataArray = frames[frameIndex].arraySync();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      coords = (dataArray as number[][]).map(([x, y]) => [x, y]);
    } else {
      // Linear interpolation between frames
      coords = interpolateFrames(frames[frameIndex], frames[nextFrameIndex], interpolationT);
    }

    const colors = new Array<string>(coords.length).fill('#4169E1');

    // Draw scatter plot
    drawScatter(ctx, xScale, yScale, coords, colors, undefined, { radius: 1.5, alpha: 0.3 });

    // Update time display
    timeDisplay.textContent = `t = ${t.toFixed(3)}`;
    timeSlider.value = t.toString();
  }

  function play(): void {
    if (isPlaying) {return;}

    isPlaying = true;
    playButton.textContent = 'Pause';

    let startTime: number | null = null;
    let pausePhase: 'start' | 'end' | null = currentTime === 0 ? 'start' : null;
    let pauseStartTime: number | null = null;

    const animate = (timestamp: number): void => {
      if (pausePhase === 'start') {
        // Pause at start
        pauseStartTime ??= timestamp;
        if (timestamp - pauseStartTime >= PAUSE_AT_START_MS) {
          pausePhase = null;
          startTime = null;
          pauseStartTime = null;
        }
      } else if (pausePhase === 'end') {
        // Pause at end
        pauseStartTime ??= timestamp;
        if (timestamp - pauseStartTime >= PAUSE_AT_END_MS) {
          // Restart from beginning
          currentTime = 0;
          drawAtTime(currentTime);
          pausePhase = 'start';
          pauseStartTime = null;
          startTime = null;
        }
      } else {
        // Normal animation
        startTime ??= timestamp - (currentTime * ANIMATION_DURATION_MS);

        const elapsed = timestamp - startTime;
        currentTime = Math.min(elapsed / ANIMATION_DURATION_MS, 1);

        drawAtTime(currentTime);

        if (currentTime >= 1) {
          // Reached the end
          pausePhase = 'end';
          pauseStartTime = null;
        }
      }

      if (isPlaying) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);
  }

  function pause(): void {
    isPlaying = false;
    playButton.textContent = 'Play';

    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  // Event listeners
  playButton.addEventListener('click', () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  });

  timeSlider.addEventListener('input', () => {
    pause();
    currentTime = parseFloat(timeSlider.value);
    drawAtTime(currentTime);
  });

  // Resample handler
  if (resampleButton && sampleInput && options?.onResample) {
    const onResampleCallback = options.onResample;
    resampleButton.addEventListener('click', () => {
      const numSamples = parseInt(sampleInput.value);

      // Pause animation
      pause();

      // Get new frames
      const newFrames = onResampleCallback(numSamples);

      // Dispose old frames
      for (const frame of frames) {
        frame.dispose();
      }

      frames = newFrames;
      currentTime = 0;

      // Recalculate bounds and scales
      updateBoundsAndScales();

      // Redraw and restart animation
      drawAtTime(0);
      play();
    });
  }

  // Initial draw and optionally autostart
  drawAtTime(0);
  if (options?.autoplay ?? true) {
    play();
  }
}

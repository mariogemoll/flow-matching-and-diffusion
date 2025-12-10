import { addFrameUsingScales, createMovableDot, getContext } from 'web-ui-common/canvas';
import type { Pair, Scale } from 'web-ui-common/types';

import { initTimeSliderWidget } from './time-slider';
import {
  calculateTrajectory,
  createVectorFieldScales,
  drawVectorField
} from './vector-field-core';

/**
 * Draw trajectory as a line
 */
function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  xScale: Scale,
  yScale: Scale,
  trajectory: Pair<number>[]
): void {
  if (trajectory.length < 2) {return;}

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();

  const [x0, y0] = trajectory[0];
  ctx.moveTo(xScale(x0), yScale(y0));

  for (let i = 1; i < trajectory.length; i++) {
    const [x, y] = trajectory[i];
    ctx.lineTo(xScale(x), yScale(y));
  }

  ctx.stroke();
  ctx.globalAlpha = 1;
}

interface VectorFieldOptions {
  showEulerSteps?: boolean;
}

function setUpVectorField(canvas: HTMLCanvasElement, options: VectorFieldOptions = {}): void {
  const { showEulerSteps = false } = options;
  const ctx = getContext(canvas);
  const container = canvas.parentElement;
  if (!container) {
    throw new Error('Canvas must have a parent element');
  }

  const { xScale, yScale } = createVectorFieldScales(canvas.width, canvas.height);

  let currentTime = 0;
  let dotPosition: Pair<number> | null = null;
  let trajectory: Pair<number>[] = [];
  let showTrajectory = showEulerSteps; // Show trajectory by default in Euler mode
  let eulerSteps = 4; // For Euler demonstration
  let discreteTrajectory: Pair<number>[] = []; // Coarse trajectory for Euler demo
  let showEulerStepsPoints = showEulerSteps; // Show Euler approximation by default in Euler mode

  function render(time: number): void {
    currentTime = time;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the vector field
    drawVectorField(ctx, xScale, yScale, currentTime);

    // Draw trajectory if enabled
    if (showTrajectory && dotPosition && trajectory.length > 0) {
      drawTrajectory(ctx, xScale, yScale, trajectory);
    }

    // Draw Euler step line if enabled
    if (showEulerSteps && showEulerStepsPoints && discreteTrajectory.length > 0) {
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();

      const [x0, y0] = discreteTrajectory[0];
      ctx.moveTo(xScale(x0), yScale(y0));

      for (let i = 1; i < discreteTrajectory.length; i++) {
        const [x, y] = discreteTrajectory[i];
        ctx.lineTo(xScale(x), yScale(y));
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw frame with axes
    addFrameUsingScales(ctx, xScale, yScale, 10);

    // Draw dot at current position along trajectory
    if (dotPosition) {
      let currentPos: Pair<number>;

      if (showEulerSteps && discreteTrajectory.length > 0) {
        // Use discrete trajectory for Euler demonstration
        const stepIndex = Math.min(
          Math.floor(currentTime * eulerSteps),
          discreteTrajectory.length - 1
        );
        currentPos = discreteTrajectory[stepIndex];
      } else if (trajectory.length > 0) {
        // Use smooth trajectory
        const trajectoryIndex = Math.min(
          Math.floor(currentTime * (trajectory.length - 1)),
          trajectory.length - 1
        );
        currentPos = trajectory[trajectoryIndex];
      } else {
        currentPos = dotPosition;
      }

      dot.render(currentPos);
    }
  }

  // Create flex container for controls (two columns)
  const controlsContainer = document.createElement('div');
  controlsContainer.style.display = 'flex';
  controlsContainer.style.gap = '40px';
  controlsContainer.style.marginTop = '16px';
  container.appendChild(controlsContainer);

  // Left column: sliders
  const slidersColumn = document.createElement('div');
  controlsContainer.appendChild(slidersColumn);

  // Right column: checkboxes
  const checkboxesColumn = document.createElement('div');
  checkboxesColumn.style.display = 'flex';
  checkboxesColumn.style.flexDirection = 'column';
  checkboxesColumn.style.gap = '8px';
  controlsContainer.appendChild(checkboxesColumn);

  // Initialize time slider with looping and autostart
  const sliderControls = initTimeSliderWidget(slidersColumn, currentTime, render, {
    loop: true,
    autostart: true,
    steps: showEulerSteps ? eulerSteps : undefined
  });

  // Create checkbox for trajectory display
  const trajectoryCheckboxContainer = document.createElement('div');
  trajectoryCheckboxContainer.style.display = 'flex';
  trajectoryCheckboxContainer.style.alignItems = 'center';
  checkboxesColumn.appendChild(trajectoryCheckboxContainer);

  const trajectoryCheckbox = document.createElement('input');
  trajectoryCheckbox.type = 'checkbox';
  trajectoryCheckbox.id = 'show-trajectory';
  trajectoryCheckbox.checked = showTrajectory;
  trajectoryCheckboxContainer.appendChild(trajectoryCheckbox);

  const trajectoryLabel = document.createElement('label');
  trajectoryLabel.htmlFor = 'show-trajectory';
  trajectoryLabel.textContent = ' Display trajectory';
  trajectoryLabel.style.marginLeft = '4px';
  trajectoryLabel.style.cursor = 'pointer';
  trajectoryCheckboxContainer.appendChild(trajectoryLabel);

  trajectoryCheckbox.addEventListener('change', () => {
    showTrajectory = trajectoryCheckbox.checked;
    render(currentTime);
  });

  // Add Euler steps slider if in demonstration mode
  if (showEulerSteps) {
    const eulerStepsContainer = document.createElement('div');
    eulerStepsContainer.style.marginTop = '16px';
    slidersColumn.appendChild(eulerStepsContainer);

    const eulerStepsLabel = document.createElement('label');
    eulerStepsLabel.textContent = 'Euler steps: ';
    eulerStepsContainer.appendChild(eulerStepsLabel);

    const eulerStepsSlider = document.createElement('input');
    eulerStepsSlider.type = 'range';
    eulerStepsSlider.min = '2';
    eulerStepsSlider.max = '100';
    eulerStepsSlider.step = '1';
    eulerStepsSlider.value = eulerSteps.toString();
    eulerStepsSlider.style.width = '320px';
    eulerStepsSlider.style.marginLeft = '8px';
    eulerStepsContainer.appendChild(eulerStepsSlider);

    const eulerStepsValue = document.createElement('span');
    eulerStepsValue.textContent = eulerSteps.toString();
    eulerStepsValue.style.marginLeft = '8px';
    eulerStepsContainer.appendChild(eulerStepsValue);

    let wasPlaying = false;

    eulerStepsSlider.addEventListener('mousedown', () => {
      // Store playing state and pause
      const playPauseBtn = controlsContainer.querySelector('button');
      wasPlaying = playPauseBtn?.textContent === 'Pause';
      if (wasPlaying && playPauseBtn) {
        playPauseBtn.click();
      }
    });

    eulerStepsSlider.addEventListener('input', () => {
      eulerSteps = parseInt(eulerStepsSlider.value);
      eulerStepsValue.textContent = eulerSteps.toString();

      // Update slider steps
      sliderControls.setSteps(eulerSteps);

      // Recalculate discrete trajectory
      if (dotPosition) {
        discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, eulerSteps);
      }

      currentTime = 0;
      sliderControls.update(0);
      render(0);
    });

    eulerStepsSlider.addEventListener('mouseup', () => {
      // Resume if it was playing
      if (wasPlaying) {
        const playPauseBtn = controlsContainer.querySelector('button');
        if (playPauseBtn?.textContent === 'Play') {
          playPauseBtn.click();
        }
      }
    });

    // Add checkbox to show Euler approximation
    const eulerApproxCheckboxContainer = document.createElement('div');
    eulerApproxCheckboxContainer.style.display = 'flex';
    eulerApproxCheckboxContainer.style.alignItems = 'center';
    checkboxesColumn.appendChild(eulerApproxCheckboxContainer);

    const eulerStepsPointsCheckbox = document.createElement('input');
    eulerStepsPointsCheckbox.type = 'checkbox';
    eulerStepsPointsCheckbox.id = 'show-euler-steps-points';
    eulerStepsPointsCheckbox.checked = showEulerStepsPoints;
    eulerApproxCheckboxContainer.appendChild(eulerStepsPointsCheckbox);

    const eulerStepsPointsLabel = document.createElement('label');
    eulerStepsPointsLabel.htmlFor = 'show-euler-steps-points';
    eulerStepsPointsLabel.textContent = ' Display Euler approximation';
    eulerStepsPointsLabel.style.marginLeft = '4px';
    eulerStepsPointsLabel.style.cursor = 'pointer';
    eulerApproxCheckboxContainer.appendChild(eulerStepsPointsLabel);

    eulerStepsPointsCheckbox.addEventListener('change', () => {
      showEulerStepsPoints = eulerStepsPointsCheckbox.checked;
      render(currentTime);
    });
  }

  // Create movable dot
  const dot = createMovableDot(
    canvas,
    ctx,
    xScale,
    yScale,
    [0, 0], // Initial position (center)
    {
      radius: 6,
      fill: '#FF5722',
      onChange: (newPosition: Pair<number>) => {
        dotPosition = newPosition;
        trajectory = calculateTrajectory(dotPosition, xScale, yScale);

        if (showEulerSteps) {
          discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, eulerSteps);
        }

        currentTime = 0;
        sliderControls.update(0); // Reset time to 0
        render(0);
      }
    }
  );

  // Set initial dot position
  dotPosition = [90, 90];
  trajectory = calculateTrajectory(dotPosition, xScale, yScale);

  if (showEulerSteps) {
    discreteTrajectory = calculateTrajectory(dotPosition, xScale, yScale, eulerSteps);
  }

  // Initial render
  render(0);
}

export { setUpVectorField };

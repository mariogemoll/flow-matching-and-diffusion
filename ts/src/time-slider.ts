export interface TimeSliderOptions {
  loop?: boolean;
  autostart?: boolean;
  steps?: number; // Number of discrete steps (undefined = continuous)
  pauseAtEnd?: number; // Pause duration in milliseconds before looping
  onLoopStart?: () => void | Promise<void>; // Callback when loop restarts
}

export interface TimeSliderControls {
  update: (time: number) => void;
  setSteps: (newSteps: number | undefined) => void;
}

export function initTimeSliderWidget(
  container: HTMLElement,
  initialTime: number,
  onChange: (time: number) => void,
  options: TimeSliderOptions = {}
): TimeSliderControls {
  const {
    loop = false,
    autostart = false,
    steps: initialSteps,
    pauseAtEnd = 0,
    onLoopStart
  } = options;
  let steps = initialSteps;
  // Create time slider container
  const sliderDiv = document.createElement('div');
  container.appendChild(sliderDiv);

  // Create play/pause button
  const playPauseBtn = document.createElement('button');
  playPauseBtn.textContent = 'Play';
  sliderDiv.appendChild(playPauseBtn);

  // Create time slider
  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.min = '0';
  if (steps !== undefined) {
    timeSlider.max = steps.toString();
    timeSlider.step = '1';
    timeSlider.value = Math.round(initialTime * steps).toString();
  } else {
    timeSlider.max = '1';
    timeSlider.step = '0.01';
    timeSlider.value = initialTime.toString();
  }
  sliderDiv.appendChild(timeSlider);

  // Create time value display
  const timeValue = document.createElement('span');
  timeValue.textContent = initialTime.toFixed(2);
  sliderDiv.appendChild(timeValue);

  let currentTime = initialTime;
  let isPlaying = false;
  let animationId: number | null = null;
  let isPaused = false;

  // Time slider event handler
  timeSlider.addEventListener('input', () => {
    if (steps !== undefined) {
      const stepIndex = parseInt(timeSlider.value);
      currentTime = stepIndex / steps;
    } else {
      currentTime = parseFloat(timeSlider.value);
    }
    timeValue.textContent = currentTime.toFixed(2);
    onChange(currentTime);
  });

  let lastStepTime = 0;
  let animationStartTime = 0;
  const totalAnimationDuration = 4000; // 4 seconds for full animation (0 to 1)

  async function handleLoopRestart(): Promise<void> {
    if (pauseAtEnd > 0) {
      isPaused = true;
      await new Promise(resolve => setTimeout(resolve, pauseAtEnd));
      isPaused = false;
    }

    if (onLoopStart) {
      await onLoopStart();
    }

    currentTime = 0;
    if (steps !== undefined) {
      timeSlider.value = '0';
    } else {
      timeSlider.value = '0';
    }
    timeValue.textContent = '0.00';
    onChange(currentTime);
  }

  function animate(timestamp: number): void {
    if (!isPlaying || isPaused) {
      if (isPlaying && !isPaused) {
        animationId = requestAnimationFrame(animate);
      }
      return;
    }

    if (steps !== undefined) {
      // Discrete mode: advance by steps with timing control
      const stepDuration = totalAnimationDuration / steps; // ms per step

      if (lastStepTime === 0) {
        lastStepTime = timestamp;
      }

      const elapsed = timestamp - lastStepTime;

      if (elapsed >= stepDuration) {
        // Advance multiple steps if needed to maintain timing
        const stepsToAdvance = Math.floor(elapsed / stepDuration);
        lastStepTime = lastStepTime + (stepsToAdvance * stepDuration);

        const currentStep = Math.round(currentTime * steps);
        const nextStep = currentStep + stepsToAdvance;

        if (nextStep > steps) {
          if (loop) {
            void handleLoopRestart().then(() => {
              if (isPlaying) {
                animationId = requestAnimationFrame(animate);
              }
            });
            return;
          } else {
            currentTime = 1;
            isPlaying = false;
            playPauseBtn.textContent = 'Play';
            if (animationId !== null) {
              cancelAnimationFrame(animationId);
              animationId = null;
            }
            lastStepTime = 0;
            return;
          }
        } else {
          currentTime = nextStep / steps;
        }

        timeSlider.value = Math.round(currentTime * steps).toString();
        timeValue.textContent = currentTime.toFixed(2);
        onChange(currentTime);
      }
    } else {
      // Continuous mode: wall-time based
      if (animationStartTime === 0) {
        animationStartTime = timestamp;
      }

      const elapsed = timestamp - animationStartTime;
      const progress = elapsed / totalAnimationDuration;
      currentTime = Math.min(progress, 1);

      if (currentTime >= 1) {
        currentTime = 1;
        timeSlider.value = currentTime.toString();
        timeValue.textContent = currentTime.toFixed(2);
        onChange(currentTime);

        if (loop) {
          void handleLoopRestart().then(() => {
            if (isPlaying) {
              animationStartTime = 0; // Reset for next loop
              animationId = requestAnimationFrame(animate);
            }
          });
          return;
        } else {
          isPlaying = false;
          playPauseBtn.textContent = 'Play';
          if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
          }
          animationStartTime = 0;
        }
        return;
      }

      timeSlider.value = currentTime.toString();
      timeValue.textContent = currentTime.toFixed(2);
      onChange(currentTime);
    }

    animationId = requestAnimationFrame(animate);
  }

  playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';

    if (isPlaying) {
      // If at the end, reset to beginning
      if (currentTime >= 1) {
        currentTime = 0;
        if (steps !== undefined) {
          timeSlider.value = '0';
        } else {
          timeSlider.value = currentTime.toString();
        }
        timeValue.textContent = currentTime.toFixed(2);
        onChange(currentTime);
      }
      lastStepTime = 0; // Reset timing
      animationStartTime = 0; // Reset wall-time start
      animationId = requestAnimationFrame(animate);
    } else if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
      lastStepTime = 0;
      animationStartTime = 0;
    }
  });

  function update(newTime: number): void {
    currentTime = newTime;
    if (steps !== undefined) {
      timeSlider.value = Math.round(newTime * steps).toString();
    } else {
      timeSlider.value = newTime.toString();
    }
    timeValue.textContent = newTime.toFixed(2);
  }

  function setSteps(newSteps: number | undefined): void {
    steps = newSteps;
    // Update slider configuration
    if (steps !== undefined) {
      timeSlider.max = steps.toString();
      timeSlider.step = '1';
      timeSlider.value = Math.round(currentTime * steps).toString();
    } else {
      timeSlider.max = '1';
      timeSlider.step = '0.01';
      timeSlider.value = currentTime.toString();
    }
  }

  // Autostart if requested
  if (autostart) {
    isPlaying = true;
    playPauseBtn.textContent = 'Pause';
    animationId = requestAnimationFrame(animate);
  }

  return { update, setSteps };
}

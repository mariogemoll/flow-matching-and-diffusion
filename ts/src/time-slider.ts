import { addDiv, addEl, addSpan } from 'web-ui-common/dom';

export interface TimeSliderOptions {
  loop?: boolean;
  autostart?: boolean;
  steps?: number; // Number of discrete steps (undefined = continuous)
  pauseAtEnd?: number; // Pause duration in milliseconds before looping
  onLoopStart?: () => void | Promise<void>; // Callback when loop restarts
  // Total animation duration in milliseconds (default: 3000, set to 0 for maximum speed)
  duration?: number;
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
    onLoopStart,
    duration = 3000
  } = options;
  let steps = initialSteps;
  // Create time slider container
  const sliderDiv = addDiv(container, {});

  // Create play/pause button
  const playPauseBtn = addEl(sliderDiv, 'button', {}) as HTMLButtonElement;
  playPauseBtn.textContent = 'Play';

  // Create time slider
  const timeSlider = addEl(sliderDiv, 'input', {
    type: 'range',
    min: '0',
    max: steps !== undefined ? steps.toString() : '1',
    step: steps !== undefined ? '1' : '0.01',
    value: steps !== undefined ? Math.round(initialTime * steps).toString() : initialTime.toString()
  }) as HTMLInputElement;

  // Create time value display
  const timeValue = addSpan(sliderDiv, {});
  timeValue.textContent = initialTime.toFixed(2);

  let currentTime = initialTime;
  let isPlaying = false;
  let animationId: number | null = null;
  let isPaused = false;
  let wasPlayingBeforeSlider = false;

  // Pause animation when starting to drag the slider
  timeSlider.addEventListener('mousedown', () => {
    wasPlayingBeforeSlider = isPlaying;
    if (isPlaying) {
      isPlaying = false;
      playPauseBtn.textContent = 'Play';
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }
  });

  // Resume animation after dragging the slider if it was playing
  timeSlider.addEventListener('mouseup', () => {
    if (wasPlayingBeforeSlider) {
      isPlaying = true;
      playPauseBtn.textContent = 'Pause';
      animationId = requestAnimationFrame(animate);
    }
  });

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

  // Calculate speed based on duration: at 60fps, we need (60 * duration/1000) frames to complete
  // So increment per frame = 1 / (60 * duration/1000) = 1000 / (60 * duration)
  // If duration is 0, go as fast as possible (max increment per frame)
  const targetFPS = 60;
  const animationSpeed = duration === 0 ? 1 : 1000 / (targetFPS * duration); // Increment per frame
  let frameCount = 0;

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

  function animate(): void {
    if (!isPlaying || isPaused) {
      if (isPlaying && !isPaused) {
        animationId = requestAnimationFrame(animate);
      }
      return;
    }

    if (steps !== undefined) {
      // Discrete mode: advance by one step, but throttle to match duration
      // (unless duration is 0)
      const framesPerStep = duration === 0
        ? 1
        : Math.max(1, Math.round((duration / 1000) * targetFPS / steps));

      frameCount++;

      if (frameCount >= framesPerStep) {
        frameCount = 0;
        const currentStep = Math.round(currentTime * steps);
        const nextStep = currentStep + 1;

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
      // Continuous mode: simple increment
      currentTime += animationSpeed;

      if (currentTime >= 1) {
        currentTime = 1;
        timeSlider.value = currentTime.toString();
        timeValue.textContent = currentTime.toFixed(2);
        onChange(currentTime);

        if (loop) {
          void handleLoopRestart().then(() => {
            if (isPlaying) {
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
      animationId = requestAnimationFrame(animate);
    } else if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
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

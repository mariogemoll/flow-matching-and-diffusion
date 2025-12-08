export interface TimeSliderOptions {
  loop?: boolean;
  autostart?: boolean;
}

export function initTimeSliderWidget(
  container: HTMLElement,
  initialTime: number,
  onChange: (time: number) => void,
  options: TimeSliderOptions = {}
): (time: number) => void {
  const { loop = false, autostart = false } = options;
  // Create time slider container
  const sliderDiv = document.createElement('div');
  sliderDiv.style.marginTop = '16px';
  container.appendChild(sliderDiv);

  // Create play/pause button
  const playPauseBtn = document.createElement('button');
  playPauseBtn.textContent = 'Play';
  sliderDiv.appendChild(playPauseBtn);

  // Create time slider
  const timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.min = '0';
  timeSlider.max = '1';
  timeSlider.step = '0.01';
  timeSlider.value = initialTime.toString();
  timeSlider.style.width = '320px';
  timeSlider.style.marginLeft = '8px';
  sliderDiv.appendChild(timeSlider);

  // Create time value display
  const timeValue = document.createElement('span');
  timeValue.textContent = initialTime.toFixed(2);
  timeValue.style.marginLeft = '8px';
  sliderDiv.appendChild(timeValue);

  let currentTime = initialTime;
  let isPlaying = false;
  let animationId: number | null = null;

  // Time slider event handler
  timeSlider.addEventListener('input', () => {
    const newTime = parseFloat(timeSlider.value);
    currentTime = newTime;
    timeValue.textContent = newTime.toFixed(2);
    onChange(newTime);
  });

  function animate(): void {
    if (!isPlaying) {return;}

    currentTime += 0.01;
    if (currentTime >= 1) {
      if (loop) {
        currentTime = 0; // Loop back to start
      } else {
        currentTime = 1;
        isPlaying = false;
        playPauseBtn.textContent = 'Play';
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    }

    timeSlider.value = currentTime.toString();
    timeValue.textContent = currentTime.toFixed(2);
    onChange(currentTime);

    if (isPlaying) {
      animationId = requestAnimationFrame(animate);
    }
  }

  playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';

    if (isPlaying) {
      // If at the end, reset to beginning
      if (currentTime >= 1) {
        currentTime = 0;
        timeSlider.value = currentTime.toString();
        timeValue.textContent = currentTime.toFixed(2);
        onChange(currentTime);
      }
      animate();
    } else if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  });

  function update(newTime: number): void {
    currentTime = newTime;
    timeSlider.value = newTime.toString();
    timeValue.textContent = newTime.toFixed(2);
  }

  // Autostart if requested
  if (autostart) {
    isPlaying = true;
    playPauseBtn.textContent = 'Pause';
    animate();
  }

  return update;
}

import React from 'react';

import { MAX_NUM_SDE_STEPS } from '../constants';
import { Slider } from './slider';

interface NumStepsSliderProps {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function NumStepsSlider({
  value,
  onChange,
  label = 'Steps',
  min = 1,
  max = MAX_NUM_SDE_STEPS,
  step = 1
}: NumStepsSliderProps): React.ReactElement {
  return (
    <Slider
      label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    />
  );
}

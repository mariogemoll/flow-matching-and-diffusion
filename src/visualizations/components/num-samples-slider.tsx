// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

import { MAX_NUM_SAMPLES } from '../constants';
import { Slider } from './slider';

interface NumSamplesSliderProps {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function NumSamplesSlider({
  value,
  onChange,
  label = 'Samples',
  min = 10,
  max = MAX_NUM_SAMPLES,
  step = 10
}: NumSamplesSliderProps): React.ReactElement {
  return (
    <Slider
      label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      formatValue={(v) => v.toString()}
    />
  );
}

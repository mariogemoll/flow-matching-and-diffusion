// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

import { type SigmaScheduleName } from '../../math/schedules/sigma';
import { Slider } from './slider';

interface MaxSigmaSliderProps {
  value: number;
  onChange: (n: number) => void;
  schedule?: SigmaScheduleName;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function MaxSigmaSlider({
  value,
  onChange,
  schedule,
  label,
  min = 0.1,
  max = 5.0,
  step = 0.1
}: MaxSigmaSliderProps): React.ReactElement {
  const defaultLabel = schedule === 'constant' ? 'σ' : 'Max. σ';

  return (
    <Slider
      label={label ?? defaultLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    />
  );
}

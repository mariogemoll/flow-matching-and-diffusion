import React from 'react';

import { Button } from './button';
import { Slider } from './slider';

type ButtonBaseProps = Pick<
  React.ComponentProps<typeof Button>,
  'onClick' | 'className' | 'style'
>;

export function ResampleButton(props: ButtonBaseProps): React.ReactElement {
  return <Button {...props}>Resample</Button>;
}

interface SampleFrequencySliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function SampleFrequencySlider({
  value,
  onChange
}: SampleFrequencySliderProps): React.ReactElement {
  return (
    <Slider
      label="Sample freq."
      min={1}
      max={120}
      step={1}
      value={value}
      onChange={onChange}
    />
  );
}

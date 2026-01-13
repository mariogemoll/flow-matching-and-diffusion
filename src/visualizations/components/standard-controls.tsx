import React from 'react';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Slider } from './slider';

type ButtonBaseProps = Pick<
  React.ComponentProps<typeof Button>,
  'onClick' | 'className' | 'style'
>;

export function ResampleButton(props: ButtonBaseProps): React.ReactElement {
  return <Button {...props}>Resample</Button>;
}

export function ResampleTrajectoriesButton(props: ButtonBaseProps): React.ReactElement {
  return <Button {...props}>Resample</Button>;
}

interface CheckboxControlProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ShowPdfCheckbox(
  { checked, onChange }: CheckboxControlProps
): React.ReactElement {
  return <Checkbox label="PDF" checked={checked} onChange={onChange} />;
}

export function ShowSamplesCheckbox(
  { checked, onChange }: CheckboxControlProps
): React.ReactElement {
  return <Checkbox label="Samples" checked={checked} onChange={onChange} />;
}

export function ShowTrajectoriesCheckbox(
  { checked, onChange }: CheckboxControlProps
): React.ReactElement {
  return <Checkbox label="Trajectories" checked={checked} onChange={onChange} />;
}

export function ShowVectorFieldCheckbox(
  { checked, onChange }: CheckboxControlProps
): React.ReactElement {
  return <Checkbox label="Vector field" checked={checked} onChange={onChange} />;
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

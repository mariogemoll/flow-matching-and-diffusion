import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
  formatValue?: (v: number) => string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  className,
  formatValue = (v: number): string => v.toString()
}: SliderProps): React.JSX.Element {
  return (
    <div className={`viz-slider ${className ?? ''}`}>
      <span className="viz-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => { onChange(parseFloat(e.target.value)); }}
      />
      <span className="viz-slider-value">{formatValue(value)}</span>
    </div>
  );
}

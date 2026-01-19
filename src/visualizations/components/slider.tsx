import React, { useRef, useState } from 'react';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleValueClick = (): void => {
    setEditValue(value.toString());
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  };

  const handleInputBlur = (): void => {
    commitEdit();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const commitEdit = (): void => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(min, Math.min(max, numValue));
      onChange(clampedValue);
    }
    setIsEditing(false);
  };

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
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="viz-slider-value-edit"
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); }}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
        />
      ) : (
        <span className="viz-slider-value" onClick={handleValueClick}>
          {formatValue(value)}
        </span>
      )}
    </div>
  );
}

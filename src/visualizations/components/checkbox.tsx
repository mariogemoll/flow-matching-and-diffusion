import React from 'react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function Checkbox(
  { label, checked, onChange, className }: CheckboxProps
): React.JSX.Element {
  return (
    <label className={`viz-checkbox ${className ?? ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { onChange(e.target.checked); }}
      />
      <span>{label}</span>
    </label>
  );
}

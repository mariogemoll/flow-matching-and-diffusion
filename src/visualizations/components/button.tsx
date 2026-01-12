
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export function Button({ children, onClick, style, className }: ButtonProps): React.JSX.Element {
  return (
    <button
      className={`viz-button ${className ?? ''}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}

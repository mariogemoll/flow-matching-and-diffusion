// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

export function ViewContainer(
  {
    children,
    className,
    style
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }
): React.JSX.Element {
  const classes =
    className !== undefined && className !== ''
      ? `view-container ${className}`
      : 'view-container';
  return <div className={classes} style={style}>{children}</div>;
}

export function ViewControls(
  { children }: { children: React.ReactNode }
): React.JSX.Element {
  return <div className="view-controls">{children}</div>;
}

export function VisualizationControls(
  { children }: { children: React.ReactNode; }
): React.JSX.Element {
  return <div className="visualization-controls">{children}</div>;
}

export function ViewControlsGroup({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="view-controls-group">{children}</div>;
}

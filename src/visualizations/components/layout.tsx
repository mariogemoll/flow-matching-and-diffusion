// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

export function ViewContainer(
  { children }: { children: React.ReactNode }
): React.JSX.Element {
  return <div className="view-container">{children}</div>;
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

// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

interface EllipsisToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

export function EllipsisToggle({ expanded, onToggle }: EllipsisToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      className="ellipsis-toggle"
      aria-expanded={expanded}
      title={expanded ? 'Hide additional controls' : 'Show additional controls'}
      onClick={onToggle}
    >
      {expanded ? <CollapseIcon /> : <EllipsisIcon />}
    </button>
  );
}

function EllipsisIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 17 17" width="17" height="17" fill="#666" aria-hidden="true">
      <circle cx="3.5" cy="8.5" r="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <circle cx="13.5" cy="8.5" r="1.5" />
    </svg>
  );
}

function CollapseIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 17 17"
      width="17"
      height="17"
      fill="none"
      stroke="#666"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="11,4.5 6,8.5 11,12.5" />
    </svg>
  );
}

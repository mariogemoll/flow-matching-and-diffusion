// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

import { mountVisualization } from '../react-root';
import { CondPathVisualization } from './index';
import { CondPathView } from './views/path';

export function initConditionalPathVisualization(container: HTMLElement): () => void {
  const name = 'conditional-path';
  return mountVisualization(
    container,
    <CondPathVisualization name={name}>
      <CondPathView />
    </CondPathVisualization>,
    { name }
  );
}

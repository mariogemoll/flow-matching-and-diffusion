import React from 'react';

import { mountVisualization } from '../react-root';
import { CondPathVisualization } from './index';
import { CondOdeView } from './views/ode';
import { CondPathView } from './views/path';

export function initConditionalPathOdeVisualization(container: HTMLElement): () => void {
  const name = 'conditional-path-ode';
  return mountVisualization(
    container,
    <CondPathVisualization name={name}>
      <CondPathView />
      <CondOdeView />
    </CondPathVisualization>,
    { name }
  );
}

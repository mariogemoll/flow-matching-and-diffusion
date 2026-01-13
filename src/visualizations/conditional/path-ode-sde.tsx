import React from 'react';

import { mountVisualization } from '../react-root';
import { CondPathVisualization } from './index';
import { CondOdeView } from './views/ode';
import { CondPathView } from './views/path';
import { CondSdeView } from './views/sde';

export function initConditionalPathOdeSdeVisualization(container: HTMLElement): () => void {
  const name = 'conditional-path-ode-sde';
  return mountVisualization(
    container,
    <CondPathVisualization name={name}>
      <CondPathView />
      <CondOdeView />
      <CondSdeView />
    </CondPathVisualization>,
    { name }
  );
}

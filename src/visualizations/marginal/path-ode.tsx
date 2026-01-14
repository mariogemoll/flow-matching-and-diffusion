import React from 'react';

import { mountVisualization } from '../react-root';
import { MarginalPathVisualization } from './index';
import { MargOdeView } from './views/ode';
import { MargPathView } from './views/path';

export function initMarginalPathOdeVisualization(container: HTMLElement): () => void {
  const name = 'marginal-path-ode';
  return mountVisualization(
    container,
    <MarginalPathVisualization name={name}>
      <MargPathView />
      <MargOdeView />
    </MarginalPathVisualization>,
    { name }
  );
}

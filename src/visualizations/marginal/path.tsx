import React from 'react';

import { mountVisualization } from '../react-root';
import { MarginalPathVisualization } from './index';
import { MargPathView } from './views/path';

export function initMarginalPathVisualization(container: HTMLElement): () => void {
  const name = 'marginal-path';
  return mountVisualization(
    container,
    <MarginalPathVisualization name={name}>
      <MargPathView />
    </MarginalPathVisualization>,
    { name }
  );
}

// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React from 'react';

import { mountVisualization } from '../react-root';
import { MarginalPathVisualization } from './index';
import { MargOdeView } from './views/ode';
import { MargPathView } from './views/path';
import { MargSdeView } from './views/sde';

export function initMarginalPathOdeSdeVisualization(container: HTMLElement): () => void {
  const name = 'marginal-path-ode-sde';
  return mountVisualization(
    container,
    <MarginalPathVisualization name={name}>
      <MargPathView compact={false} />
      <MargOdeView compact={false} />
      <MargSdeView compact={false} />
    </MarginalPathVisualization>,
    { name }
  );
}

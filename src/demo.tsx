// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { el } from './util/dom';
import { initBrownianMotionVisualization } from './visualizations/brownian-motion';
import { initConditionalPathVisualization } from './visualizations/conditional/path';
import { initConditionalPathOdeVisualization } from './visualizations/conditional/path-ode';
import { initConditionalPathOdeSdeVisualization } from './visualizations/conditional/path-ode-sde';
import { initEulerMaruyamaMethodVisualization } from './visualizations/euler-maruyama-method';
import { initEulerMethodVisualization } from './visualizations/euler-method';
import { initMarginalPathVisualization } from './visualizations/marginal/path';
import { initMarginalPathOdeVisualization } from './visualizations/marginal/path-ode';
import { initMarginalPathOdeSdeVisualization } from './visualizations/marginal/path-ode-sde';
import { initVectorFieldVisualization } from './visualizations/vector-field';

initVectorFieldVisualization(el('[data-visualization="vector-field"]') as HTMLElement);
initEulerMethodVisualization(el('[data-visualization="euler-method"]') as HTMLElement);
initEulerMaruyamaMethodVisualization(
  el('[data-visualization="euler-maruyama-method"]') as HTMLElement
);
initBrownianMotionVisualization(el('[data-visualization="brownian-motion"]') as HTMLElement);
initConditionalPathVisualization(el('[data-visualization="conditional-path"]') as HTMLElement);
initConditionalPathOdeVisualization(
  el('[data-visualization="conditional-path-ode"]') as HTMLElement
);
initConditionalPathOdeSdeVisualization(
  el('[data-visualization="conditional-path-ode-sde"]') as HTMLElement
);
initMarginalPathVisualization(el('[data-visualization="marginal-path"]') as HTMLElement);
initMarginalPathOdeVisualization(el('[data-visualization="marginal-path-ode"]') as HTMLElement);
initMarginalPathOdeSdeVisualization(
  el('[data-visualization="marginal-path-ode-sde"]') as HTMLElement
);

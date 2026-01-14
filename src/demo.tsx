import { el } from './util/dom';
import { initBrownianMotionVisualization } from './visualizations/brownian-motion';
import { initConditionalPathVisualization } from './visualizations/conditional/path';
import { initConditionalPathOdeVisualization } from './visualizations/conditional/path-ode';
import { initConditionalPathOdeSdeVisualization } from './visualizations/conditional/path-ode-sde';
import { initDemoVisualization } from './visualizations/demo';
import { initDraggableDotDemoVisualization } from './visualizations/draggable-dot-demo';
import { initEulerMethodVisualization } from './visualizations/euler-method';
import { initMarginalPathVisualization } from './visualizations/marginal/path';
import { initMarginalPathOdeVisualization } from './visualizations/marginal/path-ode';
import { initMarginalPathOdeSdeVisualization } from './visualizations/marginal/path-ode-sde';
import { initVectorFieldVisualization } from './visualizations/vector-field';
import { initWebGlDemoVisualization } from './visualizations/webgl-demo';

initDemoVisualization(el('[data-visualization="demo"]') as HTMLElement);
initWebGlDemoVisualization(el('[data-visualization="webgl-demo"]') as HTMLElement);
initDraggableDotDemoVisualization(el('[data-visualization="draggable-dot-demo"]') as HTMLElement);
initVectorFieldVisualization(el('[data-visualization="vector-field"]') as HTMLElement);
initEulerMethodVisualization(el('[data-visualization="euler-method"]') as HTMLElement);
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

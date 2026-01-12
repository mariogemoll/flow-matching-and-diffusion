import { el } from './util/dom';
import { initDemoVisualization } from './visualizations/demo';
import { initDraggableDotDemoVisualization } from './visualizations/draggable-dot-demo';
import { initEulerMethodVisualization } from './visualizations/euler-method';
import { initVectorFieldVisualization } from './visualizations/vector-field';
import { initWebGlDemoVisualization } from './visualizations/webgl-demo';

initDemoVisualization(el('[data-visualization="demo"]') as HTMLElement);
initWebGlDemoVisualization(el('[data-visualization="webgl-demo"]') as HTMLElement);
initDraggableDotDemoVisualization(el('[data-visualization="draggable-dot-demo"]') as HTMLElement);
initVectorFieldVisualization(el('[data-visualization="vector-field"]') as HTMLElement);
initEulerMethodVisualization(el('[data-visualization="euler-method"]') as HTMLElement);

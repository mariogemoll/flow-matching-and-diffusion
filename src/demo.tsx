import { el } from './util/dom';
import { initDemoVisualization } from './visualizations/demo';
import { initWebGlDemoVisualization } from './visualizations/webgl-demo';

initDemoVisualization(el('[data-visualization="demo"]') as HTMLElement);
initWebGlDemoVisualization(el('[data-visualization="webgl-demo"]') as HTMLElement);

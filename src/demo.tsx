import { el } from './util/dom';
import { initDemoVisualization } from './visualizations/demo';

initDemoVisualization(el('[data-visualization="demo"]') as HTMLElement);

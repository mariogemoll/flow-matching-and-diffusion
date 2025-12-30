import { el } from 'web-ui-common/dom';

import { initEulerMethodWidget } from './vf';
import { createVectorFieldWidget } from './widgets/vector-field';

function run(): void {
  const widget1 = el(document, '#vf-widget-1') as HTMLElement;
  const widget2 = el(document, '#vf-widget-2') as HTMLElement;

  createVectorFieldWidget(widget1);
  initEulerMethodWidget(widget2);
}

document.addEventListener('DOMContentLoaded', () => {
  run();
});

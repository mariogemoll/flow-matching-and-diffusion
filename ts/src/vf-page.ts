import { el } from 'web-ui-common/dom';

import { initVectorFieldEulerWidget, initVectorFieldWidget } from './vf';

function run(): void {
  const widget1 = el(document, '#vf-widget-1') as HTMLElement;
  const widget2 = el(document, '#vf-widget-2') as HTMLElement;

  initVectorFieldWidget(widget1);
  initVectorFieldEulerWidget(widget2);
}

document.addEventListener('DOMContentLoaded', () => {
  run();
});

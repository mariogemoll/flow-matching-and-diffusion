import { el } from 'web-ui-common/dom';

function run(): void {
  const container = el(document, '#container') as HTMLElement;
  console.log(container);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    run();
  } catch(error: unknown) {
    console.error(error);
    alert(`Error during page setup: ${error instanceof Error ? error.message : String(error)}`);
  };
});

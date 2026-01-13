import React, { type ReactNode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ErrorBoundary } from './error-boundary';

const DEFAULT_PLACEHOLDER_SELECTOR = '.placeholder';
const DEFAULT_ROOT_SELECTOR = '.visualization';

export const VisualizationRootContext = React.createContext<HTMLElement | null>(
  null
);

function getOrCreateRoot(container: HTMLElement): HTMLElement {
  const existing = container.querySelector<HTMLElement>(DEFAULT_ROOT_SELECTOR);
  if (existing) { return existing; }
  const root = document.createElement('div');
  root.className = DEFAULT_ROOT_SELECTOR.slice(1);
  container.appendChild(root);
  return root;
}

function ensurePlaceholder(container: HTMLElement): void {
  const existing = container.querySelector(DEFAULT_PLACEHOLDER_SELECTOR);
  if (existing) { return; }
  const placeholder = document.createElement('div');
  placeholder.className = DEFAULT_PLACEHOLDER_SELECTOR.slice(1);
  placeholder.textContent = 'Loading visualization...';
  container.appendChild(placeholder);
}

function MountGate({
  container,
  name,
  children
}: {
  container: HTMLElement;
  name: string;
  children: ReactNode;
}): React.ReactElement {
  useEffect(() => {
    console.info(`${name} visualization started`);
    const placeholder = container.querySelector(DEFAULT_PLACEHOLDER_SELECTOR);
    placeholder?.remove();
    container.classList.add('is-ready');
  }, [container, name]);
  return React.createElement(React.Fragment, null, children);
}

export function mountVisualization(
  container: HTMLElement,
  element: ReactNode,
  options?: { name?: string }
): () => void {
  let root: Root | null = null;
  let mounted = false;
  let destroyed = false;
  let io: IntersectionObserver | null = null;
  const name = options?.name ?? 'visualization';

  ensurePlaceholder(container);

  const mount = (): void => {
    if (mounted || destroyed) { return; }
    mounted = true;
    const rootEl = getOrCreateRoot(container);
    root = createRoot(rootEl);
    root.render(
      React.createElement(
        VisualizationRootContext.Provider,
        { value: rootEl },
        React.createElement(ErrorBoundary, {
          name,
          children: React.createElement(MountGate, { container, name, children: element })
        })
      )
    );
  };

  if (typeof IntersectionObserver === 'undefined') {
    mount();
  } else {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            mount();
            io?.disconnect();
            io = null;
            break;
          }
        }
      },
      { threshold: 0.01 }
    );
    io.observe(container);
  }

  return () => {
    destroyed = true;
    io?.disconnect();
    io = null;
    root?.unmount();
    root = null;
  };
}

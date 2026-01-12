import React, { type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';

import { createVisualizationEngine, EngineContext, type Model } from './engine';
import { VisualizationRootContext } from './react-root';

interface VisualizationProviderProps {
  model: Model;
  name?: string;
  children: ReactNode;
}

export function VisualizationProvider(
  { model, name, children }: VisualizationProviderProps
): React.ReactElement {
  const rootEl = useContext(VisualizationRootContext);
  const visibleRef = useRef<boolean | null>(null);
  const nameRef = useRef(name ?? 'visualization');

  const engine = useMemo(() => createVisualizationEngine({ model }), [model]);

  useEffect((): (() => void) => () => { engine.destroy(); }, [engine]);

  useEffect(() => {
    nameRef.current = name ?? 'visualization';
  }, [name]);

  useEffect(() => {
    const originalPlay = engine.play;
    const originalPause = engine.pause;

    engine.play = (): void => {
      const wasPlaying = engine.frame.clock.playing;
      originalPlay();
      if (!wasPlaying && engine.frame.clock.playing) {
        console.info(`${nameRef.current} visualization play`);
      }
    };

    engine.pause = (): void => {
      const wasPlaying = engine.frame.clock.playing;
      originalPause();
      if (wasPlaying && !engine.frame.clock.playing) {
        console.info(`${nameRef.current} visualization pause`);
      }
    };

    return (): void => {
      engine.play = originalPlay;
      engine.pause = originalPause;
    };
  }, [engine]);

  useEffect(() => {
    if (!rootEl) { return; }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const isVisible = entry.isIntersecting;
          engine.setVisible(isVisible);
          if (visibleRef.current === isVisible) { continue; }
          if (visibleRef.current !== null) {
            console.info(
              `${nameRef.current} visualization ${isVisible ? 'resumed' : 'paused'}`
            );
          }
          visibleRef.current = isVisible;
        }
      },
      { threshold: 0.01 }
    );

    io.observe(rootEl);
    return (): void => { io.disconnect(); };
  }, [engine, rootEl]);

  return (
    <EngineContext.Provider value={engine}>
      {children}
    </EngineContext.Provider>
  );
}

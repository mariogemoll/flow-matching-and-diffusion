import { createContext, useContext } from 'react';

import { clamp01 } from '../util/misc';
import { DEFAULT_ANIMATION_SPEED, DEFAULT_LOOP_PAUSE } from './constants';

export interface Clock {
  t: number;
  playing: boolean;
  speed: number;
  scrubbing: boolean;
  loopPause: number;
}

export interface Frame<S = unknown> {
  clock: Clock;
  state: S;
}

export interface Model<S = unknown, A = unknown> {
  initState: () => S;
  tick?: (params: { frame: Frame<S>; dt: number }) => void;
  onLoop?: (params: { frame: Frame<S> }) => void;
  actions?: (engine: Engine<S, A>) => A;
}


export type DrawFn<S = unknown> = (frame: Frame<S>) => void;

export interface Engine<S = unknown, A = unknown> {
  frame: Frame<S>;
  register: (drawFn: DrawFn<S>) => () => void;
  setVisible: (isVisible: boolean) => void;
  renderOnce: () => void;
  invalidate: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number | string) => void;
  setLoopPause: (pause: number | string) => void;
  setTime: (t: number | string) => void;
  beginScrub: () => void;
  endScrub: () => void;
  actions: A;
  destroy: () => void;
}

export function createVisualizationEngine<S, A>({
  model
}: {
  model: Model<S, A>;
}): Engine<S, A> {
  const drawers = new Set<DrawFn<S>>();
  const clock: Clock = {
    t: 0,
    playing: true,
    speed: DEFAULT_ANIMATION_SPEED,
    scrubbing: false,
    loopPause: DEFAULT_LOOP_PAUSE
  };

  const state = model.initState();
  const frame: Frame<S> = { clock, state };

  let rafId = 0;
  let lastNow = 0;
  let visible = true;
  let pauseRemaining = 0;

  let invalidationRaf = 0;
  let invalidatePending = false;

  function renderOnce(): void {
    for (const draw of drawers) {draw(frame);}
  }

  function invalidate(): void {
    if (clock.playing) {return;}
    if (invalidatePending) {return;}
    invalidatePending = true;

    invalidationRaf = requestAnimationFrame(() => {
      invalidatePending = false;
      invalidationRaf = 0;
      renderOnce();
    });
  }

  function tick(nowMs: number): void {
    if (!clock.playing || !visible) {return;}

    if (!lastNow) {lastNow = nowMs;}
    const dt = Math.min(0.05, (nowMs - lastNow) / 1000);
    lastNow = nowMs;

    if (!clock.scrubbing) {
      if (pauseRemaining > 0) {
        pauseRemaining -= dt;
        if (pauseRemaining <= 0) {
          pauseRemaining = 0;
          clock.t = 0;
        }
      } else {
        clock.t += dt * clock.speed;
        if (clock.t >= 1) {
          clock.t = 1;
          if (model.onLoop) {model.onLoop({ frame });}
          pauseRemaining = clock.loopPause;
          if (pauseRemaining <= 0) {
            clock.t = 0;
          }
        }
      }
    }

    if (model.tick) {model.tick({ frame, dt });}

    renderOnce();
    rafId = requestAnimationFrame(tick);
  }

  function startRAF(): void {
    if (rafId) {return;}
    lastNow = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopRAF(): void {
    if (!rafId) {return;}
    cancelAnimationFrame(rafId);
    rafId = 0;
    lastNow = 0;
  }

  const engine: Engine<S, A> = {
    frame,
    register(drawFn) {
      drawers.add(drawFn);
      renderOnce();
      return () => drawers.delete(drawFn);
    },
    setVisible(isVisible) {
      visible = isVisible;
      if (!visible) {stopRAF();}
      else if (clock.playing) {startRAF();}
      if (visible && !clock.playing) {renderOnce();}
    },
    renderOnce,
    invalidate,
    play() {
      if (clock.playing) {return;}
      clock.playing = true;
      startRAF();
    },
    pause() {
      clock.playing = false;
      stopRAF();
      renderOnce();
    },
    togglePlay() {
      if (clock.playing) {engine.pause();} else {engine.play();}
    },
    setSpeed(speed) {
      clock.speed = Number(speed);
      if (!clock.playing) {renderOnce();}
    },
    setLoopPause(pause) {
      clock.loopPause = Number(pause);
    },
    setTime(t) {
      clock.t = clamp01(Number(t));
      if (!clock.playing && model.tick) {model.tick({ frame, dt: 0 });}
      renderOnce();
    },
    beginScrub() {
      clock.scrubbing = true;
      engine.pause();
    },
    endScrub() {
      clock.scrubbing = false;
      renderOnce();
    },
    actions: {} as A,
    destroy() {
      stopRAF();
      if (invalidationRaf) {cancelAnimationFrame(invalidationRaf);}
      invalidationRaf = 0;
      invalidatePending = false;
      drawers.clear();
    }
  };

  engine.actions = model.actions ? model.actions(engine) : ({} as A);
  startRAF();

  return engine;
}

export const EngineContext = createContext<Engine | null>(null);

export function useEngine<S = unknown, A = unknown>(): Engine<S, A> {
  const ctx = useContext(EngineContext);
  if (!ctx) {throw new Error('useEngine must be used within a VisualizationProvider');}
  return ctx as Engine<S, A>;
}

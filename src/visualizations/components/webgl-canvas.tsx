// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, {
  type CanvasHTMLAttributes,
  forwardRef,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../constants';
import { useDevicePixelRatio } from '../../hooks/use-device-pixel-ratio';
import { createWebGl, type WebGl } from '../../webgl';

export interface WebGlCanvasReadyEvent<T extends WebGl = WebGl> {
  canvas: HTMLCanvasElement;
  webGl: T;
}

export interface WebGlCanvasHandle<T extends WebGl = WebGl> {
  canvas: HTMLCanvasElement | null;
  webGl: T | null;
}

export interface WebGlCanvasProps<T extends WebGl = WebGl>
  extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'ref'> {
  width?: number;
  height?: number;
  webGlRef?: { current: T | null };
  onReady?: (event: WebGlCanvasReadyEvent<T>) => void;
  onCleanup?: (event: WebGlCanvasReadyEvent<T>) => void;
  xDomain: [number, number];
  yDomain: [number, number];
  /**
   * Optional function to setup the WebGL context with additional renderers or state.
   * Returns the specialized WebGl type T.
   */
  setup?: (webGl: WebGl) => T;
}



function WebGlCanvasInner<T extends WebGl = WebGl>(
  {
    width = CANVAS_WIDTH,
    height = CANVAS_HEIGHT,
    style,
    webGlRef: externalWebGlRef,
    onReady,
    onCleanup,
    xDomain,
    yDomain,
    setup,
    ...rest
  }: WebGlCanvasProps<T>,
  ref: Ref<WebGlCanvasHandle<T>>
): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webGlRef = useRef<T | null>(null);
  const handlersRef = useRef<{
    onReady?: (event: WebGlCanvasReadyEvent<T>) => void;
    onCleanup?: (event: WebGlCanvasReadyEvent<T>) => void;
      }>({ onReady, onCleanup });

  useEffect(() => {
    handlersRef.current.onReady = onReady;
    handlersRef.current.onCleanup = onCleanup;
  }, [onReady, onCleanup]);

  useImperativeHandle(
    ref,
    () => ({
      canvas: canvasRef.current,
      webGl: webGlRef.current
    })
  );

  const dpr = useDevicePixelRatio();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }

    let webGl: T;
    try {
      const baseWebGl = createWebGl(canvas, width, height, xDomain, yDomain);
      webGl = setup ? setup(baseWebGl) : (baseWebGl as unknown as T);
    } catch (e) {
      console.error('Failed to initialize WebGL:', e);
      return;
    }

    webGlRef.current = webGl;
    if (externalWebGlRef) {
      externalWebGlRef.current = webGl;
    }
    handlersRef.current.onReady?.({ canvas, webGl });

    return (): void => {
      const current = webGlRef.current;
      if (current) {
        handlersRef.current.onCleanup?.({ canvas, webGl: current });
      }
      webGlRef.current = null;
      if (externalWebGlRef) {
        externalWebGlRef.current = null;
      }
    };
  }, [externalWebGlRef, width, height, xDomain, yDomain, setup, dpr]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, display: 'block', ...(style ?? {}) }}
      {...rest}
    />
  );
}

// Cast the forwardRef result to a generic component signature
export const WebGlCanvas = forwardRef(WebGlCanvasInner) as <T extends WebGl = WebGl>(
  props: WebGlCanvasProps<T> & { ref?: Ref<WebGlCanvasHandle<T>> }
) => React.ReactElement;

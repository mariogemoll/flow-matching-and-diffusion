import React, {
  type CanvasHTMLAttributes,
  forwardRef,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../constants';
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
  xDomain?: [number, number];
  yDomain?: [number, number];
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
    xDomain = [-1, 1],
    yDomain = [-1, 1],
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
        // Only lose context if it's the valid context we created?
        // createWebGl doesn't return the context directly, it returns the object wrapper.
        // Assuming we can just call loseContext on it.
        current.gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      webGlRef.current = null;
      if (externalWebGlRef) {
        externalWebGlRef.current = null;
      }
    };
  }, [externalWebGlRef, width, height, xDomain, yDomain, setup]);

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

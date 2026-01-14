import type { GaussianMixture, RGBA } from '../../types';
import { createProgram } from './setup';
import fragmentSrc from './shaders/gaussian-mixture-pdf.frag';
import vertexSrc from './shaders/gaussian-mixture-pdf.vert';

const MAX_NUM_COMPONENTS = 20;

interface CachedProgram {
  program: WebGLProgram;
  refCount: number;
}

const programCache = new WeakMap<WebGLRenderingContext, CachedProgram>();

export interface GaussianMixturePdfRenderer {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  render(
    dataToClipMatrix: Float32Array,
    mixture: GaussianMixture,
    color: RGBA
  ): void;
  destroy(): void;
}

interface GaussianMixturePdfRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  positionLocation: number;
  numComponentsLocation: WebGLUniformLocation;
  meansLocation: WebGLUniformLocation;
  weightsLocation: WebGLUniformLocation;
  covariancesLocation: WebGLUniformLocation;
  canvasSizeLocation: WebGLUniformLocation;
  dataToClipMatrixLocation: WebGLUniformLocation;
  colorLocation: WebGLUniformLocation;
  meansBuffer: Float32Array;
  weightsBuffer: Float32Array;
  covariancesBuffer: Float32Array;
  lastVersion: number;
  lastMatrix: Float32Array | null;
  lastColor: RGBA | null;
}

export function createGaussianMixturePdfRenderer(
  gl: WebGLRenderingContext
): GaussianMixturePdfRenderer {
  let p: WebGLProgram;

  const cached = programCache.get(gl);
  if (cached) {
    p = cached.program;
    cached.refCount++;
  } else {
    p = createProgram(gl, vertexSrc, fragmentSrc);

    // Explicitly bind a_position to 0
    gl.bindAttribLocation(p, 0, 'a_position');
    gl.linkProgram(p);

    programCache.set(gl, { program: p, refCount: 1 });
  }

  const numComponentsLocation = gl.getUniformLocation(p, 'u_numComponents');
  const meansLocation = gl.getUniformLocation(p, 'u_means');
  const weightsLocation = gl.getUniformLocation(p, 'u_weights');
  const covariancesLocation = gl.getUniformLocation(p, 'u_covariances');
  const canvasSizeLocation = gl.getUniformLocation(p, 'u_canvasSize');
  const dataToClipMatrixLocation = gl.getUniformLocation(p, 'u_dataToClip');
  const colorLocation = gl.getUniformLocation(p, 'u_color');

  if (
    numComponentsLocation === null ||
    meansLocation === null ||
    weightsLocation === null ||
    covariancesLocation === null ||
    canvasSizeLocation === null ||
    dataToClipMatrixLocation === null ||
    colorLocation === null
  ) {
    throw new Error('Failed to get uniform locations for Gaussian mixture PDF renderer');
  }

  const positionBuffer = gl.createBuffer() as WebGLBuffer | null;
  if (positionBuffer === null) {
    throw new Error('Failed to create buffer');
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  const state: GaussianMixturePdfRendererState = {
    gl,
    program: p,
    positionBuffer,
    positionLocation: 0,
    numComponentsLocation,
    meansLocation,
    weightsLocation,
    covariancesLocation,
    canvasSizeLocation,
    dataToClipMatrixLocation,
    colorLocation,
    meansBuffer: new Float32Array(0),
    weightsBuffer: new Float32Array(0),
    covariancesBuffer: new Float32Array(0),
    lastVersion: -1,
    lastMatrix: null,
    lastColor: null
  };

  return {
    gl,
    program: p,
    render(
      dataToClipMatrix: Float32Array,
      mixture: GaussianMixture,
      color: RGBA
    ): void {
      const components = mixture.components;
      if (components.length === 0) { return; }
      if (components.length > MAX_NUM_COMPONENTS) {
        throw new Error(
          `Gaussian mixture exceeds MAX_NUM_COMPONENTS (${String(MAX_NUM_COMPONENTS)})`
        );
      }

      gl.useProgram(state.program);

      gl.bindBuffer(gl.ARRAY_BUFFER, state.positionBuffer);
      gl.enableVertexAttribArray(state.positionLocation);
      gl.vertexAttribPointer(state.positionLocation, 2, gl.FLOAT, false, 0, 0);

      if (state.lastVersion !== mixture.version) {
        const meansLength = components.length * 2;
        const weightsLength = components.length;
        const covariancesLength = components.length * 4;

        if (state.meansBuffer.length !== meansLength) {
          state.meansBuffer = new Float32Array(meansLength);
        }
        if (state.weightsBuffer.length !== weightsLength) {
          state.weightsBuffer = new Float32Array(weightsLength);
        }
        if (state.covariancesBuffer.length !== covariancesLength) {
          state.covariancesBuffer = new Float32Array(covariancesLength);
        }

        for (let i = 0; i < components.length; i++) {
          const component = components[i];
          const meanOffset = i * 2;
          state.meansBuffer[meanOffset] = component.mean[0];
          state.meansBuffer[meanOffset + 1] = component.mean[1];
          state.weightsBuffer[i] = component.weight;

          const covOffset = i * 4;
          state.covariancesBuffer[covOffset] = component.covariance[0][0];
          state.covariancesBuffer[covOffset + 1] = component.covariance[1][0];
          state.covariancesBuffer[covOffset + 2] = component.covariance[0][1];
          state.covariancesBuffer[covOffset + 3] = component.covariance[1][1];
        }

        gl.uniform1i(state.numComponentsLocation, components.length);
        gl.uniform2fv(state.meansLocation, state.meansBuffer);
        gl.uniform1fv(state.weightsLocation, state.weightsBuffer);
        gl.uniformMatrix2fv(state.covariancesLocation, false, state.covariancesBuffer);
        state.lastVersion = mixture.version;
      }

      gl.uniform2f(state.canvasSizeLocation, gl.canvas.width, gl.canvas.height);
      if (state.lastMatrix !== dataToClipMatrix) {
        gl.uniformMatrix3fv(state.dataToClipMatrixLocation, false, dataToClipMatrix);
        state.lastMatrix = dataToClipMatrix;
      }
      if (state.lastColor !== color) {
        gl.uniform4fv(state.colorLocation, color);
        state.lastColor = color;
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.disableVertexAttribArray(state.positionLocation);
    },
    destroy(): void {
      gl.deleteBuffer(state.positionBuffer);

      const cached = programCache.get(gl);
      if (cached) {
        cached.refCount--;
        if (cached.refCount <= 0) {
          gl.deleteProgram(state.program);
          programCache.delete(gl);
        }
      }
    }
  };
}

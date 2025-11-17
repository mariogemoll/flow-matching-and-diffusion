

import { addDot, addFrameUsingScales, getContext } from 'web-ui-common/canvas';
import { el } from 'web-ui-common/dom';
import type { Scale } from 'web-ui-common/types';
import { makeScale } from 'web-ui-common/util';

import { drawGaussianContours, type GaussianComponent } from './gaussian';

// TF.js is loaded from CDN in the HTML
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const tf: typeof import('@tensorflow/tfjs');

interface GaussianPdfResult {
  imageData: ImageData;
  probabilityGrid: number[][];
  maxValue: number;
}

interface GaussianMixturePdfResult {
  probabilityGrid: number[][];
  maxValue: number;
}

export function computeGaussianPdfTfjs(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  xScale: Scale,
  yScale: Scale,
  meanX: number,
  meanY: number,
  variance: number,
  withContours = false
): GaussianPdfResult {
  const width = canvas.width;
  const height = canvas.height;

  // Use tf.tidy to automatically clean up all intermediate tensors
  const { intensityData, maxValue, pdfData } = tf.tidy(() => {
    const pixelXs = tf.range(0, width, 1);
    const pixelYs = tf.range(0, height, 1);

    const [meshY, meshX] = tf.meshgrid(pixelYs, pixelXs);

    const dataXs = meshX.dataSync().map((px: number) => xScale.inverse(px));
    const dataYs = meshY.dataSync().map((py: number) => yScale.inverse(py));
    const dataXTensor = tf.tensor2d(dataXs, [width, height]);
    const dataYTensor = tf.tensor2d(dataYs, [width, height]);

    const dx = dataXTensor.sub(meanX);
    const dy = dataYTensor.sub(meanY);

    const dxSq = dx.square();
    const dySq = dy.square();
    const distSq = dxSq.add(dySq);
    const exponent = distSq.div(-2 * variance);
    const normalization = 1.0 / (2 * Math.PI * variance);
    const pdf = exponent.exp().mul(normalization);

    const maxValue = pdf.max().dataSync()[0];

    const normalized = pdf.div(maxValue);
    const intensity = normalized.mul(255);

    const intensityData = intensity.dataSync() as Float32Array;
    const pdfData = withContours
      ? (pdf.dataSync() as Float32Array)
      : (new Float32Array() as Float32Array);

    return { intensityData, pdfData, maxValue };
  });

  const imageData = ctx.createImageData(width, height);

  const probabilityGrid: number[][] = [];
  if (withContours && pdfData.length > 0) {
    for (let x = 0; x < width; x++) {
      probabilityGrid[x] = [];
      for (let y = 0; y < height; y++) {
        const idx = x * height + y;

        const val = pdfData[idx];
        probabilityGrid[x][y] = val;
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const idx = x * height + y;
      const pixelIdx = (y * width + x) * 4;

      const intensityVal = intensityData[idx];

      imageData.data[pixelIdx] = 30;
      imageData.data[pixelIdx + 1] = 150;
      imageData.data[pixelIdx + 2] = 255;
      imageData.data[pixelIdx + 3] = intensityVal;
    }
  }

  return { imageData, probabilityGrid, maxValue };
}

export function computeGaussianMixtureTfjs(
  xScale: Scale,
  yScale: Scale,
  components: GaussianComponent[],
  canvasWidth: number,
  canvasHeight: number,
  alpha = 1.0,
  beta = 0.0
): GaussianMixturePdfResult {
  return tf.tidy(() => {
    // Create pixel coordinate grids
    const pixelXs = tf.range(0, canvasWidth, 1);
    const pixelYs = tf.range(0, canvasHeight, 1);
    const [meshY, meshX] = tf.meshgrid(pixelYs, pixelXs);

    // Convert pixel coordinates to data coordinates
    const dataXs = meshX.dataSync().map((px: number) => xScale.inverse(px));
    const dataYs = meshY.dataSync().map((py: number) => yScale.inverse(py));
    const dataXTensor = tf.tensor2d(dataXs, [canvasWidth, canvasHeight]);
    const dataYTensor = tf.tensor2d(dataYs, [canvasWidth, canvasHeight]);

    // Accumulate probability from all mixture components
    let totalPdf = tf.zeros([canvasWidth, canvasHeight]);

    const alpha2 = alpha * alpha;
    const beta2 = beta * beta;

    for (const component of components) {
      const [meanX, meanY] = component.mean;
      const [[covXX, covXY], [covYX, covYY]] = component.covariance;

      // Apply marginal path transformation: A_t Σ_k A_t^T + Σ_ε
      // where A_t = α_t and Σ_ε = β_t² I
      const transformedMeanX = alpha * meanX;
      const transformedMeanY = alpha * meanY;
      const transformedCovXX = alpha2 * covXX + beta2;
      const transformedCovXY = alpha2 * covXY;
      const transformedCovYX = alpha2 * covYX;
      const transformedCovYY = alpha2 * covYY + beta2;

      // Compute determinant of transformed covariance
      const det = transformedCovXX * transformedCovYY - transformedCovXY * transformedCovYX;

      if (Math.abs(det) < 1e-10) {
        continue; // Skip degenerate covariance
      }

      // Compute inverse covariance matrix
      const invCovXX = transformedCovYY / det;
      const invCovXY = -transformedCovXY / det;
      const invCovYX = -transformedCovYX / det;
      const invCovYY = transformedCovXX / det;

      // Compute dx and dy
      const dx = dataXTensor.sub(transformedMeanX);
      const dy = dataYTensor.sub(transformedMeanY);

      // Compute quadratic form: (x-μ)^T Σ^(-1) (x-μ)
      const term1 = dx.mul(invCovXX).add(dy.mul(invCovYX)).mul(dx);
      const term2 = dx.mul(invCovXY).add(dy.mul(invCovYY)).mul(dy);
      const quadForm = term1.add(term2);

      // Compute Gaussian PDF
      const exponent = quadForm.mul(-0.5);
      const normalization = 1.0 / (2 * Math.PI * Math.sqrt(Math.abs(det)));
      const componentPdf = exponent.exp().mul(normalization).mul(component.weight);

      // Add to total
      const newTotal = totalPdf.add(componentPdf);
      totalPdf.dispose();
      totalPdf = newTotal;

      // Clean up intermediate tensors
      dx.dispose();
      dy.dispose();
      term1.dispose();
      term2.dispose();
      quadForm.dispose();
      exponent.dispose();
      componentPdf.dispose();
    }

    // Get max value and convert to array
    const maxValue = totalPdf.max().dataSync()[0];
    const pdfData = totalPdf.dataSync() as Float32Array;

    // Build probability grid
    const probabilityGrid: number[][] = [];
    for (let x = 0; x < canvasWidth; x++) {
      probabilityGrid[x] = [];
      for (let y = 0; y < canvasHeight; y++) {
        const idx = x * canvasHeight + y;
        probabilityGrid[x][y] = pdfData[idx];
      }
    }

    // Clean up
    pixelXs.dispose();
    pixelYs.dispose();
    meshX.dispose();
    meshY.dispose();
    dataXTensor.dispose();
    dataYTensor.dispose();
    totalPdf.dispose();

    return { probabilityGrid, maxValue };
  });
}

export function setUpGaussian(): void {
  const canvas = el(document, '#gaussian-canvas') as HTMLCanvasElement;
  const ctx = getContext(canvas);
  const xRange = [-4, 4] as [number, number];
  const yRange = [-3, 3] as [number, number];
  const margins = { top: 20, right: 20, bottom: 40, left: 40 };
  const xScale = makeScale(xRange, [margins.left, canvas.width - margins.right]);
  const yScale = makeScale(yRange, [canvas.height - margins.bottom, margins.top]);

  let mean: [number, number] = [0, 0];
  let isDragging = false;

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const result = computeGaussianPdfTfjs(canvas, ctx, xScale, yScale, mean[0], mean[1], 1, true);
    ctx.putImageData(result.imageData, 0, 0);
    drawGaussianContours(ctx, result.probabilityGrid, result.maxValue, canvas.width, canvas.height);

    addFrameUsingScales(ctx, xScale, yScale, 10);

    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);
    addDot(ctx, meanPixelX, meanPixelY, 6, '#FF5722');
  }

  function getMousePosition(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    return [pixelX, pixelY];
  }

  function isPointNear(px: number, py: number, x: number, y: number, threshold = 15): boolean {
    return Math.sqrt((px - x) ** 2 + (py - y) ** 2) < threshold;
  }

  canvas.addEventListener('mousedown', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const [pixelX, pixelY] = getMousePosition(e);
    const meanPixelX = xScale(mean[0]);
    const meanPixelY = yScale(mean[1]);

    if (isDragging) {
      mean = [xScale.inverse(pixelX), yScale.inverse(pixelY)];
      render();
    } else if (isPointNear(pixelX, pixelY, meanPixelX, meanPixelY)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    canvas.style.cursor = 'default';
  });

  render();
}

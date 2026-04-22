// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { loadLossHistory, type LossEntry } from '../flow-matching/loss-history';
import type { LayerVariable, Scalar, Tensor2D, TrainingState } from '../flow-matching/types';
import { makeMoons } from '../math/moons';
import { Button } from './components/button';
import { ViewContainer, ViewControls, ViewControlsGroup } from './components/layout';
import { mountVisualization } from './react-root';

/**
 * Minimal interface that any model must satisfy to be trained by
 * this visualization. Both `FlowMatchingModel` and `ScoreMatchingModel`
 * already match this shape.
 */
export interface TrainableModel {
  computeLoss(x: Tensor2D): Scalar;
  loadWeights(
    modelPath: string,
    onProgress?: (fraction: number) => void
  ): Promise<boolean>;
  getTrainableWeights(): LayerVariable[];
}

export interface TrainingController<M extends TrainableModel> {
  loadPretrainedModel: (
    onProgress?: (fraction: number) => void,
    options?: { announceModelReady?: boolean }
  ) => Promise<M | null>;
}

export interface TrainingControllerRef<M extends TrainableModel> {
  current: TrainingController<M> | null;
}

const BACKGROUND_COLOR = '#fff';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 300;
const NUM_EPOCHS = 1000;
const BATCH_SIZE = 256;
const MAX_LR = 0.001;
const MIN_LR = 0.0001;
const WARMUP_EPOCHS = 100;
const CLIP_NORM = 1.0;
const MOVING_AVERAGE_WINDOW = 20;
const STATUS_TEXT_STYLE: React.CSSProperties = {
  color: '#888',
  fontFamily: 'var(--viz-font-mono)',
  fontSize: '11px',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'pre',
  display: 'block',
  minHeight: '1.2em',
  minWidth: '38ch',
  textAlign: 'center'
};

interface PipelineState<M extends TrainableModel> {
  numEpochs: number;
  model: M;
  trainingState: TrainingState;
}

interface TrainingVisualizationProps<M extends TrainableModel> {
  modelFactory: () => M;
  onModelTrained?: (model: M) => void;
  onModelReset?: () => void;
  controllerRef?: TrainingControllerRef<M>;
  lossHistoryUrl?: string;
  weightsUrl?: string;
  lossChartYMin?: number;
}

const DEFAULT_LOSS_CHART_Y_MIN = 0.5;

interface TrainingTimingStats {
  completedEpochs: number;
  totalEpochMs: number;
  lastEpochStartedAt: number | null;
}

function formatEta(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    `${String(hours).padStart(2, '0')}h ` +
    `${String(minutes).padStart(2, '0')}m ` +
    `${String(seconds).padStart(2, '0')}s`
  );
}

function formatTrainingStatus(
  epochsCompleted: number,
  loss: number,
  etaMs: number
): string {
  const epochWidth = String(NUM_EPOCHS).length;
  const progress = ((epochsCompleted / NUM_EPOCHS) * 100).toFixed(1).padStart(5, ' ');
  const lossText = loss.toFixed(4).padStart(8, ' ');
  const etaText = formatEta(etaMs);

  return (
    `Epoch ${String(epochsCompleted).padStart(epochWidth, ' ')}/${String(NUM_EPOCHS)} ` +
    `(${progress}%)  Loss ${lossText}  ETA ${etaText}`
  );
}

function computeMovingAverage(history: LossEntry[], windowSize: number): LossEntry[] {
  const smoothedHistory: LossEntry[] = [];
  let runningLoss = 0;

  history.forEach(([epoch, loss], index) => {
    runningLoss += loss;
    if (index >= windowSize) {
      runningLoss -= history[index - windowSize][1];
    }

    const sampleCount = Math.min(index + 1, windowSize);
    smoothedHistory.push([epoch, runningLoss / sampleCount]);
  });

  return smoothedHistory;
}

export function TrainingVisualization<M extends TrainableModel>(
  {
    modelFactory,
    onModelTrained,
    onModelReset,
    controllerRef,
    lossHistoryUrl,
    weightsUrl,
    lossChartYMin = DEFAULT_LOSS_CHART_Y_MIN
  }: TrainingVisualizationProps<M>
): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timingStatsRef = useRef<TrainingTimingStats>({
    completedEpochs: 0,
    totalEpochMs: 0,
    lastEpochStartedAt: null
  });
  const stateRef = useRef<PipelineState<M>>({
    numEpochs: NUM_EPOCHS,
    model: modelFactory(),
    trainingState: 'not_started'
  });

  const [trainingState, setTrainingState] = useState<TrainingState>('not_started');
  const [statusText, setStatusText] = useState('');
  const lossHistoryRef = useRef<LossEntry[]>([]);
  const preloadPromiseRef = useRef<Promise<M | null> | null>(null);
  const initialLossHistoryRef = useRef<LossEntry[] | null>(null);

  const drawLossChart = useCallback((history: LossEntry[]) => {
    const canvas = canvasRef.current;
    if (!canvas) {return;}

    const ctx = canvas.getContext('2d');
    if (!ctx) {return;}

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (history.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Loss chart will appear here during training',
        canvas.width / 2,
        canvas.height / 2
      );
      return;
    }

    const margin = { top: 20, right: 32, bottom: 40, left: 52 };
    const width = canvas.width - margin.left - margin.right;
    const height = canvas.height - margin.top - margin.bottom;

    const losses = history.map(([, loss]) => loss);
    const smoothedHistory = computeMovingAverage(history, MOVING_AVERAGE_WINDOW);
    const maxLoss = Math.max(...losses);
    const yMin = lossChartYMin;
    const yMax = maxLoss + (maxLoss - yMin) * 0.1;

    const xScale = (epoch: number): number =>
      margin.left + (epoch / NUM_EPOCHS) * width;
    const yScale = (loss: number): number =>
      margin.top + height - ((loss - yMin) / (yMax - yMin)) * height;

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + height);
    ctx.lineTo(margin.left + width, margin.top + height);
    ctx.stroke();

    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const value = yMin + (yMax - yMin) * (i / yTicks);
      const y = yScale(value);
      ctx.fillText(value.toFixed(2), margin.left - 5, y + 4);

      ctx.strokeStyle = '#333333';
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + width, y);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const epoch = (NUM_EPOCHS * i) / xTicks;
      const x = xScale(epoch);
      ctx.fillText(String(Math.round(epoch)), x, margin.top + height + 20);
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '12px sans-serif';
    ctx.fillText('Epoch', margin.left + width / 2, canvas.height - 5);

    ctx.save();
    ctx.translate(15, margin.top + height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Loss', 0, 0);
    ctx.restore();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    history.forEach(([epoch, loss], i) => {
      const x = xScale(epoch);
      const y = yScale(loss);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    smoothedHistory.forEach(([epoch, loss], i) => {
      const x = xScale(epoch);
      const y = yScale(loss);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }, [lossChartYMin]);

  useEffect(() => {
    drawLossChart([]);
  }, [drawLossChart]);

  useEffect(() => {
    if (lossHistoryUrl === undefined || lossHistoryUrl === '') {
      return;
    }

    void (async(): Promise<void> => {
      try {
        const history = await loadLossHistory(lossHistoryUrl);
        initialLossHistoryRef.current = history;
        drawLossChart(history);
      } catch (error) {
        console.warn('Failed to load loss history:', error);
      }
    })();

    return undefined;
  }, [drawLossChart, lossHistoryUrl]);

  const loadPretrainedModel = useCallback(async(
    onProgress?: (fraction: number) => void,
    options?: { announceModelReady?: boolean }
  ): Promise<M | null> => {
    if (trainingState === 'completed') {
      return stateRef.current.model;
    }

    if (weightsUrl === undefined || weightsUrl === '') {
      setStatusText('No pre-trained model is configured.');
      return null;
    }

    if (preloadPromiseRef.current !== null) {
      return preloadPromiseRef.current;
    }

    const loadPromise = (async(): Promise<M | null> => {
      setStatusText('');

      const pretrainedModel = modelFactory();
      const loadedWeights = await pretrainedModel.loadWeights(weightsUrl, onProgress);

      if (!loadedWeights) {
        setStatusText('');
        return null;
      }

      stateRef.current.model = pretrainedModel;
      stateRef.current.trainingState = 'completed';
      setTrainingState('completed');
      if (options?.announceModelReady !== false) {
        onModelTrained?.(pretrainedModel);
      }

      const initialLossHistory = initialLossHistoryRef.current;
      if (initialLossHistory !== null) {
        lossHistoryRef.current = initialLossHistory;
        drawLossChart(initialLossHistory);
      }

      if (lossHistoryUrl === undefined || lossHistoryUrl === '') {
        setStatusText('');
        return pretrainedModel;
      }

      if (initialLossHistory !== null) {
        setStatusText('');
        return pretrainedModel;
      }

      try {
        const history = await loadLossHistory(lossHistoryUrl);
        initialLossHistoryRef.current = history;
        lossHistoryRef.current = history;
        drawLossChart(history);
        setStatusText('');
      } catch (error) {
        console.warn('Failed to load loss history:', error);
        setStatusText('');
      }

      return pretrainedModel;
    })();

    preloadPromiseRef.current = loadPromise;
    try {
      return await loadPromise;
    } finally {
      preloadPromiseRef.current = null;
    }
  }, [drawLossChart, lossHistoryUrl, modelFactory, onModelTrained, trainingState, weightsUrl]);

  useEffect(() => {
    if (controllerRef !== undefined) {
      controllerRef.current = { loadPretrainedModel };
    }
  }, [controllerRef, loadPretrainedModel]);

  const resetTraining = useCallback(() => {
    stateRef.current.model = modelFactory();
    stateRef.current.trainingState = 'not_started';
    preloadPromiseRef.current = null;
    timingStatsRef.current = {
      completedEpochs: 0,
      totalEpochMs: 0,
      lastEpochStartedAt: null
    };
    lossHistoryRef.current = [];
    setTrainingState('not_started');
    setStatusText('');
    drawLossChart([]);
    onModelReset?.();
  }, [drawLossChart, modelFactory, onModelReset]);

  const train = useCallback(async() => {
    const state = stateRef.current;

    console.log('Starting training...');

    const model = state.model;
    let optimizer = tf.train.adam(MIN_LR);

    const history: LossEntry[] = [...lossHistoryRef.current];
    const startEpoch = history.length;
    let epochStartedAt = timingStatsRef.current.lastEpochStartedAt ?? performance.now();
    timingStatsRef.current.lastEpochStartedAt = epochStartedAt;

    for (let epoch = startEpoch; epoch < NUM_EPOCHS; epoch++) {
      if (stateRef.current.trainingState !== 'training') {
        console.log('Training paused at epoch', epoch);
        stateRef.current.trainingState = 'paused';
        timingStatsRef.current.lastEpochStartedAt = null;
        setTrainingState('paused');
        if (onModelTrained) {
          onModelTrained(model);
        }
        return;
      }

      let currentLr: number;
      if (epoch < WARMUP_EPOCHS) {
        currentLr = MIN_LR + (MAX_LR - MIN_LR) * (epoch / WARMUP_EPOCHS);
      } else {
        const progress = (epoch - WARMUP_EPOCHS) / (NUM_EPOCHS - WARMUP_EPOCHS);
        currentLr = MIN_LR + 0.5 * (MAX_LR - MIN_LR) * (1 + Math.cos(Math.PI * progress));
      }

      if (epoch % 10 === 0 && epoch > 0) {
        optimizer.dispose();
        optimizer = tf.train.adam(currentLr);
      }

      const points = makeMoons(BATCH_SIZE, 0.05);
      const xData = new Float32Array(BATCH_SIZE * 2);
      for (let i = 0; i < BATCH_SIZE; i++) {
        xData[i * 2] = points.xs[i];
        xData[i * 2 + 1] = points.ys[i];
      }
      const x = tf.tensor2d(xData, [BATCH_SIZE, 2]);

      const { loss, clippedGrads } = tf.tidy(() => {
        const { value: loss, grads } = tf.variableGrads(() => model.computeLoss(x));

        const gradValues = Object.values(grads);
        let sumSquares = tf.scalar(0);
        for (const grad of gradValues) {
          sumSquares = tf.add(sumSquares, tf.sum(tf.square(grad)));
        }
        const globalNorm = tf.sqrt(sumSquares);
        const clipCoeff = tf.minimum(tf.scalar(1.0), tf.div(CLIP_NORM, tf.add(globalNorm, 1e-6)));

        const clippedGrads: Record<string, ReturnType<typeof tf.mul>> = {};
        Object.keys(grads).forEach(name => {
          clippedGrads[name] = tf.mul(grads[name], clipCoeff);
        });

        return {
          loss,
          clippedGrads
        };
      });

      // @ts-expect-error - TensorFlow.js type mismatch
      optimizer.applyGradients(clippedGrads);
      const lossValue = await loss.data();

      loss.dispose();
      Object.values(clippedGrads).forEach((grad) => { grad.dispose(); });

      history.push([epoch, lossValue[0]]);
      lossHistoryRef.current = history;

      const epochEndedAt = performance.now();
      timingStatsRef.current.completedEpochs += 1;
      timingStatsRef.current.totalEpochMs += epochEndedAt - epochStartedAt;
      timingStatsRef.current.lastEpochStartedAt = epochEndedAt;
      epochStartedAt = epochEndedAt;

      drawLossChart(history);

      const epochsCompleted = epoch + 1;
      const remainingEpochs = NUM_EPOCHS - epochsCompleted;
      const avgEpochMs =
        timingStatsRef.current.totalEpochMs / timingStatsRef.current.completedEpochs;
      const etaMs = remainingEpochs > 0 ? avgEpochMs * remainingEpochs : 0;
      setStatusText(formatTrainingStatus(epochsCompleted, lossValue[0], etaMs));

      x.dispose();

      await tf.nextFrame();
    }

    console.log('Training complete!');
    stateRef.current.trainingState = 'completed';
    timingStatsRef.current.lastEpochStartedAt = null;
    setTrainingState('completed');

    if (onModelTrained) {
      onModelTrained(model);
    }
  }, [drawLossChart, onModelTrained]);

  const handleTrainClick = useCallback(() => {
    if (trainingState === 'training') {
      stateRef.current.trainingState = 'paused';
      return;
    }

    if (trainingState === 'completed') {
      resetTraining();
    }

    stateRef.current.trainingState = 'training';
    setTrainingState('training');
    void train();
  }, [resetTraining, trainingState, train]);

  const getTrainButtonText = (): string => {
    switch (trainingState) {
    case 'training': return 'Pause';
    case 'paused': return 'Resume';
    case 'completed': return 'Retrain';
    default: return 'Train';
    }
  };

  return (
    <ViewContainer style={{ width: CANVAS_WIDTH }}>
      <canvas
        ref={canvasRef}
        className="view"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          display: 'block',
          backgroundColor: BACKGROUND_COLOR
        }}
      />
      <ViewControls>
        <ViewControlsGroup>
          <Button onClick={handleTrainClick}>
            {getTrainButtonText()}
          </Button>
        </ViewControlsGroup>
        <span style={STATUS_TEXT_STYLE}>
          {statusText}
        </span>
      </ViewControls>
    </ViewContainer>
  );
}

export function initTrainingVisualization<M extends TrainableModel>(
  container: HTMLElement,
  name: string,
  modelFactory: () => M,
  onModelTrained?: (model: M) => void,
  options?: {
    controllerRef?: TrainingControllerRef<M>;
    lossHistoryUrl?: string;
    onModelReset?: () => void;
    weightsUrl?: string;
    lossChartYMin?: number;
  }
): () => void {
  return mountVisualization(
    container,
    <TrainingVisualization<M>
      controllerRef={options?.controllerRef}
      lossChartYMin={options?.lossChartYMin}
      lossHistoryUrl={options?.lossHistoryUrl}
      modelFactory={modelFactory}
      onModelReset={options?.onModelReset}
      onModelTrained={onModelTrained}
      weightsUrl={options?.weightsUrl}
    />,
    { name }
  );
}

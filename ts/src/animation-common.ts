export const TOTAL_FRAMES = 100;

export interface FrameUpdateMessage {
  type: 'frame-update';
  frame: number;
}

export interface SetFrameMessage {
  type: 'set-frame';
  frame: number;
}

export interface PauseAnimationMessage {
  type: 'pause-animation';
}

export interface ResumeAnimationMessage {
  type: 'resume-animation';
}

export type AnimationControlMessage =
  | SetFrameMessage
  | PauseAnimationMessage
  | ResumeAnimationMessage;

export interface WorkerAnimationLoop {
  start(): void;
  pause(): void;
  resume(): void;
  setFrame(frame: number): void;
  getFrame(): number;
}

interface CreateWorkerAnimationLoopOptions {
  totalFrames?: number;
  render: (frame: number) => void;
  onFrame?: (frame: number) => void;
}

export function createWorkerAnimationLoop({
  totalFrames = TOTAL_FRAMES,
  render,
  onFrame
}: CreateWorkerAnimationLoopOptions): WorkerAnimationLoop {
  let frame = 0;
  let paused = false;
  let running = false;

  const normalizeFrame = (value: number): number => {
    const mod = value % totalFrames;
    return mod < 0 ? mod + totalFrames : mod;
  };

  const loop = (): void => {
    render(frame);

    if (!paused) {
      frame = normalizeFrame(frame + 1);
      onFrame?.(frame);
    }

    setTimeout(loop, 1000 / 60);
  };

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      loop();
    },
    pause(): void {
      paused = true;
    },
    resume(): void {
      paused = false;
    },
    setFrame(value: number): void {
      frame = normalizeFrame(value);
      render(frame);
      onFrame?.(frame);
    },
    getFrame(): number {
      return frame;
    }
  };
}

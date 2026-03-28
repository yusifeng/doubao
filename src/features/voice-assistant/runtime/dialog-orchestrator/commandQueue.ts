type QueuedCommand<T> = {
  label: string;
  fn: () => Promise<T>;
  timeoutMs: number;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const DEFAULT_COMMAND_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`dialog command timed out: ${label}`));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export class DialogCommandQueue {
  private queue: Array<QueuedCommand<unknown>> = [];
  private running = false;

  async enqueue<T>(
    label: string,
    fn: () => Promise<T>,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        label,
        fn: fn as () => Promise<unknown>,
        timeoutMs: options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  clear(reason: Error = new Error('dialog command queue cleared')): void {
    const pending = this.queue;
    this.queue = [];
    for (const command of pending) {
      command.reject(reason);
    }
  }

  private pump(): void {
    if (this.running) {
      return;
    }
    const command = this.queue.shift();
    if (!command) {
      return;
    }
    this.running = true;
    const commandPromise = Promise.resolve().then(() => command.fn());
    void withTimeout(commandPromise, command.timeoutMs, command.label)
      .then((value) => {
        command.resolve(value);
      })
      .catch((error) => {
        command.reject(error);
      });
    // Preserve strict control-plane serialization: a timeout rejects the caller,
    // but the queue does not advance until the underlying native command settles.
    void commandPromise
      .catch(() => {
        // Errors are already forwarded through the timed wrapper.
      })
      .finally(() => {
        this.running = false;
        this.pump();
      });
  }
}

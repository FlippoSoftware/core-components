type TimeoutId = number;

const EMPTY = 0 as TimeoutId;

/**
 * A `setTimeout` wrapper that keeps at most one pending call.
 */
export class Timeout {
    static create() {
        return new Timeout();
    }

    currentId: TimeoutId = EMPTY;

    /**
     * Executes `fn` after `delay`, clearing any previously scheduled call.
     */
    start(delay: number, fn: () => void) {
        this.clear();
        this.currentId = setTimeout(() => {
            this.currentId = EMPTY;
            fn();
        }, delay) as unknown as TimeoutId;
    }

    isStarted() {
        return this.currentId !== EMPTY;
    }

    clear = () => {
        if (this.currentId !== EMPTY) {
            clearTimeout(this.currentId);
            this.currentId = EMPTY;
        }
    };

    /**
     * Returns the cleanup, so it can be used directly as an effect.
     */
    disposeEffect = () => {
        return this.clear;
    };
}

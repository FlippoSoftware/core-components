import { AnimationFrame } from '~@timers/AnimationFrame';

import type { MutableRef } from '~@lib/types';

import { runOnceAnimationsFinish } from './animations';

/**
 * Calls `onComplete` once the element's animations finish after each change of `open`
 * (only if `open` did not change again meanwhile). Replacement for `useOpenChangeComplete`;
 * call {@link OpenChangeComplete.sync} with the current `open` value.
 */
export class OpenChangeComplete {
    private open: boolean | undefined;

    private abortController: AbortController | null = null;

    private readonly frame = new AnimationFrame();

    private readonly ref: MutableRef<HTMLElement | null>;

    private readonly onComplete: () => void;

    constructor(ref: MutableRef<HTMLElement | null>, onComplete: () => void) {
        this.ref = ref;
        this.onComplete = onComplete;
    }

    sync(open: boolean, enabled = true) {
        if (open === this.open) {
            return;
        }
        this.open = open;
        this.abort();

        if (!enabled) {
            return;
        }

        const abortController = new AbortController();
        this.abortController = abortController;
        runOnceAnimationsFinish(
            this.ref.current,
            () => {
                if (this.open === open) {
                    this.onComplete();
                }
            },
            { signal: abortController.signal, waitForNextTick: open, frame: this.frame }
        );
    }

    destroy() {
        this.abort();
    }

    private abort() {
        this.abortController?.abort();
        this.abortController = null;
        this.frame.cancel();
    }
}

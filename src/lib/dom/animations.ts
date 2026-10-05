import { AnimationFrame } from '~@timers/AnimationFrame';

export type RunOnceAnimationsFinishOptions = {
    /**
     * Aborts the pending call.
     */
    signal?: AbortSignal | null;
    /**
     * Wait for one more frame before reading the animations (needed for `open: true` animations).
     * @default false
     */
    waitForNextTick?: boolean;
    /**
     * Whether an aborted animation counts as finished.
     * @default true
     */
    treatAbortedAsFinished?: boolean;
    /**
     * Wraps the final call. React adapters pass `ReactDOM.flushSync` so that the browser
     * doesn't paint between the animation end and the unmount.
     */
    flush?: (fn: () => void) => void;
    /**
     * Frame scheduler to use; defaults to a new one.
     */
    frame?: AnimationFrame;
};

const runImmediately = (fn: () => void) => fn();

/**
 * Executes `fn` once all animations of `element` (CSS transitions, CSS and Web animations) finish.
 * Runs `fn` right away when animations are unsupported or disabled.
 */
export function runOnceAnimationsFinish(element: HTMLElement | null, fn: () => void, options: RunOnceAnimationsFinishOptions = {}) {
    const {
        signal = null,
        waitForNextTick = false,
        treatAbortedAsFinished = true,
        flush = runImmediately,
        frame = new AnimationFrame()
    } = options;

    frame.cancel();

    if (element == null) {
        return;
    }

    if (typeof element.getAnimations !== 'function' || globalThis.FLIPPO_UI_ANIMATIONS_DISABLED) {
        fn();
        return;
    }

    const isAborted = () => signal?.aborted;

    const exec = (retryOnEmpty: boolean) => {
        const animations = element.getAnimations();

        // If no animations are detected, the browser may not have started the CSS
        // transitions yet (e.g. for complex popups that take longer to process style
        // changes). Wait one more frame and try again before giving up.
        if (animations.length === 0 && retryOnEmpty) {
            frame.request(() => exec(false));
            return;
        }

        Promise.all(animations.map((animation) => animation.finished))
            .then(() => {
                if (!isAborted()) {
                    flush(fn);
                }
            })
            .catch(() => {
                if (treatAbortedAsFinished) {
                    if (!isAborted()) {
                        flush(fn);
                    }
                    return;
                }

                const current = element.getAnimations();
                if (current.length > 0 && current.some((animation) => animation.pending || animation.playState !== 'finished')) {
                    // Sometimes animations can be aborted because a property they depend on changes
                    // while the animation plays. In such cases, re-check if any new animations have started.
                    exec(false);
                }
            });
    };

    frame.request(() => {
        // `open: true` animations need to wait for the next tick to be detected
        if (waitForNextTick) {
            frame.request(() => exec(true));
        } else {
            exec(true);
        }
    });
}

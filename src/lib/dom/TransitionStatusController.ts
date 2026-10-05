import { Store } from '~@store/Store';
import { AnimationFrame } from '~@timers/AnimationFrame';

import type { TransitionStatus } from '~@lib/types';

export type TransitionStatusState = {
    mounted: boolean;
    transitionStatus: TransitionStatus;
};

export type TransitionStatusOptions = {
    /**
     * Enables the `'idle'` state between `'starting'` and `'ending'`.
     * @default false
     */
    enableIdleState?: boolean | undefined;
    /**
     * Sets `'ending'` on the next frame instead of synchronously.
     * @default false
     */
    deferEndingState?: boolean | undefined;
};

/**
 * Status of enter/exit CSS transitions for an element that mounts while open.
 * Framework-agnostic replacement for `useTransitionStatus`: `setOpen(open)` drives it, `setMounted(false)`
 * unmounts after the exit animation (see `runOnceAnimationsFinish`).
 */
export class TransitionStatusController {
    readonly store: Store<TransitionStatusState>;

    private options: TransitionStatusOptions;

    private open: boolean;

    private readonly frame = new AnimationFrame();

    constructor(open: boolean, options: TransitionStatusOptions = {}) {
        this.options = options;
        this.open = open;
        this.store = new Store<TransitionStatusState>({
            mounted: open,
            transitionStatus: open && options.enableIdleState ? 'idle' : undefined
        });
        this.scheduleFrame();
    }

    get state() {
        return this.store.state;
    }

    setOptions(options: TransitionStatusOptions) {
        this.options = options;
        this.sync();
    }

    setOpen(open: boolean) {
        if (open === this.open) {
            return;
        }
        this.open = open;
        this.sync();
    }

    setMounted = (mounted: boolean) => {
        this.store.set('mounted', mounted);
        this.sync();
    };

    destroy() {
        this.frame.cancel();
    }

    private sync() {
        const { enableIdleState = false, deferEndingState = false } = this.options;
        const open = this.open;
        const { mounted, transitionStatus } = this.store.state;

        if (open && !mounted) {
            this.store.update({ mounted: true, transitionStatus: 'starting' });
        } else if (!open && mounted && transitionStatus !== 'ending' && !deferEndingState) {
            this.store.set('transitionStatus', 'ending');
        } else if (!open && !mounted && transitionStatus === 'ending') {
            this.store.set('transitionStatus', undefined);
        }

        if (enableIdleState && open && this.store.state.mounted && this.store.state.transitionStatus !== 'idle') {
            this.store.set('transitionStatus', 'starting');
        }

        this.scheduleFrame();
    }

    private scheduleFrame() {
        const { enableIdleState = false, deferEndingState = false } = this.options;
        const open = this.open;
        const { mounted, transitionStatus } = this.store.state;

        this.frame.cancel();

        if (!open && mounted && transitionStatus !== 'ending' && deferEndingState) {
            this.frame.request(() => this.store.set('transitionStatus', 'ending'));
            return;
        }

        if (open && !enableIdleState) {
            // Avoid synchronous flushing here due to Firefox: https://github.com/mui/base-ui/pull/3424
            this.frame.request(() => this.store.set('transitionStatus', undefined));
            return;
        }

        if (open && enableIdleState) {
            this.frame.request(() => this.store.set('transitionStatus', 'idle'));
        }
    }
}

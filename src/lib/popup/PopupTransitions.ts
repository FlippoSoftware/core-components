import { runOnceAnimationsFinish } from '~@dom/animations';
import { AnimationFrame } from '~@timers/AnimationFrame';

import type { PopupStoreState } from './popupStoreState';
import type { AnyPopupStore } from './popupTriggers';

export type PopupTransitionsOptions = {
    /**
     * Called after the popup is unmounted.
     */
    onUnmount?: () => void;
    /**
     * Wraps the unmount after exit animations. React adapters pass `ReactDOM.flushSync`.
     */
    flush?: (fn: () => void) => void;
};

/**
 * Manages the mounted state and the enter/exit transition status of a popup.
 *
 * Framework-agnostic replacement for `useTransitionStatus` + `useOpenChangeComplete`
 * (as used by `useOpenStateTransitions`):
 * - opening mounts the popup with `transitionStatus: 'starting'` and clears it on the next frame;
 * - closing sets `transitionStatus: 'ending'`, waits for the popup's animations to finish
 *   and then unmounts it (unless `preventUnmountingOnClose` is set).
 */
export class PopupTransitions<State extends PopupStoreState<unknown>> {
    private readonly frame = new AnimationFrame();

    private readonly animationFrame = new AnimationFrame();

    private abortController: AbortController | null = null;

    private unsubscribe: (() => void) | null = null;

    private readonly store: AnyPopupStore<State>;

    private options: PopupTransitionsOptions;

    private getOpen: () => boolean;

    constructor(store: AnyPopupStore<State>, options: PopupTransitionsOptions = {}) {
        this.store = store;
        this.options = options;
        this.getOpen = () => store.select('open');
    }

    public setOptions(options: PopupTransitionsOptions) {
        this.options = options;
    }

    /**
     * Starts following the store's `open` state.
     *
     * @param getOpen Reads the open state to follow; defaults to the store's (a group may share one).
     * @returns A cleanup function (same as {@link destroy}).
     */
    public start(getOpen?: () => boolean): () => void {
        this.destroy();
        if (getOpen) {
            this.getOpen = getOpen;
        }

        let previous: boolean | undefined;
        const onChange = () => {
            const next = this.getOpen();
            if (next !== previous) {
                previous = next;
                this.handleOpenChange(next);
            }
        };

        onChange();
        this.unsubscribe = this.store.subscribe(onChange);

        return () => this.destroy();
    }

    /**
     * Unmounts the popup immediately, skipping exit animations.
     */
    public forceUnmount = () => {
        this.abort();
        this.store.update({
            activeTriggerId: null,
            activeTriggerElement: null,
            mounted: false,
            transitionStatus: undefined
        } as Partial<State>);
        this.options.onUnmount?.();
        this.store.context.onOpenChangeComplete?.(false);
    };

    public destroy() {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.frame.cancel();
        this.abort();
    }

    private handleOpenChange(open: boolean) {
        const { mounted, transitionStatus } = this.store.state;

        if (open) {
            this.abort();

            if (!mounted) {
                this.store.update({ mounted: true, transitionStatus: 'starting' } as Partial<State>);
            }

            this.frame.request(() => {
                this.store.set('transitionStatus', undefined);
            });
            return;
        }

        this.frame.cancel();

        if (!mounted) {
            if (transitionStatus === 'ending') {
                this.store.set('transitionStatus', undefined);
            }
            return;
        }

        if (transitionStatus !== 'ending') {
            this.store.set('transitionStatus', 'ending');
        }

        if (this.store.select('preventUnmountingOnClose')) {
            return;
        }

        this.abort();
        const abortController = new AbortController();
        this.abortController = abortController;

        runOnceAnimationsFinish(
            this.store.context.popupRef.current,
            () => {
                if (!this.getOpen()) {
                    this.forceUnmount();
                }
            },
            {
                signal: abortController.signal,
                treatAbortedAsFinished: false,
                flush: this.options.flush,
                frame: this.animationFrame
            }
        );
    }

    private abort() {
        this.abortController?.abort();
        this.abortController = null;
        this.animationFrame.cancel();
    }
}

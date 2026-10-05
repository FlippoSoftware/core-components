import { generateId } from '~@lib/generateId';
import { ownerDocument } from '~@lib/owner';
import { activeElement, contains, matchesFocusVisible } from '~@packages/floating-ui/utils/element';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { MutableRef } from '~@lib/types';

import { resolvePromiseOptions } from '../utils/resolvePromiseOptions';

import type { ToastAddOptions, ToastManager, ToastObject, ToastPromiseOptions, ToastUpdateOptions } from '../manager/ToastManager';

type TimerInfo = {
    timeout?: Timeout | undefined;
    start: number;
    delay: number;
    remaining: number;
    callback: () => void;
};

export type ToastProviderState = {
    toasts: ToastObject[];
    hovering: boolean;
    focused: boolean;
    prevFocusElement: HTMLElement | null;
};

export type ToastProviderOptions = {
    /**
     * Default auto-dismiss timeout (ms); `0` disables it.
     * @default 5000
     */
    timeout?: number | undefined;
    /**
     * Maximum number of visible toasts.
     * @default 3
     */
    limit?: number | undefined;
    toastManager?: ToastManager | undefined;
};

/**
 * State machine of `Toast.Provider` (its `store` holds the toasts): the list of toasts, their auto-dismiss timers (paused while
 * hovered, focused or the window is blurred), stacking limit and focus management on close.
 */
export class ToastProviderMachine {
    readonly store = new Store<ToastProviderState>({ toasts: [], hovering: false, focused: false, prevFocusElement: null });

    readonly viewportRef: MutableRef<HTMLElement | null> = { current: null };

    readonly windowFocusedRef: MutableRef<boolean> = { current: true };

    private options: ToastProviderOptions;

    private readonly timers = new Map<string, TimerInfo>();

    private isPaused = false;

    private unsubscribeManager: (() => void) | null = null;

    constructor(options: ToastProviderOptions = {}) {
        this.options = options;
        this.subscribeManager();
    }

    setOptions(options: ToastProviderOptions) {
        const managerChanged = options.toastManager !== this.options.toastManager;
        this.options = options;
        if (managerChanged) {
            this.subscribeManager();
        }
    }

    private get timeout() {
        return this.options.timeout ?? 5000;
    }

    private get limit() {
        return this.options.limit ?? 3;
    }

    /**
     * Whether the toasts have differing heights (the viewport is then always expanded).
     */
    get hasDifferingHeights(): boolean {
        const heights = this.store.state.toasts.map((toast) => toast.height).filter((height) => height !== 0);
        return heights.length > 0 && new Set(heights).size > 1;
    }

    get expanded(): boolean {
        return this.store.state.hovering || this.store.state.focused || this.hasDifferingHeights;
    }

    setToasts(updater: (toasts: ToastObject[]) => ToastObject[]) {
        const toasts = updater(this.store.state.toasts);
        if (toasts.length === 0) {
            this.store.update({ toasts, hovering: false, focused: false });
        } else {
            this.store.set('toasts', toasts);
        }
    }

    setHovering = (hovering: boolean) => {
        this.store.set('hovering', hovering);
    };

    setFocused = (focused: boolean) => {
        this.store.set('focused', focused);
    };

    setPrevFocusElement = (element: HTMLElement | null) => {
        this.store.set('prevFocusElement', element);
    };

    add = <Data extends object>(toast: ToastAddOptions<Data>): string => {
        const id = toast.id || generateId('toast');
        const toastToAdd: ToastObject = { ...(toast as ToastAddOptions), id, transitionStatus: 'starting' };
        const limit = this.limit;

        this.setToasts((prev) => {
            const updatedToasts = [toastToAdd, ...prev];
            const activeToasts = updatedToasts.filter((t) => t.transitionStatus !== 'ending');

            // Mark the oldest toasts for removal when over the limit.
            if (activeToasts.length > limit) {
                const oldestActiveToasts = activeToasts.slice(-(activeToasts.length - limit));
                return updatedToasts.map((t) => ({ ...t, limited: oldestActiveToasts.some((old) => old.id === t.id) }));
            }
            return updatedToasts.map((t) => ({ ...t, limited: false }));
        });

        const duration = toastToAdd.timeout ?? this.timeout;
        if (toastToAdd.type !== 'loading' && duration > 0) {
            this.scheduleTimer(id, duration, () => this.close(id));
        }
        this.pauseIfInactive();

        return id;
    };

    close = (toastId: string) => {
        const toastsBefore = this.store.state.toasts;
        const limit = this.limit;

        this.setToasts((prevToasts) => {
            const toastsWithEnding = prevToasts.map((toast) =>
                toast.id === toastId ? { ...toast, transitionStatus: 'ending' as const, height: 0 } : toast
            );
            const activeToasts = toastsWithEnding.filter((t) => t.transitionStatus !== 'ending');
            return toastsWithEnding.map((toast) =>
                toast.transitionStatus === 'ending' ? toast : { ...toast, limited: activeToasts.indexOf(toast) >= limit }
            );
        });

        const timer = this.timers.get(toastId);
        if (timer?.timeout) {
            timer.timeout.clear();
            this.timers.delete(toastId);
        }

        toastsBefore.find((t) => t.id === toastId)?.onClose?.();
        this.handleFocusManagement(toastId, toastsBefore);
    };

    remove = (toastId: string) => {
        const toast = this.store.state.toasts.find((t) => t.id === toastId);
        this.setToasts((prev) => prev.filter((t) => t.id !== toastId));
        toast?.onRemove?.();
    };

    update = <Data extends object>(id: string, updates: ToastUpdateOptions<Data>) => {
        this.setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, ...(updates as ToastUpdateOptions) } : toast)));
    };

    promise = <Value, Data extends object>(promiseValue: Promise<Value>, options: ToastPromiseOptions<Value, Data>): Promise<Value> => {
        // A loading toast does not auto-dismiss.
        const id = this.add({ ...resolvePromiseOptions(options.loading), type: 'loading' });

        const settle = (updates: ToastUpdateOptions, type: string) => {
            this.update(id, { ...updates, type });
            const timeout = updates.timeout ?? this.timeout;
            if (timeout > 0) {
                this.scheduleTimer(id, timeout, () => this.close(id));
            }
            this.pauseIfInactive();
        };

        const handledPromise = promiseValue
            .then((result) => {
                settle(resolvePromiseOptions(options.success, result), 'success');
                return result;
            })
            .catch((error) => {
                settle(resolvePromiseOptions(options.error, error), 'error');
                return Promise.reject(error);
            });

        // Private API used by `ToastManager` to get the handled promise back.
        if (Object.hasOwn(options, 'setPromise')) {
            (options as unknown as { setPromise: (promise: Promise<Value>) => void }).setPromise(handledPromise);
        }

        return handledPromise;
    };

    pauseTimers = () => {
        if (this.isPaused) {
            return;
        }
        this.isPaused = true;
        for (const timer of this.timers.values()) {
            if (timer.timeout) {
                timer.timeout.clear();
                const remaining = timer.delay - (Date.now() - timer.start);
                timer.remaining = remaining > 0 ? remaining : 0;
            }
        }
    };

    resumeTimers = () => {
        if (!this.isPaused) {
            return;
        }
        this.isPaused = false;
        for (const [id, timer] of this.timers) {
            timer.remaining = timer.remaining > 0 ? timer.remaining : timer.delay;
            timer.timeout ??= new Timeout();
            timer.timeout.start(timer.remaining, () => {
                this.timers.delete(id);
                timer.callback();
            });
            timer.start = Date.now();
        }
    };

    scheduleTimer = (id: string, delay: number, callback: () => void) => {
        const shouldStartActive = this.windowFocusedRef.current && !this.store.state.hovering && !this.store.state.focused;
        const timeout = shouldStartActive ? new Timeout() : undefined;
        timeout?.start(delay, () => {
            this.timers.delete(id);
            callback();
        });
        this.timers.set(id, { timeout, start: shouldStartActive ? Date.now() : 0, delay, remaining: delay, callback });
    };

    destroy() {
        this.unsubscribeManager?.();
        this.unsubscribeManager = null;
        for (const timer of this.timers.values()) {
            timer.timeout?.clear();
        }
        this.timers.clear();
    }

    private pauseIfInactive() {
        if (this.store.state.hovering || this.store.state.focused || !this.windowFocusedRef.current) {
            this.pauseTimers();
        }
    }

    private handleFocusManagement(toastId: string, toasts: ToastObject[]) {
        const viewport = this.viewportRef.current;
        const activeEl = viewport ? activeElement(ownerDocument(viewport)) : null;
        if (!viewport || !contains(viewport, activeEl) || !matchesFocusVisible(activeEl)) {
            return;
        }

        const currentIndex = toasts.findIndex((toast) => toast.id === toastId);
        const isAvailable = (toast: ToastObject | undefined) => toast !== undefined && toast.transitionStatus !== 'ending';

        // Try the next toast that isn't animating out, then go backwards.
        let nextToast = toasts.slice(currentIndex + 1).find(isAvailable);
        if (!nextToast) {
            nextToast = toasts.slice(0, Math.max(currentIndex, 0)).reverse().find(isAvailable);
        }

        if (nextToast) {
            nextToast.ref?.current?.focus();
        } else {
            this.store.state.prevFocusElement?.focus({ preventScroll: true });
        }
    }

    private subscribeManager() {
        this.unsubscribeManager?.();
        this.unsubscribeManager = null;
        const manager = this.options.toastManager;
        if (!manager) {
            return;
        }

        this.unsubscribeManager = manager.subscribe((event) => {
            switch (event.action) {
                case 'promise':
                    if (event.options.promise) {
                        this.promise(event.options.promise, event.options);
                    }
                    break;
                case 'update':
                    this.update(event.options.id, event.options);
                    break;
                case 'close':
                    this.close(event.options.id);
                    break;
                default:
                    this.add(event.options);
            }
        });
    }
}

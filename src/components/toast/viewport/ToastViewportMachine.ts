import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ownerDocument, ownerWindow } from '~@lib/owner';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { activeElement, contains, getTarget, matchesFocusVisible } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';
import { Timeout } from '~@timers/Timeout';

import type { Style } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ToastObject } from '../manager/ToastManager';
import type { ToastProviderMachine } from '../provider/ToastProviderMachine';

import { ToastViewportCssVars } from './ToastViewportCssVars';

export type ToastViewportState = {
    expanded: boolean;
};

type FocusLikeEvent = FocusEvent | { relatedTarget: EventTarget | null };

/**
 * State machine of `Toast.Viewport`: pauses timers while hovered/focused or when the window
 * is blurred, F6 to focus the viewport, and the focus guards returning focus to the page.
 */
export class ToastViewportMachine {
    private readonly provider: ToastProviderMachine;

    private handlingFocusGuard = false;

    private markedReadyForMouseLeave = false;

    private readonly windowFocusTimeout = new Timeout();

    private readonly keyDownEffect = new Effect(() => this.attachGlobalKeyDown());

    private readonly windowFocusEffect = new Effect(() => this.attachWindowFocusListeners());

    private readonly pointerDownEffect = new Effect(() => this.attachDocumentPointerDown());

    private readonly transitionsSettledEffect = new Effect(() => this.handleTransitionsSettled());

    private readonly unsubscribe: () => void;

    constructor(provider: ToastProviderMachine) {
        this.provider = provider;
        this.unsubscribe = provider.store.subscribe(() => this.sync());
        this.sync();
    }

    /**
     * Ref callback for the viewport element.
     */
    setElement = (element: HTMLElement | null) => {
        this.provider.viewportRef.current = element;
        this.sync();
    };

    getState(): ToastViewportState {
        return { expanded: this.provider.expanded };
    }

    static attrs(state: ToastViewportState) {
        return getStyleHookProps(state);
    }

    /**
     * Whether the adapter renders the focus guards (around the viewport and inside it, before and after the toasts).
     */
    shouldRenderFocusGuards(): boolean {
        const { toasts, prevFocusElement } = this.provider.store.state;
        return toasts.length > 0 && prevFocusElement !== null;
    }

    /**
     * High priority toasts announced through a visually hidden `role="alert"` region while the viewport isn't focused.
     */
    getHighPriorityAnnouncements(): ToastObject[] {
        const { toasts, focused } = this.provider.store.state;
        return focused ? [] : toasts.filter((toast) => toast.priority === 'high');
    }

    getViewportProps(elementProps: Props = {}): Props {
        const frontmostHeight = this.provider.store.state.toasts[0]?.height ?? 0;
        return mergeProps(
            {
                tabIndex: -1,
                role: 'region',
                'aria-live': 'polite',
                'aria-atomic': false,
                'aria-relevant': 'additions text',
                'aria-label': 'Notifications',
                onMouseEnter: this.handleMouseEnter,
                onMouseMove: this.handleMouseEnter,
                onMouseLeave: this.handleMouseLeave,
                onFocus: this.handleFocus,
                onBlur: this.handleBlur,
                onKeyDown: this.handleKeyDown,
                onClick: this.handleFocus
            },
            { style: { [ToastViewportCssVars.frontmostHeight]: frontmostHeight ? `${frontmostHeight}px` : undefined } as Style },
            elementProps
        );
    }

    /**
     * Focus handler of the focus guards.
     */
    onFocusGuardFocus = (event: FocusLikeEvent) => {
        const viewport = this.provider.viewportRef.current;
        if (!viewport) {
            return;
        }
        this.handlingFocusGuard = true;
        // If we're coming off the container, move to the first toast.
        if (event.relatedTarget === viewport) {
            this.provider.store.state.toasts[0]?.ref?.current?.focus();
        } else {
            this.provider.store.state.prevFocusElement?.focus({ preventScroll: true });
        }
    };

    destroy() {
        this.unsubscribe();
        this.keyDownEffect.destroy();
        this.windowFocusEffect.destroy();
        this.pointerDownEffect.destroy();
        this.transitionsSettledEffect.destroy();
        this.windowFocusTimeout.clear();
    }

    private sync() {
        const viewport = this.provider.viewportRef.current;
        const { toasts } = this.provider.store.state;
        const numToasts = toasts.length;
        this.keyDownEffect.sync([viewport, numToasts]);
        this.windowFocusEffect.sync([viewport, numToasts]);
        this.pointerDownEffect.sync([viewport, numToasts]);
        this.transitionsSettledEffect.sync([toasts.some((toast) => toast.transitionStatus === 'ending')]);
    }

    private attachGlobalKeyDown() {
        const viewport = this.provider.viewportRef.current;
        if (!viewport) {
            return;
        }
        const provider = this.provider;
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (provider.store.state.toasts.length === 0) {
                return;
            }
            // F6 force-focuses the viewport.
            if (event.key === 'F6' && event.target !== viewport) {
                event.preventDefault();
                provider.setPrevFocusElement(activeElement(ownerDocument(viewport)) as HTMLElement | null);
                viewport.focus();
                provider.pauseTimers();
                provider.setFocused(true);
            }
        };
        const win = ownerWindow(viewport);
        win.addEventListener('keydown', handleGlobalKeyDown);
        return () => win.removeEventListener('keydown', handleGlobalKeyDown);
    }

    private attachWindowFocusListeners() {
        const viewport = this.provider.viewportRef.current;
        const provider = this.provider;
        if (!viewport || provider.store.state.toasts.length === 0) {
            return;
        }
        const win = ownerWindow(viewport);

        const handleWindowBlur = (event: FocusEvent) => {
            if (event.target !== win) {
                return;
            }
            provider.windowFocusedRef.current = false;
            provider.pauseTimers();
        };

        const handleWindowFocus = (event: FocusEvent) => {
            if (event.relatedTarget || event.target === win) {
                return;
            }
            const target = getTarget(event) as Element | null;
            const activeEl = activeElement(ownerDocument(viewport));
            if (!contains(viewport, target) || !matchesFocusVisible(activeEl)) {
                provider.resumeTimers();
            }
            // Wait for the viewport's `focus` handler to run.
            this.windowFocusTimeout.start(0, () => {
                provider.windowFocusedRef.current = true;
            });
        };

        win.addEventListener('blur', handleWindowBlur, true);
        win.addEventListener('focus', handleWindowFocus, true);
        return () => {
            win.removeEventListener('blur', handleWindowBlur, true);
            win.removeEventListener('focus', handleWindowFocus, true);
        };
    }

    private attachDocumentPointerDown() {
        const viewport = this.provider.viewportRef.current;
        const provider = this.provider;
        if (!viewport || provider.store.state.toasts.length === 0) {
            return;
        }
        const doc = ownerDocument(viewport);
        const handlePointerDown = (event: PointerEvent) => {
            if (event.pointerType !== 'touch' || contains(viewport, getTarget(event) as Element | null)) {
                return;
            }
            provider.resumeTimers();
            provider.setHovering(false);
            provider.setFocused(false);
        };
        doc.addEventListener('pointerdown', handlePointerDown, true);
        return () => doc.removeEventListener('pointerdown', handlePointerDown, true);
    }

    /**
     * Once transitions have finished, applies a mouseleave that was blocked during them.
     */
    private handleTransitionsSettled() {
        const hasTransitioningToasts = this.provider.store.state.toasts.some((toast) => toast.transitionStatus === 'ending');
        if (!this.provider.windowFocusedRef.current || hasTransitioningToasts || !this.markedReadyForMouseLeave) {
            return;
        }
        this.provider.resumeTimers();
        this.provider.setHovering(false);
        this.markedReadyForMouseLeave = false;
    }

    private readonly handleMouseEnter = () => {
        this.provider.pauseTimers();
        this.provider.setHovering(true);
        this.markedReadyForMouseLeave = false;
    };

    private readonly handleMouseLeave = () => {
        if (this.provider.store.state.toasts.some((toast) => toast.transitionStatus === 'ending')) {
            // When swiping to dismiss, wait until the transitions have settled
            // to avoid the viewport collapsing while the user is interacting.
            this.markedReadyForMouseLeave = true;
        } else {
            this.provider.resumeTimers();
            this.provider.setHovering(false);
        }
    };

    private readonly handleFocus = () => {
        const provider = this.provider;
        if (this.handlingFocusGuard) {
            this.handlingFocusGuard = false;
            return;
        }
        if (provider.store.state.focused) {
            return;
        }
        // If the window was previously blurred, the focus must be visible to pause the timers,
        // since for pointers it's unexpected that focus is considered inside the viewport at this point.
        const activeEl = activeElement(ownerDocument(provider.viewportRef.current));
        if (!provider.windowFocusedRef.current && !matchesFocusVisible(activeEl)) {
            return;
        }
        if (matchesFocusVisible(activeEl)) {
            provider.setFocused(true);
            provider.pauseTimers();
        }
    };

    private readonly handleBlur = (event: FocusLikeEvent) => {
        const provider = this.provider;
        if (!provider.store.state.focused || contains(provider.viewportRef.current, event.relatedTarget as Element | null)) {
            return;
        }
        provider.setFocused(false);
        provider.resumeTimers();
    };

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Tab' && event.shiftKey && event.target === this.provider.viewportRef.current) {
            event.preventDefault();
            this.provider.store.state.prevFocusElement?.focus({ preventScroll: true });
            this.provider.resumeTimers();
        }
    };
}

import { getWindow, isElement, isHTMLElement } from '@floating-ui/utils/dom';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { isMac, isSafari } from '~@lib/detectBrowser';
import { Timeout } from '~@timers/Timeout';

import type { FloatingOpenChangeDetails } from '~@events/changeEventDetails';

import { createAttribute } from '../utils/createAttribute';
import { Effect } from '../utils/Effect';
import { activeElement, contains, getDocument, getTarget, isTypeableElement, matchesFocusVisible } from '../utils/element';
import { getNativeEvent } from '../utils/event';

import type { FloatingRootStore } from '../FloatingRootStore';
import type { InteractionProps } from '../types';

const isMacSafari = isMac && isSafari;

export type FocusInteractionOptions = {
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Whether the open state only changes if the focus event is considered
     * visible (`:focus-visible` CSS selector).
     * @default true
     */
    visibleOnly?: boolean | undefined;
    /**
     * Additional check to determine if blur should be blocked.
     * Return `true` to prevent closing on blur (e.g. for Tooltip.Multiple groups).
     */
    shouldBlockBlurClose?: ((relatedTarget: Element | null) => boolean) | undefined;
};

/**
 * Opens the floating element while the reference element has focus, like CSS `:focus`.
 * Replacement for `useFocus`.
 */
export class FocusInteraction {
    private options: FocusInteractionOptions;

    private readonly store: FloatingRootStore;

    private blockFocus = false;

    private keyboardModality = true;

    private readonly timeout = new Timeout();

    private readonly windowListeners: Effect;

    private readonly openChangeListener: Effect;

    private readonly unsubscribe: () => void;

    private readonly reference: Record<string, unknown>;

    constructor(store: FloatingRootStore, options: FocusInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.windowListeners = new Effect(() => this.attachWindowListeners());
        this.openChangeListener = new Effect(() => this.attachOpenChangeListener());
        this.reference = {
            onMouseLeave: this.onMouseLeave,
            onFocus: this.onFocus,
            onBlur: this.onBlur
        };
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: FocusInteractionOptions) {
        this.options = options;
        this.sync();
    }

    getProps(): InteractionProps {
        return this.options.enabled === false ? {} : { reference: this.reference, trigger: this.reference };
    }

    destroy() {
        this.unsubscribe();
        this.windowListeners.destroy();
        this.openChangeListener.destroy();
        this.timeout.clear();
    }

    private sync() {
        const enabled = this.options.enabled !== false;
        this.windowListeners.sync([enabled, this.store.select('domReferenceElement')]);
        this.openChangeListener.sync([enabled]);
    }

    private attachWindowListeners() {
        if (this.options.enabled === false) {
            return;
        }

        const domReference = this.store.select('domReferenceElement');
        const win = getWindow(domReference);

        // If the reference was focused and the user left the tab/window, and the
        // floating element was not open, the focus should be blocked when they
        // return to the tab/window.
        const onBlur = () => {
            if (!this.store.select('open') && isHTMLElement(domReference) && domReference === activeElement(getDocument(domReference))) {
                this.blockFocus = true;
            }
        };

        const onKeyDown = () => {
            this.keyboardModality = true;
        };

        const onPointerDown = () => {
            this.keyboardModality = false;
        };

        win.addEventListener('blur', onBlur);

        if (isMacSafari) {
            win.addEventListener('keydown', onKeyDown, true);
            win.addEventListener('pointerdown', onPointerDown, true);
        }

        return () => {
            win.removeEventListener('blur', onBlur);

            if (isMacSafari) {
                win.removeEventListener('keydown', onKeyDown, true);
                win.removeEventListener('pointerdown', onPointerDown, true);
            }
        };
    }

    private attachOpenChangeListener() {
        if (this.options.enabled === false) {
            return;
        }

        const { events } = this.store.context;
        const onOpenChangeLocal = (details: FloatingOpenChangeDetails) => {
            if (details.reason === REASONS.triggerPress || details.reason === REASONS.escapeKey) {
                this.blockFocus = true;
            }
        };

        events.on('openchange', onOpenChangeLocal);
        return () => {
            events.off('openchange', onOpenChangeLocal);
        };
    }

    private readonly onMouseLeave = () => {
        this.blockFocus = false;
    };

    private readonly onFocus = (event: FocusEvent) => {
        if (this.blockFocus) {
            return;
        }

        const nativeEvent = getNativeEvent(event);
        const target = getTarget(nativeEvent);

        if (this.options.visibleOnly !== false && isElement(target)) {
            // Safari fails to match `:focus-visible` if focus was initially
            // outside the document.
            if (isMacSafari && !event.relatedTarget) {
                if (!this.keyboardModality && !isTypeableElement(target)) {
                    return;
                }
            } else if (!matchesFocusVisible(target)) {
                return;
            }
        }

        this.store.setOpen(true, createChangeEventDetails(REASONS.triggerFocus, nativeEvent, event.currentTarget as HTMLElement));
    };

    private readonly onBlur = (event: FocusEvent) => {
        this.blockFocus = false;
        const relatedTarget = event.relatedTarget;
        const nativeEvent = getNativeEvent(event);

        // Hit the non-modal focus management portal guard. Focus will be
        // moved into the floating element immediately after.
        const movedToFocusGuard =
            isElement(relatedTarget) &&
            relatedTarget.hasAttribute(createAttribute('focus-guard')) &&
            relatedTarget.getAttribute('data-type') === 'outside';

        // Wait for the window blur listener to fire.
        this.timeout.start(0, () => {
            const domReference = this.store.select('domReferenceElement');
            const activeEl = activeElement(domReference ? domReference.ownerDocument : document);

            // Focus left the page, keep it open.
            if (!relatedTarget && activeEl === domReference) {
                return;
            }

            // When focusing the reference element (e.g. regular click), then
            // clicking into the floating element, prevent it from hiding.
            // Note: it must be focusable, e.g. `tabindex="-1"`.
            if (
                contains(this.store.context.dataRef.current.floatingContext?.elements.floating, activeEl) ||
                contains(domReference, activeEl) ||
                movedToFocusGuard
            ) {
                return;
            }

            // If the next focused element is one of the triggers, do not close
            // the floating element. The focus handler of that trigger will
            // handle the open state.
            if (this.store.context.triggerElements.hasElement(relatedTarget as Element)) {
                return;
            }

            // Additional check for grouped elements (e.g., Tooltip.Multiple)
            if (this.options.shouldBlockBlurClose?.(relatedTarget as Element | null)) {
                return;
            }

            this.store.setOpen(false, createChangeEventDetails(REASONS.triggerFocus, nativeEvent));
        });
    };
}

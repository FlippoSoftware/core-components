import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { AnimationFrame } from '~@timers/AnimationFrame';
import { Timeout } from '~@timers/Timeout';

import { isTypeableElement } from '../utils/element';
import { getNativeEvent, isMouseLikePointerType } from '../utils/event';

import type { FloatingRootStore } from '../FloatingRootStore';
import type { InteractionProps } from '../types';

export type ClickInteractionOptions = {
    /**
     * Whether the interaction is enabled.
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * The type of event to use to determine a “click” with mouse input.
     * Keyboard clicks work as normal.
     * @default 'click'
     */
    event?: 'click' | 'mousedown' | 'mousedown-only' | undefined;
    /**
     * Whether to toggle the open state with repeated clicks.
     * @default true
     */
    toggle?: boolean | undefined;
    /**
     * Whether to ignore the logic for mouse input (for example, if hover is also used).
     * @default false
     */
    ignoreMouse?: boolean | undefined;
    /**
     * If already open from another event such as hover, determines whether to keep
     * the floating element open when clicking the reference element for the first time.
     * @default true
     */
    stickIfOpen?: boolean | undefined;
    /**
     * Touch-only delay (ms) before opening. Useful to allow mobile viewport/keyboard to settle.
     * @default 0
     */
    touchOpenDelay?: number | undefined;
};

type PointerType = 'mouse' | 'pen' | 'touch';

/**
 * Opens or closes the floating element when clicking the reference element.
 * Replacement for `useClick`.
 */
export class ClickInteraction {
    private options: ClickInteractionOptions;

    private pointerType: PointerType | undefined;

    private readonly frame = new AnimationFrame();

    private readonly touchOpenTimeout = new Timeout();

    private readonly store: FloatingRootStore;

    private readonly reference: Record<string, unknown>;

    constructor(store: FloatingRootStore, options: ClickInteractionOptions = {}) {
        this.store = store;
        this.options = options;
        this.reference = {
            onPointerDown: this.onPointerDown,
            onMouseDown: this.onMouseDown,
            onClick: this.onClick,
            onKeyDown: this.onKeyDown
        };
    }

    setOptions(options: ClickInteractionOptions) {
        this.options = options;
    }

    getProps(): InteractionProps {
        return this.options.enabled === false ? {} : { reference: this.reference };
    }

    destroy() {
        this.frame.cancel();
        this.touchOpenTimeout.clear();
    }

    private get settings() {
        const { event = 'click', toggle = true, ignoreMouse = false, stickIfOpen = true, touchOpenDelay = 0 } = this.options;
        return { event, toggle, ignoreMouse, stickIfOpen, touchOpenDelay };
    }

    private readonly onPointerDown = (event: PointerEvent) => {
        this.pointerType = event.pointerType as PointerType;
    };

    private readonly onKeyDown = () => {
        this.pointerType = undefined;
    };

    private computeNextOpen(currentTarget: EventTarget | null, stickTypes: readonly string[]) {
        const { toggle, stickIfOpen } = this.settings;
        const open = this.store.select('open');
        const openEvent = this.store.context.dataRef.current.openEvent;
        const openEventType = openEvent?.type;
        const hasClickedOnInactiveTrigger = this.store.select('domReferenceElement') !== currentTarget;
        return (
            (open && hasClickedOnInactiveTrigger) ||
            !(open && toggle && (openEvent && stickIfOpen ? stickTypes.includes(openEventType ?? '') : true))
        );
    }

    private commit(nextOpen: boolean, details: ReturnType<typeof createChangeEventDetails<typeof REASONS.triggerPress>>) {
        const { touchOpenDelay } = this.settings;
        if (nextOpen && this.pointerType === 'touch' && touchOpenDelay > 0) {
            this.touchOpenTimeout.start(touchOpenDelay, () => {
                this.store.setOpen(true, details);
            });
        } else {
            this.store.setOpen(nextOpen, details);
        }
    }

    private readonly onMouseDown = (event: MouseEvent) => {
        const { event: eventOption, ignoreMouse } = this.settings;
        const nativeEvent = getNativeEvent(event);

        // Ignore all buttons except for the "main" button.
        // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
        if (event.button !== 0 || eventOption === 'click' || (isMouseLikePointerType(this.pointerType, true) && ignoreMouse)) {
            return;
        }

        const nextOpen = this.computeNextOpen(event.currentTarget, ['click', 'mousedown']);

        // Animations sometimes won't run on a typeable element if using a rAF.
        // Focus is always set on these elements. For touch, we may delay opening.
        if (isTypeableElement(nativeEvent.target)) {
            this.commit(nextOpen, createChangeEventDetails(REASONS.triggerPress, nativeEvent, nativeEvent.target as HTMLElement));
            return;
        }

        // Capture the currentTarget before the rAF (frameworks may reset it after the handler completes).
        const eventCurrentTarget = event.currentTarget as HTMLElement;

        // Wait until focus is set on the element. This is an alternative to
        // `event.preventDefault()` to avoid :focus-visible from appearing when using a pointer.
        this.frame.request(() => {
            this.commit(nextOpen, createChangeEventDetails(REASONS.triggerPress, nativeEvent, eventCurrentTarget));
        });
    };

    private readonly onClick = (event: MouseEvent) => {
        const { event: eventOption, ignoreMouse } = this.settings;

        if (eventOption === 'mousedown-only') {
            return;
        }

        if (eventOption === 'mousedown' && this.pointerType) {
            this.pointerType = undefined;
            return;
        }

        if (isMouseLikePointerType(this.pointerType, true) && ignoreMouse) {
            return;
        }

        const nextOpen = this.computeNextOpen(event.currentTarget, ['click', 'mousedown', 'keydown', 'keyup']);
        this.commit(nextOpen, createChangeEventDetails(REASONS.triggerPress, getNativeEvent(event), event.currentTarget as HTMLElement));
    };
}

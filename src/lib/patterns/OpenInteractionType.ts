import { Store } from '~@store/Store';

import type { Interaction } from '~@lib/types';

/**
 * Remembers which kind of interaction (mouse, touch, pen, keyboard) opened a popup.
 * Replacement for `useOpenInteractionType` + `useEnhancedClickHandler`.
 */
export class OpenInteractionType {
    readonly store = new Store<{ openMethod: Interaction | null }>({ openMethod: null });

    private lastInteractionType: Interaction = '';

    private open: boolean;

    constructor(open = false) {
        this.open = open;
    }

    setOpen(open: boolean) {
        this.open = open;
    }

    get openMethod() {
        return this.store.state.openMethod;
    }

    reset = () => {
        this.store.set('openMethod', null);
    };

    /**
     * Props for the trigger element.
     */
    readonly triggerProps = {
        onPointerDown: (event: PointerEvent) => {
            if (event.defaultPrevented) {
                return;
            }
            this.lastInteractionType = event.pointerType as Interaction;
        },
        onClick: (event: MouseEvent | PointerEvent) => {
            let interactionType: Interaction;
            // Same detection as the React hook: a click with `detail` is attributed to the keyboard.
            if (event.detail) {
                interactionType = 'keyboard';
            } else if ('pointerType' in event) {
                interactionType = event.pointerType as Interaction;
            } else {
                interactionType = this.lastInteractionType;
            }

            if (!this.open) {
                this.store.set('openMethod', interactionType);
            }

            this.lastInteractionType = '';
        }
    };
}

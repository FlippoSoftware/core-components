import { ownerDocument } from '~@lib/owner';

import type { PreventableEvent } from '~@props/mergeProps';

type MouseLikeEvent = { currentTarget: EventTarget | null };

/**
 * Lets a trigger open on `mousedown` while ignoring the `click` that follows the same press.
 * Replacement for `useMixedToggleClickHandler`.
 */
export class MixedToggleClickHandler {
    private ignoreClick = false;

    /**
     * @param open Whether the popup is open.
     * @param mouseDownAction What `mousedown` does (`open` ignores the click while closed, `close` while open).
     */
    getProps(open: boolean, mouseDownAction: 'open' | 'close') {
        return {
            onMouseDown: (event: MouseLikeEvent) => {
                if ((mouseDownAction === 'open' && !open) || (mouseDownAction === 'close' && open)) {
                    this.ignoreClick = true;
                    ownerDocument(event.currentTarget as Element | null).addEventListener(
                        'click',
                        () => {
                            this.ignoreClick = false;
                        },
                        { once: true }
                    );
                }
            },
            onClick: (event: Partial<PreventableEvent>) => {
                if (this.ignoreClick) {
                    this.ignoreClick = false;
                    event.preventHeadlessUIHandler?.();
                }
            }
        };
    }
}

type BoundsEvent = { currentTarget: EventTarget | null; clientX: number; clientY: number };

/**
 * Whether the pointer is inside the bounds of the event's current target.
 * Safari fires `mouseleave` incorrectly when an item is aligned to the trigger; this guards against it.
 */
export function isMouseWithinBounds(event: BoundsEvent): boolean {
    const target = event.currentTarget as Element | null;
    if (!target) {
        return false;
    }
    const targetRect = target.getBoundingClientRect();
    return (
        targetRect.top + 1 <= event.clientY &&
        event.clientY <= targetRect.bottom - 1 &&
        targetRect.left + 1 <= event.clientX &&
        event.clientX <= targetRect.right - 1
    );
}

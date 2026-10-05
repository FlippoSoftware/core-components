import type { Style } from '~@lib/types';

/**
 * Props of the internal backdrop rendered behind modal popups.
 * `cutout` is an element left interactive (cut out of the backdrop), usually the trigger.
 * Pure replacement for `<InternalBackdrop>`; adapters render a `<div>` with these props.
 */
export function getInternalBackdropProps(cutout: Element | null | undefined, inert?: boolean) {
    let clipPath: string | undefined;
    if (cutout) {
        const rect = cutout.getBoundingClientRect();
        clipPath = `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${rect.left}px ${rect.top}px, ${rect.left}px ${rect.bottom}px, ${rect.right}px ${rect.bottom}px, ${rect.right}px ${rect.top}px, ${rect.left}px ${rect.top}px)`;
    }

    const style: Style = {
        position: 'fixed',
        inset: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        clipPath
    };

    return {
        role: 'presentation' as const,
        // Ensures the outside press detection runs, as it considers
        // it an element that existed when the popup rendered.
        'data-base-ui-inert': '',
        ...(inert !== undefined && { inert }),
        style
    };
}

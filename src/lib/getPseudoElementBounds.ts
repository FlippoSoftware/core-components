type ElementBounds = {
    left: number;
    right: number;
    top: number;
    bottom: number;
};

export function getPseudoElementBounds(element: HTMLElement): ElementBounds {
    const elementRect = element.getBoundingClientRect();

    // Avoid "Not implemented: window.getComputedStyle(elt, pseudoElt)"
    if (process.env.NODE_ENV === 'test') {
        return elementRect;
    }

    const beforeStyles = window.getComputedStyle(element, '::before');
    const afterStyles = window.getComputedStyle(element, '::after');

    const hasPseudoElements = beforeStyles.content !== 'none' || afterStyles.content !== 'none';

    if (!hasPseudoElements) {
        return elementRect;
    }

    // Get dimensions of pseudo-elements
    const beforeWidth = Number.parseFloat(beforeStyles.width) || 0;
    const beforeHeight = Number.parseFloat(beforeStyles.height) || 0;
    const afterWidth = Number.parseFloat(afterStyles.width) || 0;
    const afterHeight = Number.parseFloat(afterStyles.height) || 0;

    // Calculate max dimensions including pseudo-elements
    const totalWidth = Math.max(elementRect.width, beforeWidth, afterWidth);
    const totalHeight = Math.max(elementRect.height, beforeHeight, afterHeight);

    // Calculate the differences to extend the bounds
    const widthDiff = totalWidth - elementRect.width;
    const heightDiff = totalHeight - elementRect.height;

    return {
        left: elementRect.left - widthDiff / 2,
        right: elementRect.right + widthDiff / 2,
        top: elementRect.top - heightDiff / 2,
        bottom: elementRect.bottom + heightDiff / 2
    };
}

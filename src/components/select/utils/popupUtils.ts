import type { Style } from '~@lib/types';

export function clearStyles(element: HTMLElement | null, originalStyles: Style) {
    if (element) {
        Object.assign(element.style, originalStyles);
    }
}

export function getMaxPopupHeight(popupStyles: CSSStyleDeclaration) {
    const maxHeightStyle = popupStyles.maxHeight || '';
    return maxHeightStyle.endsWith('px') ? Number.parseFloat(maxHeightStyle) || Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
}

export function getMaxScrollTop(scroller: HTMLElement) {
    return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
}

const TRANSFORM_STYLE_RESETS = [
    ['transform', 'none'],
    ['scale', '1'],
    ['translate', '0 0']
] as const;

/**
 * Temporarily removes transforms that would affect measurements. @returns A function restoring them.
 */
export function unsetTransformStyles(popupElement: HTMLElement) {
    const { style } = popupElement;
    const originalStyles: Record<string, string> = {};
    for (const [property, value] of TRANSFORM_STYLE_RESETS) {
        originalStyles[property] = style.getPropertyValue(property);
        style.setProperty(property, value, 'important');
    }
    return () => {
        for (const [property] of TRANSFORM_STYLE_RESETS) {
            const originalValue = originalStyles[property];
            if (originalValue) {
                style.setProperty(property, originalValue);
            } else {
                style.removeProperty(property);
            }
        }
    };
}

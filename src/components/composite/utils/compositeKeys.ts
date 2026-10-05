import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '~@packages/floating-ui/utils/constants';

import type { TextDirection } from '~@lib/types';

export type Dimensions = {
    width: number;
    height: number;
};

export const HOME = 'Home';

export const END = 'End';

export const HORIZONTAL_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT]);

export const HORIZONTAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_LEFT, ARROW_RIGHT, HOME, END]);

export const VERTICAL_KEYS = new Set([ARROW_UP, ARROW_DOWN]);

export const VERTICAL_KEYS_WITH_EXTRA_KEYS = new Set([ARROW_UP, ARROW_DOWN, HOME, END]);

export const ARROW_KEYS = new Set([...HORIZONTAL_KEYS, ...VERTICAL_KEYS]);

export const ALL_KEYS = new Set([...ARROW_KEYS, HOME, END]);

export const COMPOSITE_KEYS = new Set([ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, HOME, END]);

export const SHIFT = 'Shift' as const;

export const CONTROL = 'Control' as const;

export const ALT = 'Alt' as const;

export const META = 'Meta' as const;

export const MODIFIER_KEYS = new Set([SHIFT, CONTROL, ALT, META] as const);

export type ModifierKey = typeof MODIFIER_KEYS extends Set<infer Keys> ? Keys : never;

export function isNativeInput(element: EventTarget | null): element is HTMLElement & (HTMLInputElement | HTMLTextAreaElement) {
    if (typeof HTMLInputElement === 'undefined') {
        return false;
    }
    if (element instanceof HTMLInputElement && element.selectionStart != null) {
        return true;
    }
    if (element instanceof HTMLTextAreaElement) {
        return true;
    }
    return false;
}

export function scrollIntoViewIfNeeded(
    scrollContainer: HTMLElement | null,
    element: HTMLElement | null,
    direction: TextDirection,
    orientation: 'horizontal' | 'vertical' | 'both'
) {
    if (!scrollContainer || !element || !element.scrollTo) {
        return;
    }

    let targetX = scrollContainer.scrollLeft;
    let targetY = scrollContainer.scrollTop;

    const isOverflowingX = scrollContainer.clientWidth < scrollContainer.scrollWidth;
    const isOverflowingY = scrollContainer.clientHeight < scrollContainer.scrollHeight;

    if (isOverflowingX && orientation !== 'vertical') {
        const elementOffsetLeft = getOffset(scrollContainer, element, 'left');
        const containerStyles = getStyles(scrollContainer);
        const elementStyles = getStyles(element);

        if (direction === 'ltr') {
            if (
                elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
                scrollContainer.scrollLeft + scrollContainer.clientWidth - containerStyles.scrollPaddingRight
            ) {
                // overflow to the right, scroll to align right edges
                targetX =
                    elementOffsetLeft +
                    element.offsetWidth +
                    elementStyles.scrollMarginRight -
                    scrollContainer.clientWidth +
                    containerStyles.scrollPaddingRight;
            } else if (
                elementOffsetLeft - elementStyles.scrollMarginLeft <
                scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft
            ) {
                // overflow to the left, scroll to align left edges
                targetX = elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
            }
        }

        if (direction === 'rtl') {
            if (elementOffsetLeft - elementStyles.scrollMarginRight < scrollContainer.scrollLeft + containerStyles.scrollPaddingLeft) {
                // overflow to the left, scroll to align left edges
                targetX = elementOffsetLeft - elementStyles.scrollMarginLeft - containerStyles.scrollPaddingLeft;
            } else if (
                elementOffsetLeft + element.offsetWidth + elementStyles.scrollMarginRight >
                scrollContainer.scrollLeft + scrollContainer.clientWidth - containerStyles.scrollPaddingRight
            ) {
                // overflow to the right, scroll to align right edges
                targetX =
                    elementOffsetLeft +
                    element.offsetWidth +
                    elementStyles.scrollMarginRight -
                    scrollContainer.clientWidth +
                    containerStyles.scrollPaddingRight;
            }
        }
    }

    if (isOverflowingY && orientation !== 'horizontal') {
        const elementOffsetTop = getOffset(scrollContainer, element, 'top');
        const containerStyles = getStyles(scrollContainer);
        const elementStyles = getStyles(element);

        if (elementOffsetTop - elementStyles.scrollMarginTop < scrollContainer.scrollTop + containerStyles.scrollPaddingTop) {
            // overflow upwards, align top edges
            targetY = elementOffsetTop - elementStyles.scrollMarginTop - containerStyles.scrollPaddingTop;
        } else if (
            elementOffsetTop + element.offsetHeight + elementStyles.scrollMarginBottom >
            scrollContainer.scrollTop + scrollContainer.clientHeight - containerStyles.scrollPaddingBottom
        ) {
            // overflow downwards, align bottom edges
            targetY =
                elementOffsetTop +
                element.offsetHeight +
                elementStyles.scrollMarginBottom -
                scrollContainer.clientHeight +
                containerStyles.scrollPaddingBottom;
        }
    }

    scrollContainer.scrollTo({
        left: targetX,
        top: targetY,
        behavior: 'auto'
    });
}

function getOffset(ancestor: HTMLElement, element: HTMLElement, side: 'left' | 'top') {
    const propName = side === 'left' ? 'offsetLeft' : 'offsetTop';

    let result = 0;

    while (element.offsetParent) {
        result += element[propName];
        if (element.offsetParent === ancestor) {
            break;
        }
        element = element.offsetParent as HTMLElement;
    }

    return result;
}

function getStyles(element: HTMLElement) {
    const styles = getComputedStyle(element);
    return {
        scrollMarginTop: Number.parseFloat(styles.scrollMarginTop) || 0,
        scrollMarginRight: Number.parseFloat(styles.scrollMarginRight) || 0,
        scrollMarginBottom: Number.parseFloat(styles.scrollMarginBottom) || 0,
        scrollMarginLeft: Number.parseFloat(styles.scrollMarginLeft) || 0,
        scrollPaddingTop: Number.parseFloat(styles.scrollPaddingTop) || 0,
        scrollPaddingRight: Number.parseFloat(styles.scrollPaddingRight) || 0,
        scrollPaddingBottom: Number.parseFloat(styles.scrollPaddingBottom) || 0,
        scrollPaddingLeft: Number.parseFloat(styles.scrollPaddingLeft) || 0
    };
}

export function isModifierKeySet(event: { getModifierState(key: string): boolean }, ignoredModifierKeys: readonly ModifierKey[]) {
    for (const key of MODIFIER_KEYS.values()) {
        if (ignoredModifierKeys.includes(key)) {
            continue;
        }
        if (event.getModifierState(key)) {
            return true;
        }
    }

    return false;
}

export const ACTIVE_COMPOSITE_ITEM = 'data-composite-item-active';

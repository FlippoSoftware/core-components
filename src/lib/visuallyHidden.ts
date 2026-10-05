import type { Style } from './types';

const visuallyHiddenBase: Style = {
    clipPath: 'inset(50%)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    border: 0,
    padding: 0,
    width: 1,
    height: 1,
    margin: -1
};

export const visuallyHidden: Style = {
    ...visuallyHiddenBase,
    position: 'fixed',
    top: 0,
    left: 0
};

export const visuallyHiddenInput: Style = {
    ...visuallyHiddenBase,
    position: 'absolute'
};

/**
 * Applies a camelCase style object to an element (numbers become `px`, like in frameworks).
 */
export function applyStyle(element: HTMLElement, style: Style) {
    for (const [key, value] of Object.entries(style)) {
        if (value === undefined) {
            continue;
        }
        const cssValue = typeof value === 'number' && value !== 0 ? `${value}px` : String(value);
        element.style.setProperty(
            key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
            cssValue
        );
    }
}

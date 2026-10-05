export type EventKeyOptions = {
    dir?: 'ltr' | 'rtl' | undefined;
    orientation?: 'horizontal' | 'vertical' | undefined;
};

const keyMap: Record<string, string> = {
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Esc: 'Escape',
    ' ': 'Space',
    ',': 'Comma',
    Left: 'ArrowLeft',
    Right: 'ArrowRight'
};

const rtlKeyMap: Record<string, string> = {
    ArrowLeft: 'ArrowRight',
    ArrowRight: 'ArrowLeft'
};

/**
 * Normalized key of a keyboard event (legacy names, RTL arrows swapped for horizontal widgets).
 */
export function getEventKey(event: Pick<KeyboardEvent, 'key'>, options: EventKeyOptions = {}) {
    const { dir = 'ltr', orientation = 'horizontal' } = options;
    let key = event.key;
    key = keyMap[key] ?? key;
    const isRtl = dir === 'rtl' && orientation === 'horizontal';
    if (isRtl && key in rtlKeyMap) {
        key = rtlKeyMap[key] ?? key;
    }
    return key;
}

/**
 * Whether a keyboard event is part of an IME composition (`isComposing` is unreliable in Safari).
 */
export function isComposingEvent(event: { which?: number; isComposing?: boolean; nativeEvent?: { isComposing?: boolean } }) {
    return event.which === 229 || Boolean((event.nativeEvent ?? event).isComposing);
}

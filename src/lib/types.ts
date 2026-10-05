/**
 * A mutable reference object. Structurally compatible with React's `RefObject`,
 * so adapters can pass it to elements directly.
 */
export type MutableRef<T> = {
    current: T;
};

/**
 * Props/attributes that adapters spread on an element. Keys use the adapter's notation.
 */
export type ElementProps = Record<string, unknown>;

/**
 * Inline styles in camelCase notation.
 */
export type Style = Record<string, string | number | undefined>;

/**
 * Type of the interaction that opened a popup.
 */
export type Interaction = 'mouse' | 'touch' | 'pen' | 'keyboard' | '';

/**
 * Status of an enter/exit transition.
 */
export type TransitionStatus = 'starting' | 'ending' | 'idle' | undefined;

export type Orientation = 'horizontal' | 'vertical';

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'inline-end' | 'inline-start';

export type Align = 'start' | 'center' | 'end';

/**
 * An event handler that accepts both native events and framework wrappers around them
 * (method syntax makes the parameter bivariant).
 */
export type BivariantEventHandler<E> = {
    bivarianceHack(event: E): void;
}['bivarianceHack'];

/**
 * The minimal shape of a keyboard event, satisfied by native and synthetic events.
 */
export type KeyboardEventLike = {
    key: string;
    preventDefault(): void;
    stopPropagation(): void;
};

/**
 * The minimal shape of a pointer event, satisfied by native and synthetic events.
 */
export type PointerEventLike = {
    clientX: number;
    clientY: number;
    pointerType: string;
    preventDefault(): void;
};

export type TextDirection = 'ltr' | 'rtl';

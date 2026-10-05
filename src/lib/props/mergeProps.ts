// biome-ignore-all lint/suspicious/noExplicitAny: props are heterogeneous records; handlers are untyped functions.
import type { Style } from '~@lib/types';

/**
 * A props object (React prop notation: `onClick`, `className`, `style`, `aria-*`).
 */
export type Props = Record<string, any>;

/**
 * Props or a function that receives the props merged so far and returns new ones.
 */
export type PropsInput = Props | ((otherProps: Props) => Props) | undefined;

/**
 * An event that lets the user prevent the component's own handler.
 */
export type PreventableEvent = {
    preventHeadlessUIHandler: () => void;
    readonly headlessUIHandlerPrevented?: boolean;
};

const EMPTY_PROPS: Props = {};

export function mergeObjects<A extends object | undefined, B extends object | undefined>(a: A, b: B) {
    if (a && !b) {
        return a;
    }
    if (!a && b) {
        return b;
    }
    if (a || b) {
        return { ...a, ...b };
    }
    return;
}

/**
 * Merges multiple sets of props. It follows the Object.assign pattern where the rightmost object's fields overwrite
 * the conflicting ones from others. This doesn't apply to event handlers, `className` and `style` props.
 * Event handlers are merged such that they are called in sequence (the rightmost one being called first),
 * and allows the user to prevent the subsequent event handlers from being executed by calling
 * `event.preventHeadlessUIHandler()`.
 * `className`s are concatenated and the rightmost styles overwrite the previous ones.
 *
 * Props can either be provided as objects or as functions that take the previous props as an argument.
 * The function is responsible for chaining event handlers if needed.
 *
 * `ref` is not merged.
 */
export function mergeProps(...props: PropsInput[]): Props {
    return mergePropsN(props);
}

export function mergePropsN(props: readonly PropsInput[]): Props {
    if (props.length === 0) {
        return EMPTY_PROPS;
    }
    if (props.length === 1) {
        return resolvePropsGetter(props[0], EMPTY_PROPS);
    }

    // We need to mutably own `merged`
    let merged = { ...resolvePropsGetter(props[0], EMPTY_PROPS) };

    for (let i = 1; i < props.length; i += 1) {
        merged = mergeOne(merged, props[i]);
    }

    return merged;
}

function mergeOne(merged: Props, inputProps: PropsInput) {
    if (typeof inputProps === 'function') {
        return inputProps(merged);
    }

    return mutablyMergeInto(merged, inputProps);
}

/**
 * Merges two sets of props. In case of conflicts, the external props take precedence.
 */
function mutablyMergeInto(mergedProps: Props, externalProps: Props | undefined) {
    if (!externalProps) {
        return mergedProps;
    }

    for (const propName in externalProps) {
        const externalPropValue = externalProps[propName];

        switch (propName) {
            case 'style': {
                mergedProps[propName] = mergeObjects(mergedProps.style as Style | undefined, externalPropValue as Style | undefined);
                break;
            }
            case 'className': {
                mergedProps[propName] = mergeClassNames(mergedProps.className, externalPropValue as string);
                break;
            }
            default: {
                mergedProps[propName] = isEventHandler(propName, externalPropValue)
                    ? mergeEventHandlers(mergedProps[propName], externalPropValue as (...args: any[]) => any)
                    : externalPropValue;
            }
        }
    }

    return mergedProps;
}

export function isEventHandler(key: string, value: unknown) {
    // This approach is more efficient than using a regex.
    const code0 = key.charCodeAt(0);
    const code1 = key.charCodeAt(1);
    const code2 = key.charCodeAt(2);
    return code0 === 111 /* o */ && code1 === 110 /* n */ && code2 >= 65 /* A */ && code2 <= 90 /* Z */ && typeof value === 'function';
}

function resolvePropsGetter(inputProps: PropsInput, previousProps: Props): Props {
    if (typeof inputProps === 'function') {
        return inputProps(previousProps);
    }

    return inputProps ?? EMPTY_PROPS;
}

function isPreventableEvent(event: unknown): event is object {
    if (event == null || typeof event !== 'object') {
        return false;
    }
    return 'nativeEvent' in event || (typeof Event !== 'undefined' && event instanceof Event);
}

function mergeEventHandlers(ourHandler: ((...args: any[]) => any) | undefined, theirHandler: (...args: any[]) => any) {
    if (!theirHandler) {
        return ourHandler;
    }
    if (!ourHandler) {
        return theirHandler;
    }

    return (event: unknown) => {
        if (isPreventableEvent(event)) {
            const preventable = makeEventPreventable(event);

            const result = theirHandler(preventable);

            if (!preventable.headlessUIHandlerPrevented) {
                ourHandler?.(preventable);
            }

            return result;
        }

        const result = theirHandler(event);
        ourHandler?.(event);
        return result;
    };
}

/**
 * Adds `preventHeadlessUIHandler()` to an event.
 */
export function makeEventPreventable<T extends object>(event: T): T & PreventableEvent {
    const preventable = event as T & PreventableEvent & { headlessUIHandlerPrevented?: boolean };
    preventable.preventHeadlessUIHandler = () => {
        preventable.headlessUIHandlerPrevented = true;
    };

    return preventable;
}

export function mergeClassNames(ourClassName: string | undefined, theirClassName: string | undefined) {
    if (theirClassName) {
        if (ourClassName) {
            return `${theirClassName} ${ourClassName}`;
        }

        return theirClassName;
    }

    return ourClassName;
}

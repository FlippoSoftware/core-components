import { ACTIVE_KEY, FOCUSABLE_ATTRIBUTE, SELECTED_KEY } from '../utils/constants';

import type { InteractionElementProps, InteractionProps, ItemUserProps } from '../types';

type Handler = (...args: unknown[]) => unknown;

/**
 * Merges the props of several interactions (and the user's props) for one part.
 * Event handlers are composed: all of them run, in order, and the first non-`undefined` result is returned.
 *
 * Framework-agnostic version of the prop getters of `useInteractions`.
 */
export function mergeInteractionProps(
    userProps: ItemUserProps | InteractionElementProps | undefined,
    propsList: readonly (InteractionProps | undefined)[],
    elementKey: keyof InteractionProps
): Record<string, unknown> {
    const eventHandlers = new Map<string, Handler[]>();
    const isItem = elementKey === 'item';

    const outputProps: Record<string, unknown> = {};

    if (elementKey === 'floating') {
        outputProps.tabIndex = -1;
        outputProps[FOCUSABLE_ATTRIBUTE] = '';
    }

    for (const key in userProps) {
        if (isItem && (key === ACTIVE_KEY || key === SELECTED_KEY)) {
            continue;
        }
        outputProps[key] = userProps[key];
    }

    for (const interactionProps of propsList) {
        const propsOrGetProps = interactionProps?.[elementKey];
        const props = typeof propsOrGetProps === 'function' ? (userProps ? propsOrGetProps(userProps) : null) : propsOrGetProps;
        if (props) {
            mutablyMergeProps(outputProps, props, isItem, eventHandlers);
        }
    }

    mutablyMergeProps(outputProps, userProps, isItem, eventHandlers);

    return outputProps;
}

function mutablyMergeProps(
    outputProps: Record<string, unknown>,
    props: InteractionElementProps | undefined,
    isItem: boolean,
    eventHandlers: Map<string, Handler[]>
) {
    for (const key in props) {
        const value = props[key];

        if (isItem && (key === ACTIVE_KEY || key === SELECTED_KEY)) {
            continue;
        }

        if (!key.startsWith('on')) {
            outputProps[key] = value;
            continue;
        }

        let handlers = eventHandlers.get(key);
        if (!handlers) {
            handlers = [];
            eventHandlers.set(key, handlers);
        }

        if (typeof value === 'function') {
            handlers.push(value as Handler);

            const current = handlers;
            outputProps[key] = (...args: unknown[]) => current.map((fn) => fn(...args)).find((result) => result !== undefined);
        }
    }
}

/**
 * Prop getters for every part, like the return value of `useInteractions`.
 */
export function createPropGetters(propsList: readonly (InteractionProps | undefined)[]) {
    return {
        getReferenceProps: (userProps?: InteractionElementProps) => mergeInteractionProps(userProps, propsList, 'reference'),
        getFloatingProps: (userProps?: InteractionElementProps) => mergeInteractionProps(userProps, propsList, 'floating'),
        getItemProps: (userProps?: ItemUserProps) => mergeInteractionProps(userProps, propsList, 'item'),
        getTriggerProps: (userProps?: InteractionElementProps) => mergeInteractionProps(userProps, propsList, 'trigger')
    };
}

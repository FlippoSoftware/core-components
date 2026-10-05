import type { Placement, VirtualElement } from '@floating-ui/dom';

import type { FloatingEvents } from '~@events/EventEmitter';
import type { MutableRef } from '~@lib/types';

/**
 * A positioning reference: a DOM element or a virtual element (e.g. a cursor point).
 */
export type ReferenceType = Element | VirtualElement;

/**
 * Per-node floating context: what interactions of other nodes in the tree need to know
 * about a floating element (open state, elements, shared data).
 */
export type FloatingNodeContext = {
    open: boolean;
    nodeId: string | undefined;
    floatingId: string | undefined;
    /**
     * Final placement of the floating element (used by `safePolygon`).
     */
    placement: Placement;
    dataRef: MutableRef<ContextData>;
    events: FloatingEvents;
    elements: {
        reference: ReferenceType | null;
        domReference: Element | null;
        floating: HTMLElement | null;
    };
};

/**
 * Non-reactive data shared by the interactions of a floating element.
 */
export type ContextData = {
    openEvent?: Event | undefined;
    floatingContext?: FloatingNodeContext | undefined;
    /** @deprecated use `onTypingChange` of the typeahead interaction */
    typing?: boolean | undefined;
    [key: string]: unknown;
};

/**
 * A node of the floating tree.
 */
export type FloatingNodeType = {
    id: string | undefined;
    parentId: string | null;
    context?: FloatingNodeContext | undefined;
};

export type Delay = number | Partial<{ open: number; close: number }>;

/**
 * Props for one element (React prop notation: `onClick`, `aria-*`, `tabIndex`).
 * Event handlers receive native events or framework wrappers around them
 * (use `getNativeEvent` to read the native one).
 */
export type InteractionElementProps = Record<string, unknown>;

/**
 * User props passed to item prop getters.
 */
export type ItemUserProps = InteractionElementProps & {
    active?: boolean | undefined;
    selected?: boolean | undefined;
};

/**
 * Props an interaction contributes to each part of a floating element.
 */
export type InteractionProps = {
    reference?: InteractionElementProps | undefined;
    floating?: InteractionElementProps | undefined;
    item?: InteractionElementProps | ((props: ItemUserProps) => InteractionElementProps) | undefined;
    trigger?: InteractionElementProps | undefined;
};

import { EMPTY_OBJECT } from '~@lib/constants';

import type { REASONS } from './reasons';

/**
 * Default for the `CustomProperties` parameter of event details: no extra properties.
 */
export type NoCustomProperties = Record<never, never>;

type ReasonToEventMap = {
    [REASONS.none]: Event;

    [REASONS.triggerPress]: MouseEvent | PointerEvent | TouchEvent | KeyboardEvent;
    [REASONS.triggerHover]: MouseEvent;
    [REASONS.triggerFocus]: FocusEvent;

    [REASONS.outsidePress]: MouseEvent | PointerEvent | TouchEvent;
    [REASONS.itemPress]: MouseEvent | KeyboardEvent | PointerEvent;
    [REASONS.closePress]: MouseEvent | KeyboardEvent | PointerEvent;
    [REASONS.linkPress]: MouseEvent | PointerEvent;
    [REASONS.clearPress]: PointerEvent | MouseEvent | KeyboardEvent;
    [REASONS.chipRemovePress]: PointerEvent | MouseEvent | KeyboardEvent;
    [REASONS.trackPress]: PointerEvent | MouseEvent | TouchEvent;
    [REASONS.incrementPress]: PointerEvent | MouseEvent | TouchEvent;
    [REASONS.decrementPress]: PointerEvent | MouseEvent | TouchEvent;

    [REASONS.inputChange]: InputEvent | Event;
    [REASONS.inputClear]: InputEvent | FocusEvent | Event;
    [REASONS.inputBlur]: FocusEvent;
    [REASONS.inputPaste]: ClipboardEvent;

    [REASONS.focusOut]: FocusEvent | KeyboardEvent;
    [REASONS.escapeKey]: KeyboardEvent;
    [REASONS.listNavigation]: KeyboardEvent;
    [REASONS.keyboard]: KeyboardEvent;

    [REASONS.pointer]: PointerEvent;
    [REASONS.drag]: PointerEvent | TouchEvent;
    [REASONS.wheel]: WheelEvent;
    [REASONS.scrub]: PointerEvent;

    [REASONS.cancelOpen]: MouseEvent;
    [REASONS.siblingOpen]: Event;
    [REASONS.disabled]: Event;
    [REASONS.imperativeAction]: Event;

    [REASONS.windowResize]: UIEvent;
};

/**
 * Maps a change `reason` string to the corresponding native event type.
 */
export type ReasonToEvent<Reason extends string> = Reason extends keyof ReasonToEventMap ? ReasonToEventMap[Reason] : Event;

type ChangeEventDetail<Reason extends string, CustomProperties extends object> = {
    /**
     * The reason for the event.
     */
    reason: Reason;
    /**
     * The native event associated with the custom event.
     */
    event: ReasonToEvent<Reason>;
    /**
     * Cancels the component's internal handling of the event.
     */
    cancel: () => void;
    /**
     * Allows the event to propagate in cases where the component would stop the propagation.
     */
    allowPropagation: () => void;
    /**
     * Indicates whether the event has been canceled.
     */
    isCanceled: boolean;
    /**
     * Indicates whether the event is allowed to propagate.
     */
    isPropagationAllowed: boolean;
    /**
     * The element that triggered the event, if applicable.
     */
    trigger: HTMLElement | undefined;
} & CustomProperties;

/**
 * Details of custom change events emitted by components.
 */
export type ChangeEventDetails<Reason extends string, CustomProperties extends object = NoCustomProperties> = Reason extends string
    ? ChangeEventDetail<Reason, CustomProperties>
    : never;

type GenericEventDetail<Reason extends string, CustomProperties extends object> = {
    /**
     * The reason for the event.
     */
    reason: Reason;
    /**
     * The native event associated with the custom event.
     */
    event: ReasonToEvent<Reason>;
} & CustomProperties;

/**
 * Details of custom generic (non-cancelable) events emitted by components.
 */
export type GenericEventDetails<Reason extends string, CustomProperties extends object = NoCustomProperties> = Reason extends string
    ? GenericEventDetail<Reason, CustomProperties>
    : never;

/**
 * Creates an event details object with the given reason and utilities
 * for preventing the component's internal event handling.
 */
export function createChangeEventDetails<Reason extends string, CustomProperties extends object = NoCustomProperties>(
    reason: Reason,
    event?: ReasonToEvent<Reason>,
    trigger?: HTMLElement,
    customProperties?: CustomProperties
): ChangeEventDetails<Reason, CustomProperties> {
    let canceled = false;
    let allowPropagation = false;
    const custom = customProperties ?? (EMPTY_OBJECT as CustomProperties);
    const details: ChangeEventDetail<Reason, CustomProperties> = {
        reason,
        event: (event ?? new Event('base-ui')) as ReasonToEvent<Reason>,
        cancel() {
            canceled = true;
        },
        allowPropagation() {
            allowPropagation = true;
        },
        get isCanceled() {
            return canceled;
        },
        get isPropagationAllowed() {
            return allowPropagation;
        },
        trigger,
        ...custom
    };
    return details as ChangeEventDetails<Reason, CustomProperties>;
}

/**
 * Creates a generic (non-cancelable) event details object.
 */
export function createGenericEventDetails<Reason extends string, CustomProperties extends object = NoCustomProperties>(
    reason: Reason,
    event?: ReasonToEvent<Reason>,
    customProperties?: CustomProperties
): GenericEventDetails<Reason, CustomProperties> {
    const custom = customProperties ?? (EMPTY_OBJECT as CustomProperties);
    const details: GenericEventDetail<Reason, CustomProperties> = {
        reason,
        event: (event ?? new Event('base-ui')) as ReasonToEvent<Reason>,
        ...custom
    };
    return details as GenericEventDetails<Reason, CustomProperties>;
}

/**
 * Change event details of popups: the handler may keep the popup mounted after it closes.
 */
export type PopupChangeEventDetails<Reason extends string, CustomProperties extends object = NoCustomProperties> = ChangeEventDetails<
    Reason,
    CustomProperties & {
        preventUnmountOnClose: () => void;
    }
>;

/**
 * Open change details broadcast through the floating events emitter (`openchange`).
 */
export type FloatingOpenChangeDetails = {
    open: boolean;
    reason: string;
    nativeEvent: Event;
    nested: boolean;
    triggerElement?: Element | undefined;
};

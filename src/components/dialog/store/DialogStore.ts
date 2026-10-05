import { createRef } from '~@lib/ref';
import { PopupTriggerMap } from '~@popup/PopupTriggerMap';
import { createInitialPopupStoreState, popupStoreSelectors } from '~@popup/popupStoreState';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { FloatingOpenChangeDetails, PopupChangeEventDetails } from '~@events/changeEventDetails';
import type { REASONS } from '~@events/reasons';
import type { Interaction, MutableRef } from '~@lib/types';
import type { PopupStoreContext, PopupStoreState } from '~@popup/popupStoreState';

export type DialogChangeEventReason =
    | typeof REASONS.triggerPress
    | typeof REASONS.outsidePress
    | typeof REASONS.escapeKey
    | typeof REASONS.closePress
    | typeof REASONS.focusOut
    | typeof REASONS.imperativeAction
    | typeof REASONS.none;

export type DialogChangeEventDetails = PopupChangeEventDetails<DialogChangeEventReason>;

export type DialogState<Payload> = PopupStoreState<Payload> & {
    modal: boolean | 'trap-focus';
    disablePointerDismissal: boolean;
    openMethod: Interaction | null;
    nested: boolean;
    nestedOpenDialogCount: number;
    titleElementId: string | undefined;
    descriptionElementId: string | undefined;
    viewportElement: HTMLElement | null;
    role: 'dialog' | 'alertdialog';
};

export type DialogContext = PopupStoreContext<DialogChangeEventDetails> & {
    readonly backdropRef: MutableRef<HTMLDivElement | null>;
    readonly internalBackdropRef: MutableRef<HTMLDivElement | null>;
    onNestedDialogOpen?: ((ownChildrenCount: number) => void) | undefined;
    onNestedDialogClose?: (() => void) | undefined;
};

type S = DialogState<unknown>;

export const dialogSelectors = {
    ...popupStoreSelectors,
    modal: createSelector((state: S) => state.modal),
    nested: createSelector((state: S) => state.nested),
    nestedOpenDialogCount: createSelector((state: S) => state.nestedOpenDialogCount),
    disablePointerDismissal: createSelector((state: S) => state.disablePointerDismissal),
    openMethod: createSelector((state: S) => state.openMethod),
    descriptionElementId: createSelector((state: S) => state.descriptionElementId),
    titleElementId: createSelector((state: S) => state.titleElementId),
    viewportElement: createSelector((state: S) => state.viewportElement),
    role: createSelector((state: S) => state.role)
};

export type DialogSelectors = typeof dialogSelectors;

function createInitialState<Payload>(initialState: Partial<DialogState<Payload>> = {}): DialogState<Payload> {
    return {
        ...createInitialPopupStoreState<Payload>(),
        modal: true,
        disablePointerDismissal: false,
        popupElement: null,
        viewportElement: null,
        descriptionElementId: undefined,
        titleElementId: undefined,
        openMethod: null,
        nested: false,
        nestedOpenDialogCount: 0,
        role: 'dialog',
        ...initialState
    };
}

/**
 * State machine of a dialog (also used by AlertDialog and Drawer).
 */
export class DialogStore<Payload = unknown> extends ComponentStore<Readonly<DialogState<Payload>>, DialogContext, DialogSelectors> {
    constructor(initialState?: Partial<DialogState<Payload>>) {
        super(
            createInitialState<Payload>(initialState),
            {
                popupRef: createRef<HTMLElement>(),
                backdropRef: createRef<HTMLDivElement>(),
                internalBackdropRef: createRef<HTMLDivElement>(),
                triggerElements: new PopupTriggerMap(),
                onOpenChange: undefined,
                onOpenChangeComplete: undefined
            },
            dialogSelectors
        );
    }

    public setOpen = (nextOpen: boolean, eventDetails: Omit<DialogChangeEventDetails, 'preventUnmountOnClose'>) => {
        const details = eventDetails as DialogChangeEventDetails;
        details.preventUnmountOnClose = () => {
            this.set('preventUnmountingOnClose', true);
        };

        if (!nextOpen && details.trigger == null && this.state.activeTriggerId != null) {
            // When closing the dialog, pass the old trigger to the onOpenChange event
            // so it's not reset too early (potentially causing focus issues in controlled scenarios).
            details.trigger = this.state.activeTriggerElement ?? undefined;
        }

        this.context.onOpenChange?.(nextOpen, details);

        if (details.isCanceled) {
            return;
        }

        const floatingDetails: FloatingOpenChangeDetails = {
            open: nextOpen,
            nativeEvent: details.event,
            reason: details.reason,
            nested: this.state.nested
        };

        this.state.floatingRootContext.context.events?.emit('openchange', floatingDetails);

        const updatedState: Partial<DialogState<Payload>> = {
            open: nextOpen
        };

        // If a popup is closing, the `trigger` may be null.
        // We want to keep the previous value so that exit animations are played and focus is returned correctly.
        const newTriggerId = details.trigger?.id ?? null;
        if (newTriggerId || nextOpen) {
            updatedState.activeTriggerId = newTriggerId;
            updatedState.activeTriggerElement = details.trigger ?? null;
        }

        this.update(updatedState);
    };
}

import type { CustomStyleHookMapping } from './getStyleHookProps';

export enum CommonPopupDataAttributes {
    open = 'data-open',
    closed = 'data-closed',
    startingStyle = 'data-starting-style',
    endingStyle = 'data-ending-style',
    anchorHidden = 'data-anchor-hidden'
}

export enum CommonTriggerDataAttributes {
    popupOpen = 'data-popup-open',
    pressed = 'data-pressed'
}

const TRIGGER_HOOK = {
    [CommonTriggerDataAttributes.popupOpen]: ''
};

const PRESSABLE_TRIGGER_HOOK = {
    [CommonTriggerDataAttributes.popupOpen]: '',
    [CommonTriggerDataAttributes.pressed]: ''
};

const POPUP_OPEN_HOOK = {
    [CommonPopupDataAttributes.open]: ''
};

const POPUP_CLOSED_HOOK = {
    [CommonPopupDataAttributes.closed]: ''
};

const ANCHOR_HIDDEN_HOOK = {
    [CommonPopupDataAttributes.anchorHidden]: ''
};

export const triggerOpenStateMapping = {
    open(value) {
        if (value) {
            return TRIGGER_HOOK;
        }
        return null;
    }
} satisfies CustomStyleHookMapping<{ open: boolean }>;

export const pressableTriggerOpenStateMapping = {
    open(value) {
        if (value) {
            return PRESSABLE_TRIGGER_HOOK;
        }
        return null;
    }
} satisfies CustomStyleHookMapping<{ open: boolean }>;

export const popupStateMapping = {
    open(value) {
        if (value) {
            return POPUP_OPEN_HOOK;
        }
        return POPUP_CLOSED_HOOK;
    },
    anchorHidden(value) {
        if (value) {
            return ANCHOR_HIDDEN_HOOK;
        }
        return null;
    }
} satisfies CustomStyleHookMapping<{ open: boolean; anchorHidden: boolean }>;

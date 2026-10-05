import type { CustomStyleHookMapping } from './getStyleHookProps';

export enum CommonCollapsiblePanelDataAttributes {
    /**
     * Present when the collapsible panel is open.
     */
    open = 'data-open',
    /**
     * Present when the collapsible panel is closed.
     */
    closed = 'data-closed',
    /**
     * Present when the panel is animating in.
     */
    startingStyle = 'data-starting-style',
    /**
     * Present when the panel is animating out.
     */
    endingStyle = 'data-ending-style'
}

export enum CommonCollapsibleTriggerDataAttributes {
    /**
     * Present when the collapsible panel is open.
     */
    panelOpen = 'data-panel-open'
}

const PANEL_OPEN_HOOK = {
    [CommonCollapsiblePanelDataAttributes.open]: ''
};

const PANEL_CLOSED_HOOK = {
    [CommonCollapsiblePanelDataAttributes.closed]: ''
};

export const collapsibleTriggerOpenStateMapping: CustomStyleHookMapping<{
    open: boolean;
}> = {
    open(value) {
        if (value) {
            return {
                [CommonCollapsibleTriggerDataAttributes.panelOpen]: ''
            };
        }
        return null;
    }
};

export const collapsibleOpenStateMapping = {
    open(value) {
        if (value) {
            return PANEL_OPEN_HOOK;
        }
        return PANEL_CLOSED_HOOK;
    }
} satisfies CustomStyleHookMapping<{
    open: boolean;
}>;

import { collapsibleTriggerOpenStateMapping } from '~@attributes/collapsibleOpenStateMapping';
import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { CollapsibleMachine } from '~@components/collapsible/root/CollapsibleMachine';
import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { warn } from '~@lib/warn';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ButtonMachine } from '~@components/button/root/ButtonMachine';
import type { CollapsibleChangeEventDetails } from '~@components/collapsible/root/CollapsibleMachine';
import type { Style, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { AccordionPanelCssVars } from '../panel/AccordionPanelCssVars';
import { accordionStateAttributesMapping } from '../root/accordionStateAttributesMapping';

import type { AccordionMachine, AccordionState } from '../root/AccordionMachine';

export type AccordionItemState = AccordionState & {
    index: number;
    open: boolean;
};

export type AccordionPanelState = AccordionItemState & {
    transitionStatus: TransitionStatus;
};

export type AccordionItemOptions = {
    /**
     * Defaults to a generated id.
     */
    value?: unknown;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: CollapsibleChangeEventDetails) => void) | undefined;
    /**
     * Generated value used when `value` is not provided.
     */
    fallbackValue: string;
    /**
     * Generated id of the trigger.
     */
    defaultTriggerId: string;
    /**
     * Generated id of the panel.
     */
    defaultPanelId: string;
};

/**
 * One accordion item: a collapsible whose open state is driven by the accordion value.
 */
export class AccordionItemMachine {
    readonly collapsible: CollapsibleMachine;

    readonly listItem: ListRegistryItem;

    readonly store: Store<{ index: number; triggerId: string | undefined }>;

    private options: AccordionItemOptions;

    private readonly accordion: AccordionMachine;

    private readonly unsubscribe: () => void;

    constructor(accordion: AccordionMachine, options: AccordionItemOptions) {
        this.accordion = accordion;
        this.options = options;
        this.store = new Store<{ index: number; triggerId: string | undefined }>({ index: -1, triggerId: options.defaultTriggerId });
        this.listItem = new ListRegistryItem(accordion.registry, { onIndexChange: (index) => this.store.set('index', index) });
        this.collapsible = new CollapsibleMachine(this.getCollapsibleOptions());
        this.unsubscribe = accordion.store.subscribe(() => this.collapsible.setOptions(this.getCollapsibleOptions()));
    }

    setOptions(options: AccordionItemOptions) {
        this.options = options;
        this.collapsible.setOptions(this.getCollapsibleOptions());
    }

    /**
     * Re-reads the accordion (call when the accordion options change).
     */
    sync() {
        this.collapsible.setOptions(this.getCollapsibleOptions());
    }

    private getCollapsibleOptions() {
        return {
            open: this.isOpen,
            disabled: this.disabled,
            defaultPanelId: this.options.defaultPanelId,
            onOpenChange: (nextOpen: boolean, eventDetails: CollapsibleChangeEventDetails) => {
                this.options.onOpenChange?.(nextOpen, eventDetails);

                if (eventDetails.isCanceled) {
                    return;
                }

                this.accordion.handleValueChange(this.value, nextOpen);
            }
        };
    }

    get value() {
        return this.options.value ?? this.options.fallbackValue;
    }

    get disabled() {
        return (this.options.disabled ?? false) || this.accordion.disabled;
    }

    get isOpen() {
        return this.accordion.isOpen(this.value);
    }

    get triggerId() {
        return this.store.state.triggerId;
    }

    setTriggerId = (id: string | undefined) => {
        this.store.set('triggerId', id);
    };

    getState(): AccordionItemState {
        return { ...this.accordion.getState(), index: this.store.state.index, disabled: this.disabled, open: this.isOpen };
    }

    getPanelState(): AccordionPanelState {
        return { ...this.getState(), transitionStatus: this.collapsible.transitionStatus };
    }

    static attrs(state: AccordionItemState | AccordionPanelState): Record<string, string> {
        return getStyleHookProps(state, accordionStateAttributesMapping);
    }

    static triggerAttrs(state: AccordionItemState): Record<string, string> {
        return getStyleHookProps(state, collapsibleTriggerOpenStateMapping);
    }

    /**
     * Applies the panel options, falling back to the accordion's `hiddenUntilFound`/`keepMounted`.
     */
    setPanelOptions(options: { id?: string | undefined; hiddenUntilFound?: boolean | undefined; keepMounted?: boolean | undefined }) {
        const hiddenUntilFound = options.hiddenUntilFound ?? this.accordion.hiddenUntilFound;
        if (process.env.NODE_ENV !== 'production' && options.keepMounted === false && hiddenUntilFound) {
            warn(
                'The `keepMounted={false}` prop on a Accordion.Panel will be ignored when using `contextHiddenUntilFound` on the Panel or the Root since it requires the panel to remain mounted when closed.'
            );
        }
        this.collapsible.setPanelOptions({
            id: options.id,
            hiddenUntilFound,
            keepMounted: options.keepMounted ?? this.accordion.keepMounted
        });
    }

    getTriggerProps(button: ButtonMachine, elementProps: Props = {}, disabledProp?: boolean): Props {
        const disabled = disabledProp ?? this.collapsible.disabled;
        return this.collapsible.getTriggerProps(
            button,
            mergeProps({ id: this.triggerId, onKeyDown: this.accordion.onTriggerKeyDown }, elementProps),
            disabled
        );
    }

    getPanelProps(): Props {
        const { height, width } = this.collapsible.store.state;
        return mergeProps(this.collapsible.getPanelProps(), {
            'aria-labelledby': this.triggerId,
            role: 'region',
            style: {
                [AccordionPanelCssVars.accordionPanelHeight]: height === undefined ? 'auto' : `${height}px`,
                [AccordionPanelCssVars.accordionPanelWidth]: width === undefined ? 'auto' : `${width}px`
            } satisfies Style
        });
    }

    destroy() {
        this.unsubscribe();
        this.listItem.destroy();
        this.collapsible.destroy();
    }
}

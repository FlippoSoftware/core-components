import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { Store } from '~@store/Store';

import type { ToggleGroupMachine } from '~@components/toggle-group/root/ToggleGroupMachine';
import type { ChangeEventDetails } from '~@events/changeEventDetails';

export type ToggleChangeEventReason = typeof REASONS.none;

export type ToggleChangeEventDetails = ChangeEventDetails<ToggleChangeEventReason>;

export type ToggleOptions = {
    pressed?: boolean | undefined;
    /**
     * @default false
     */
    defaultPressed?: boolean | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    onPressedChange?: ((pressed: boolean, eventDetails: ToggleChangeEventDetails) => void) | undefined;
    /**
     * Identifies the toggle inside a toggle group.
     */
    value?: string | undefined;
    /**
     * The parent toggle group, if any.
     */
    group?: ToggleGroupMachine | null | undefined;
};

export type ToggleState = {
    pressed: boolean;
    disabled: boolean;
};

/**
 * State machine of a toggle button.
 */
export class ToggleMachine {
    readonly store: Store<{ pressed: boolean; index: number }>;

    /**
     * Registration in the group's composite navigation.
     */
    readonly listItem: ListRegistryItem | null;

    private options: ToggleOptions;

    constructor(options: ToggleOptions = {}) {
        this.options = options;
        this.store = new Store({ pressed: options.group ? false : (options.defaultPressed ?? false), index: -1 });
        this.listItem = options.group
            ? new ListRegistryItem(options.group.composite.registry, { onIndexChange: (index) => this.store.set('index', index) })
            : null;
    }

    setElement = (element: HTMLElement | null) => {
        this.listItem?.setElement(element);
    };

    destroy() {
        this.listItem?.destroy();
    }

    setOptions(options: ToggleOptions) {
        this.options = options;
    }

    private get controlledPressed(): boolean | undefined {
        const { group, value = '', pressed } = this.options;
        return group && value ? group.isPressed(value) : pressed;
    }

    getState(): ToggleState {
        const { group, disabled = false } = this.options;
        return {
            pressed: Boolean(this.controlledPressed ?? this.store.state.pressed),
            disabled: (disabled || group?.getState().disabled) ?? false
        };
    }

    /**
     * Click handler of the toggle.
     */
    onClick = (event: MouseEvent) => {
        const { group, value = '', onPressedChange } = this.options;
        const nextPressed = !this.getState().pressed;
        const details = createChangeEventDetails(REASONS.none, getNativeEvent(event));

        group?.setGroupValue(value, nextPressed, details);
        onPressedChange?.(nextPressed, details);

        if (details.isCanceled) {
            return;
        }

        if (this.controlledPressed === undefined) {
            this.store.set('pressed', nextPressed);
        }
    };

    getRootProps() {
        const group = this.options.group;
        const compositeProps = group ? group.composite.getItemProps(this.store.state.index) : {};
        return { ...compositeProps, 'aria-pressed': this.getState().pressed, onClick: this.onClick };
    }

    static rootAttrs(state: ToggleState): Record<string, string> {
        return getStyleHookProps(state);
    }
}

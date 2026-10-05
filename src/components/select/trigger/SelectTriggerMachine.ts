import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getPseudoElementBounds } from '~@lib/getPseudoElementBounds';
import { ownerDocument } from '~@lib/owner';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { contains, getFloatingFocusElement } from '~@packages/floating-ui/utils/element';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Timeout } from '~@timers/Timeout';

import type { FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { Props } from '~@props/mergeProps';

import { selectSelectors } from '../store/SelectStore';

import type { SelectRootMachine } from '../root/SelectRootMachine';

import { selectTriggerStateAttributesMapping } from './selectTriggerStateAttributesMapping';

const BOUNDARY_OFFSET = 2;

const SELECTED_DELAY = 400;

const UNSELECTED_DELAY = 200;

export type SelectTriggerState = FieldRootState & {
    open: boolean;
    disabled: boolean;
    readOnly: boolean;
    value: unknown;
    placeholder: boolean;
};

export type SelectTriggerOptions = {
    id?: string | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
};

type FocusLikeEvent = { relatedTarget: EventTarget | null };

/**
 * State machine of `Select.Trigger`: the combobox button, the press-drag-release gesture
 * (with delays so a quick release doesn't select) and blur validation.
 */
export class SelectTriggerMachine {
    readonly button: ButtonMachine;

    private options: SelectTriggerOptions;

    private readonly root: SelectRootMachine;

    private element: HTMLElement | null = null;

    private readonly timeoutFocus = new Timeout();

    private readonly timeoutMouseDown = new Timeout();

    private readonly selectedDelayTimeout = new Timeout();

    private readonly unselectedDelayTimeout = new Timeout();

    private readonly selectionEffect = new Effect(() => this.handleSelectionDelays());

    private readonly unsubscribe: () => void;

    constructor(root: SelectRootMachine, options: SelectTriggerOptions = {}) {
        this.root = root;
        this.options = options;
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton });
        this.unsubscribe = root.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: SelectTriggerOptions) {
        this.options = options;
        this.sync();
    }

    setElement = (element: HTMLElement | null) => {
        this.element = element;
        this.button.setElement(element);
        this.root.setTriggerElement(element);
    };

    get disabled(): boolean {
        return this.root.disabled || (this.options.disabled ?? false);
    }

    getState(): SelectTriggerState {
        const { store } = this.root;
        return {
            ...this.root.field.getState(),
            open: store.state.open,
            disabled: this.disabled,
            value: store.state.value,
            readOnly: this.root.readOnly,
            placeholder: !selectSelectors.hasSelectedValue(store.state)
        };
    }

    static attrs(state: SelectTriggerState) {
        return getStyleHookProps(state, selectTriggerStateAttributesMapping);
    }

    getTriggerProps(elementProps: Props = {}, labelId?: string): Props {
        const { root } = this;
        const { store, field, refs } = root;
        const { open, listElement, positionerElement } = store.state;
        const ariaControlsId = listElement?.id ?? getFloatingFocusElement(positionerElement)?.id;

        const props = mergeProps(
            store.state.triggerProps,
            {
                id: this.options.id ?? store.state.id,
                role: 'combobox',
                'aria-expanded': open ? 'true' : 'false',
                'aria-haspopup': 'listbox',
                'aria-controls': open ? ariaControlsId : undefined,
                'aria-labelledby': labelId,
                'aria-readonly': root.readOnly || undefined,
                'aria-required': root.required || undefined,
                tabIndex: this.disabled ? -1 : 0,
                onFocus: (event: Event) => {
                    field.setFocused(true);
                    // The popup shouldn't obscure the focused trigger.
                    if (store.state.open && refs.alignItemWithTriggerActiveRef.current) {
                        root.setOpen(false, createChangeEventDetails(REASONS.none, getNativeEvent(event)));
                    }
                    // Mount the items before opening on the initial click.
                    this.timeoutFocus.start(0, () => {
                        store.set('forceMount', true);
                    });
                },
                onBlur: (event: FocusLikeEvent) => {
                    // If focus is moving into the popup, don't count it as a blur.
                    if (contains(store.state.positionerElement, event.relatedTarget as Element | null)) {
                        return;
                    }
                    field.setTouched(true);
                    field.setFocused(false);
                    if (field.validationMode === 'onBlur') {
                        field.commit(store.state.value);
                    }
                },
                onPointerMove: () => {
                    refs.keyboardActiveRef.current = false;
                },
                onKeyDown: () => {
                    refs.keyboardActiveRef.current = true;
                },
                onMouseDown: (event: { currentTarget: EventTarget | null }) => {
                    if (store.state.open) {
                        return;
                    }
                    const doc = ownerDocument(event.currentTarget as Element | null);
                    // Firefox can fire this upon mousedown.
                    this.timeoutMouseDown.start(0, () => {
                        doc.addEventListener('mouseup', this.handleMouseUp, { once: true });
                    });
                }
            },
            field.getValidationProps,
            elementProps,
            (merged: Props) => this.button.getButtonProps(merged)
        );

        // A nested button (e.g. `Toolbar.Button`) must not overwrite the combobox role.
        props.role = 'combobox';
        return props;
    }

    destroy() {
        this.unsubscribe();
        this.selectionEffect.destroy();
        this.timeoutFocus.clear();
        this.timeoutMouseDown.clear();
        this.selectedDelayTimeout.clear();
        this.unselectedDelayTimeout.clear();
    }

    private sync() {
        const { store } = this.root;
        this.button.setOptions({ disabled: this.disabled, native: this.options.nativeButton });
        const hasSelectedValue = selectSelectors.hasSelectedValue(store.state);
        const hasNullItemLabel = selectSelectors.hasNullItemLabel(store.state, !hasSelectedValue && store.state.open);
        this.selectionEffect.sync([store.state.open, hasSelectedValue, hasNullItemLabel]);
    }

    private handleSelectionDelays() {
        const { store, refs } = this.root;
        if (!store.state.open) {
            refs.selectionRef.current = { allowSelectedMouseUp: false, allowUnselectedMouseUp: false };
            this.timeoutMouseDown.clear();
            return;
        }

        const hasSelectedValue = selectSelectors.hasSelectedValue(store.state);
        const hasSelectedItemInList = hasSelectedValue || selectSelectors.hasNullItemLabel(store.state, !hasSelectedValue);

        if (!hasSelectedItemInList) {
            // Placeholder-only selects: a quick mouseup over the first option must not select.
            this.selectedDelayTimeout.start(SELECTED_DELAY, () => {
                refs.selectionRef.current.allowUnselectedMouseUp = true;
                refs.selectionRef.current.allowSelectedMouseUp = true;
            });
        } else {
            // mousedown -> move to an unselected item -> mouseup should not select within 200ms.
            this.unselectedDelayTimeout.start(UNSELECTED_DELAY, () => {
                refs.selectionRef.current.allowUnselectedMouseUp = true;
                // mousedown -> mouseup on the selected item should not select within 400ms.
                this.selectedDelayTimeout.start(UNSELECTED_DELAY, () => {
                    refs.selectionRef.current.allowSelectedMouseUp = true;
                });
            });
        }

        return () => {
            this.selectedDelayTimeout.clear();
            this.unselectedDelayTimeout.clear();
        };
    }

    private readonly handleMouseUp = (mouseEvent: MouseEvent) => {
        const trigger = this.element;
        if (!trigger) {
            return;
        }
        const mouseUpTarget = mouseEvent.target as Element | null;
        if (
            contains(trigger, mouseUpTarget) ||
            contains(this.root.store.state.positionerElement, mouseUpTarget) ||
            mouseUpTarget === trigger
        ) {
            return;
        }
        const bounds = getPseudoElementBounds(trigger);
        if (
            mouseEvent.clientX >= bounds.left - BOUNDARY_OFFSET &&
            mouseEvent.clientX <= bounds.right + BOUNDARY_OFFSET &&
            mouseEvent.clientY >= bounds.top - BOUNDARY_OFFSET &&
            mouseEvent.clientY <= bounds.bottom + BOUNDARY_OFFSET
        ) {
            return;
        }
        this.root.setOpen(false, createChangeEventDetails(REASONS.cancelOpen, mouseEvent));
    };
}

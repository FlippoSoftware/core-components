import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { pressableTriggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { fieldValidityMapping } from '~@components/field/utils/fieldValidity';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getPseudoElementBounds } from '~@lib/getPseudoElementBounds';
import { ownerDocument } from '~@lib/owner';
import { ClickInteraction } from '~@packages/floating-ui/interactions/ClickInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { TypeaheadInteraction } from '~@packages/floating-ui/interactions/TypeaheadInteraction';
import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { getNativeEvent, stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Timeout } from '~@timers/Timeout';

import type { FieldRootState } from '~@components/field/root/FieldRootMachine';
import type { Props } from '~@props/mergeProps';

import type { ComboboxRootMachine } from '../root/ComboboxRootMachine';

const BOUNDARY_OFFSET = 2;

export type ComboboxTriggerState = FieldRootState & {
    open: boolean;
    disabled: boolean;
};

export type ComboboxTriggerOptions = {
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * @default true
     */
    nativeButton?: boolean | undefined;
};

/**
 * State machine of `Combobox.Trigger`: opens the popup (the input may live inside it), typeahead
 * selection while closed and the press-drag-release gesture.
 */
export class ComboboxTriggerMachine {
    readonly button: ButtonMachine;

    private options: ComboboxTriggerOptions;

    private readonly root: ComboboxRootMachine;

    private readonly typeahead: TypeaheadInteraction;

    private readonly click: ClickInteraction;

    private currentPointerType = '';

    private readonly focusTimeout = new Timeout();

    private readonly unsubscribe: () => void;

    constructor(root: ComboboxRootMachine, options: ComboboxTriggerOptions = {}) {
        this.root = root;
        this.options = options;
        this.button = new ButtonMachine({ disabled: this.disabled, native: options.nativeButton });
        this.typeahead = new TypeaheadInteraction(root.floatingRoot, this.getTypeaheadOptions());
        this.click = new ClickInteraction(root.floatingRoot, this.getClickOptions());
        this.unsubscribe = root.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: ComboboxTriggerOptions) {
        this.options = options;
        this.sync();
    }

    get disabled(): boolean {
        return this.root.disabled || (this.options.disabled ?? false);
    }

    setElement = (element: HTMLElement | null) => {
        this.button.setElement(element);
        this.root.store.set('triggerElement', element);
    };

    getState(): ComboboxTriggerState {
        return { ...this.root.field.getState(), open: this.root.store.state.open, disabled: this.disabled };
    }

    static attrs(state: ComboboxTriggerState) {
        return getStyleHookProps(state, { ...pressableTriggerOpenStateMapping, ...fieldValidityMapping });
    }

    getTriggerProps(elementProps: Props = {}, labelId?: string): Props {
        const { root } = this;
        const { store, field } = root;
        const { inputInsidePopup, open, listElement, readOnly, selectionMode } = store.state;
        const disabled = this.disabled;
        const trackPointerType = (event: { pointerType: string }) => {
            this.currentPointerType = event.pointerType;
        };

        return mergeProps(
            store.state.triggerProps,
            mergeInteractionProps(undefined, [this.click.getProps(), this.typeahead.getProps()], 'reference'),
            {
                tabIndex: inputInsidePopup ? 0 : -1,
                disabled,
                role: inputInsidePopup ? 'combobox' : undefined,
                'aria-expanded': open ? 'true' : 'false',
                'aria-haspopup': inputInsidePopup ? 'dialog' : 'listbox',
                'aria-controls': open ? listElement?.id : undefined,
                'aria-readonly': readOnly || undefined,
                'aria-labelledby': labelId,
                onPointerDown: trackPointerType,
                onPointerEnter: trackPointerType,
                onFocus: () => {
                    field.setFocused(true);
                    if (disabled || readOnly) {
                        return;
                    }
                    this.focusTimeout.start(0, store.state.forceMount);
                },
                onBlur: () => {
                    field.setTouched(true);
                    field.setFocused(false);
                    if (field.validationMode === 'onBlur') {
                        field.commit(selectionMode === 'none' ? root.inputValue.state.inputValue : store.state.selectedValue);
                    }
                },
                onMouseDown: (event: MouseEvent) => this.handleMouseDown(event),
                onKeyDown: (event: KeyboardEvent) => {
                    if (disabled || readOnly) {
                        return;
                    }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        stopEvent(event);
                        store.state.setOpen(true, createChangeEventDetails(REASONS.listNavigation, getNativeEvent(event)));
                        store.state.inputRef.current?.focus();
                    }
                }
            },
            field.getValidationProps(elementProps),
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    destroy() {
        this.unsubscribe();
        this.typeahead.destroy();
        this.click.destroy();
        this.focusTimeout.clear();
    }

    private handleMouseDown(event: MouseEvent) {
        const { store, floatingRoot } = this.root;
        const { inputInsidePopup, readOnly, open } = store.state;
        if (this.disabled || readOnly) {
            return;
        }
        const currentTarget = event.currentTarget as HTMLElement;
        if (!inputInsidePopup) {
            floatingRoot.set('domReferenceElement', currentTarget);
        }
        // Register the items for the initial selection highlight.
        store.state.forceMount();
        if (this.currentPointerType !== 'touch') {
            store.state.inputRef.current?.focus();
            if (!inputInsidePopup) {
                event.preventDefault();
            }
        }
        if (open || !inputInsidePopup) {
            return;
        }

        const triggerElement = store.state.triggerElement;
        const handleMouseUp = (mouseEvent: MouseEvent) => {
            if (!triggerElement) {
                return;
            }
            const mouseUpTarget = getTarget(mouseEvent) as Element | null;
            if (
                contains(triggerElement, mouseUpTarget) ||
                contains(store.state.positionerElement, mouseUpTarget) ||
                contains(store.state.listElement, mouseUpTarget) ||
                mouseUpTarget === triggerElement
            ) {
                return;
            }
            const bounds = getPseudoElementBounds(triggerElement);
            const withinHorizontal =
                mouseEvent.clientX >= bounds.left - BOUNDARY_OFFSET && mouseEvent.clientX <= bounds.right + BOUNDARY_OFFSET;
            const withinVertical =
                mouseEvent.clientY >= bounds.top - BOUNDARY_OFFSET && mouseEvent.clientY <= bounds.bottom + BOUNDARY_OFFSET;
            if (withinHorizontal && withinVertical) {
                return;
            }
            store.state.setOpen(false, createChangeEventDetails('cancel-open', mouseEvent));
        };
        ownerDocument(currentTarget).addEventListener('mouseup', handleMouseUp, { once: true });
    }

    private getTypeaheadOptions() {
        const { store } = this.root;
        const { open, readOnly, disabled, selectionMode, labelsRef, activeIndex, selectedIndex } = store.state;
        return {
            enabled: !open && !readOnly && !disabled && selectionMode === 'single',
            listRef: labelsRef,
            activeIndex,
            selectedIndex,
            onMatch: (index: number) => {
                const nextSelectedValue = store.state.valuesRef.current[index];
                if (nextSelectedValue !== undefined) {
                    store.state.setSelectedValue(nextSelectedValue, createChangeEventDetails('none'));
                }
            }
        };
    }

    private getClickOptions() {
        const { readOnly, disabled } = this.root.store.state;
        return { enabled: !readOnly && !disabled, event: 'mousedown' as const };
    }

    private sync() {
        const { store, floatingRoot } = this.root;
        const { inputInsidePopup, triggerElement } = store.state;
        this.button.setOptions({ disabled: this.disabled, native: this.options.nativeButton });
        this.typeahead.setOptions(this.getTypeaheadOptions());
        this.click.setOptions(this.getClickOptions());

        // With the input inside the popup, the trigger is the reference element (click/typeahead attach to it).
        if (inputInsidePopup && triggerElement && triggerElement !== floatingRoot.select('domReferenceElement')) {
            floatingRoot.set('domReferenceElement', triggerElement);
        }
    }
}

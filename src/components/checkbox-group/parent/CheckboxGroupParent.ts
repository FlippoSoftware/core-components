import { EMPTY_ARRAY } from '~@lib/constants';

import type { MutableRef } from '~@lib/types';

import type { CheckboxGroupChangeEventDetails, CheckboxGroupMachine } from '../root/CheckboxGroupMachine';

/**
 * State of the parent checkbox that toggles all checkboxes of a group.
 * Replacement for `useCheckboxGroupParent`.
 */
export class CheckboxGroupParent {
    readonly disabledStatesRef: MutableRef<Map<string, boolean>> = { current: new Map() };

    private uncontrolledState: string[];

    private status: 'on' | 'off' | 'mixed' = 'mixed';

    private readonly group: CheckboxGroupMachine;

    constructor(group: CheckboxGroupMachine) {
        this.group = group;
        this.uncontrolledState = group.externalValue ?? (EMPTY_ARRAY as string[]);
    }

    get id() {
        return this.group.parentId;
    }

    private get allValues() {
        return this.group.allValues ?? (EMPTY_ARRAY as string[]);
    }

    private get value() {
        return this.group.externalValue ?? (EMPTY_ARRAY as string[]);
    }

    get checked() {
        return this.value.length === this.allValues.length;
    }

    get indeterminate() {
        return this.value.length !== this.allValues.length && this.value.length > 0;
    }

    getParentProps() {
        const allValues = this.allValues;
        return {
            id: this.id,
            indeterminate: this.indeterminate,
            checked: this.checked,
            'aria-controls': allValues.map((v) => `${this.id}-${v}`).join(' '),
            onCheckedChange: (_: boolean, eventDetails: CheckboxGroupChangeEventDetails) => {
                const uncontrolledState = this.uncontrolledState;
                const disabledStates = this.disabledStatesRef.current;
                // None except the disabled ones that are checked, which can't be changed.
                const none = allValues.filter((v) => disabledStates.get(v) && uncontrolledState.includes(v));
                // "All" that are valid: any that aren't disabled, and disabled ones that are checked.
                const all = allValues.filter((v) => !disabledStates.get(v) || (disabledStates.get(v) && uncontrolledState.includes(v)));

                const allOnOrOff = uncontrolledState.length === all.length || uncontrolledState.length === 0;
                const onValueChange = (next: string[]) => this.group.notifyValueChange(next, eventDetails);

                if (allOnOrOff) {
                    onValueChange(this.value.length === all.length ? none : all);
                    return;
                }

                if (this.status === 'mixed') {
                    onValueChange(all);
                    this.status = 'on';
                } else if (this.status === 'on') {
                    onValueChange(none);
                    this.status = 'off';
                } else {
                    onValueChange(uncontrolledState);
                    this.status = 'mixed';
                }
            }
        };
    }

    getChildProps(childValue: string) {
        return {
            checked: this.value.includes(childValue),
            onCheckedChange: (nextChecked: boolean, eventDetails: CheckboxGroupChangeEventDetails) => {
                const newValue = this.value.slice();
                if (nextChecked) {
                    newValue.push(childValue);
                } else {
                    newValue.splice(newValue.indexOf(childValue), 1);
                }
                this.uncontrolledState = newValue;
                this.group.notifyValueChange(newValue, eventDetails);
                this.status = 'mixed';
            }
        };
    }
}

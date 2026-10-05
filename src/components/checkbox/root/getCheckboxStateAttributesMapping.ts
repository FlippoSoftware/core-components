import type { StateAttributesMapping } from '~@attributes/getStyleHookProps';

import { CheckboxRootDataAttributes } from './CheckboxRootDataAttributes';

import type { CheckboxState } from './CheckboxMachine';

/**
 * Data attribute mapping of the checkbox state (`checked`/`unchecked` are omitted when indeterminate).
 */
export function getCheckboxStateAttributesMapping(state: Pick<CheckboxState, 'indeterminate'>): StateAttributesMapping<CheckboxState> {
    return {
        checked(value): Record<string, string> {
            if (state.indeterminate) {
                // `data-indeterminate` is already handled by the `indeterminate` prop.
                return {};
            }
            return value ? { [CheckboxRootDataAttributes.checked]: '' } : { [CheckboxRootDataAttributes.unchecked]: '' };
        }
    };
}

import type { TransitionStatus } from '~@lib/types';

import type { CustomStyleHookMapping } from './getStyleHookProps';

export enum TransitionStatusDataAttributes {
    startingStyle = 'data-starting-style',
    endingStyle = 'data-ending-style'
}

const STARTING_HOOK = { [TransitionStatusDataAttributes.startingStyle]: '' };
const ENDING_HOOK = { [TransitionStatusDataAttributes.endingStyle]: '' };

export const transitionStatusMapping = {
    transitionStatus(value): Record<string, string> | null {
        if (value === 'starting') {
            return STARTING_HOOK;
        }
        if (value === 'ending') {
            return ENDING_HOOK;
        }
        return null;
    }
} satisfies CustomStyleHookMapping<{ transitionStatus: TransitionStatus }>;

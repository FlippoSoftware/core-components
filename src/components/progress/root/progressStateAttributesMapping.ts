import { ProgressRootDataAttributes } from './ProgressRootDataAttributes';

import type { ProgressStatus } from './ProgressMachine';

export const progressStateAttributesMapping = {
    status(value: ProgressStatus): Record<string, string> | null {
        if (value === 'progressing') {
            return { [ProgressRootDataAttributes.progressing]: '' };
        }
        if (value === 'complete') {
            return { [ProgressRootDataAttributes.complete]: '' };
        }
        if (value === 'indeterminate') {
            return { [ProgressRootDataAttributes.indeterminate]: '' };
        }
        return null;
    }
};

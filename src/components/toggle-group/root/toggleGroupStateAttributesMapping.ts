import { ToggleGroupDataAttributes } from './ToggleGroupDataAttributes';

export const toggleGroupStateAttributesMapping = {
    multiple(value: boolean) {
        return value ? ({ [ToggleGroupDataAttributes.multiple]: '' } as Record<string, string>) : null;
    }
};

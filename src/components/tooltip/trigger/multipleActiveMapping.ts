import { TooltipTriggerDataAttributes } from './TooltipTriggerDataAttributes';

export const multipleActiveMapping = {
    multipleActive(value: boolean) {
        return value ? { [TooltipTriggerDataAttributes.multipleActive]: '' } : null;
    }
};

import { SegmentedControlItemDataAttributes } from './SegmentedControlItemDataAttributes';

export const segmentedControlItemStateAttributesMapping = {
    selected(value: boolean): Record<string, string> {
        return value ? { [SegmentedControlItemDataAttributes.selected]: '' } : { [SegmentedControlItemDataAttributes.unselected]: '' };
    },
    disabled(value: boolean) {
        return value ? ({ [SegmentedControlItemDataAttributes.disabled]: '' } as Record<string, string>) : null;
    }
};

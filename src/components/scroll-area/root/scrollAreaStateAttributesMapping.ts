import { ScrollAreaRootDataAttributes } from './ScrollAreaRootDataAttributes';

export const scrollAreaStateAttributesMapping = {
    hasOverflowX: (value: boolean) => (value ? { [ScrollAreaRootDataAttributes.hasOverflowX]: '' } : null),
    hasOverflowY: (value: boolean) => (value ? { [ScrollAreaRootDataAttributes.hasOverflowY]: '' } : null),
    overflowXStart: (value: boolean) => (value ? { [ScrollAreaRootDataAttributes.overflowXStart]: '' } : null),
    overflowXEnd: (value: boolean) => (value ? { [ScrollAreaRootDataAttributes.overflowXEnd]: '' } : null),
    overflowYStart: (value: boolean) => (value ? { [ScrollAreaRootDataAttributes.overflowYStart]: '' } : null),
    overflowYEnd: (value: boolean) => (value ? { [ScrollAreaRootDataAttributes.overflowYEnd]: '' } : null),
    cornerHidden: () => null
};

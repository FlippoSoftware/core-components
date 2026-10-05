import { SnippetRootDataAttributes } from './SnippetRootDataAttributes';

export const snippetRootStateAttributesMapping = {
    disableCopy(value: boolean): Record<string, string> | null {
        return value ? { [SnippetRootDataAttributes.disableCopy]: '' } : null;
    }
};

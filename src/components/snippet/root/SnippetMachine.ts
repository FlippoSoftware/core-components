import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { ListRegistry } from '~@components/composite/list/ListRegistry';

import { snippetRootStateAttributesMapping } from './snippetRootStateAttributesMapping';

export type SnippetState = {
    disableCopy: boolean;
    symbol?: string | undefined;
};

export type SnippetOptions = {
    /**
     * @default false
     */
    disableCopy?: boolean | undefined;
    /**
     * Prompt symbol (only a string symbol is exposed in the state).
     * @default '$'
     */
    symbol?: unknown;
};

/**
 * State of a code snippet: its lines (in DOM order) and copying them to the clipboard.
 */
export class SnippetMachine {
    readonly registry = new ListRegistry<{ text: string | null | undefined }>();

    private options: SnippetOptions;

    constructor(options: SnippetOptions = {}) {
        this.options = options;
    }

    setOptions(options: SnippetOptions) {
        this.options = options;
    }

    get disableCopy() {
        return this.options.disableCopy ?? false;
    }

    getState(): SnippetState {
        const symbol = this.options.symbol ?? '$';
        return { disableCopy: this.disableCopy, symbol: typeof symbol === 'string' ? symbol : undefined };
    }

    static attrs(state: SnippetState): Record<string, string> {
        return getStyleHookProps(state, snippetRootStateAttributesMapping);
    }

    /**
     * Text of all lines joined with new lines.
     */
    getText() {
        return Array.from(this.registry.getMap().values())
            .map((metadata) => metadata.text)
            .filter(Boolean)
            .join('\n');
    }

    destroy() {
        this.registry.destroy();
    }
}

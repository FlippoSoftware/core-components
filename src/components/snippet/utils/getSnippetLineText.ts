import { SnippetSymbolDataAttributes } from '../symbol/SnippetSymbolDataAttributes';

/**
 * Text of a snippet line without its prompt symbols.
 */
export function getSnippetLineText(element: HTMLElement): string | null {
    const cloned = element.cloneNode(true) as HTMLElement;
    for (const symbolElement of cloned.querySelectorAll(`[${SnippetSymbolDataAttributes.snippetSymbol}]`)) {
        symbolElement.remove();
    }
    return cloned.textContent;
}

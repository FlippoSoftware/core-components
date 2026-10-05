import { EMPTY_ARRAY } from '~@lib/constants';
import { Timeout } from '~@timers/Timeout';

import type { MutableRef } from '~@lib/types';

import { stopEvent } from '../utils/event';

import type { FloatingRootStore } from '../FloatingRootStore';
import type { InteractionProps } from '../types';

export type TypeaheadInteractionOptions = {
    /**
     * Strings whose indices match the HTML elements of the list.
     */
    listRef: MutableRef<(string | null)[]>;
    /**
     * The index of the active (focused or highlighted) item in the list.
     */
    activeIndex: number | null;
    /**
     * Called with the matching index as the user types.
     */
    onMatch?: ((index: number) => void) | undefined;
    /**
     * Called with the typing state as the user types.
     */
    onTypingChange?: ((isTyping: boolean) => void) | undefined;
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Returns the matching string from the list.
     * @default lowercase-finder
     */
    findMatch?: ((list: (string | null)[], typedString: string) => string | null | undefined) | null | undefined;
    /**
     * Milliseconds to wait before resetting the typed string.
     * @default 750
     */
    resetMs?: number | undefined;
    /**
     * Keys to ignore when typing.
     * @default []
     */
    ignoreKeys?: readonly string[] | undefined;
    /**
     * The index of the selected item in the list, if available.
     * @default null
     */
    selectedIndex?: number | null | undefined;
};

/**
 * Matches list items as the user types (focus/highlight follows the typed prefix).
 * Replacement for `useTypeahead`.
 */
export class TypeaheadInteraction {
    private options: TypeaheadInteractionOptions;

    private readonly store: FloatingRootStore;

    private readonly timeout = new Timeout();

    private typedString = '';

    private prevIndex: number | null;

    private matchIndex: number | null = null;

    private previousOpen: boolean;

    private readonly unsubscribe: () => void;

    private readonly reference: Record<string, unknown>;

    private readonly floating: Record<string, unknown>;

    constructor(store: FloatingRootStore, options: TypeaheadInteractionOptions) {
        this.store = store;
        this.options = options;
        this.prevIndex = options.selectedIndex ?? options.activeIndex ?? -1;
        this.previousOpen = store.select('open');
        this.reference = { onKeyDown: this.onKeyDown };
        this.floating = { onKeyDown: this.onKeyDown, onKeyUp: this.onKeyUp };
        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync(true);
    }

    setOptions(options: TypeaheadInteractionOptions) {
        this.options = options;
        this.sync();
    }

    getProps(): InteractionProps {
        return this.options.enabled === false ? {} : { reference: this.reference, floating: this.floating };
    }

    destroy() {
        this.unsubscribe();
        this.timeout.clear();
    }

    private sync(initial = false) {
        const open = this.store.select('open');

        if (open && (initial || !this.previousOpen)) {
            this.timeout.clear();
            this.matchIndex = null;
            this.typedString = '';
        }
        this.previousOpen = open;

        // Sync arrow key navigation but not typeahead navigation.
        if (open && this.typedString === '') {
            this.prevIndex = this.options.selectedIndex ?? this.options.activeIndex ?? -1;
        }
    }

    private setTypingChange(value: boolean) {
        const dataRef = this.store.context.dataRef;
        if (value ? !dataRef.current.typing : dataRef.current.typing) {
            dataRef.current.typing = value;
            this.options.onTypingChange?.(value);
        }
    }

    private getMatchingIndex(list: (string | null)[], orderedList: (string | null)[], value: string) {
        const { findMatch } = this.options;
        const str = findMatch
            ? findMatch(orderedList, value)
            : orderedList.find((text) => text?.toLocaleLowerCase().indexOf(value.toLocaleLowerCase()) === 0);
        return str ? list.indexOf(str) : -1;
    }

    private readonly onKeyDown = (event: KeyboardEvent) => {
        const { listRef, ignoreKeys = EMPTY_ARRAY as readonly string[], resetMs = 750, onMatch } = this.options;
        const listContent = listRef.current;
        const open = this.store.select('open');

        if (this.typedString.length > 0 && this.typedString[0] !== ' ') {
            if (this.getMatchingIndex(listContent, listContent, this.typedString) === -1) {
                this.setTypingChange(false);
            } else if (event.key === ' ') {
                stopEvent(event);
            }
        }

        if (
            listContent == null ||
            ignoreKeys.includes(event.key) ||
            // Character key.
            event.key.length !== 1 ||
            // Modifier key.
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
        ) {
            return;
        }

        if (open && event.key !== ' ') {
            stopEvent(event);
            this.setTypingChange(true);
        }

        // Bail out if the list contains a word like "llama" or "aaron".
        const allowRapidSuccessionOfFirstLetter = listContent.every((text) =>
            text ? text[0]?.toLocaleLowerCase() !== text[1]?.toLocaleLowerCase() : true
        );

        // Allows the user to cycle through items that start with the same letter in rapid succession.
        if (allowRapidSuccessionOfFirstLetter && this.typedString === event.key) {
            this.typedString = '';
            this.prevIndex = this.matchIndex;
        }

        this.typedString += event.key;
        this.timeout.start(resetMs, () => {
            this.typedString = '';
            this.prevIndex = this.matchIndex;
            this.setTypingChange(false);
        });

        const prevIndex = this.prevIndex;

        const index = this.getMatchingIndex(
            listContent,
            [...listContent.slice((prevIndex || 0) + 1), ...listContent.slice(0, (prevIndex || 0) + 1)],
            this.typedString
        );

        if (index !== -1) {
            onMatch?.(index);
            this.matchIndex = index;
        } else if (event.key !== ' ') {
            this.typedString = '';
            this.setTypingChange(false);
        }
    };

    private readonly onKeyUp = (event: KeyboardEvent) => {
        if (event.key === ' ') {
            this.setTypingChange(false);
        }
    };
}

import type { Dimensions } from '@floating-ui/utils';

import { EMPTY_ARRAY } from '~@lib/constants';
import { isElementDisabled } from '~@lib/isElementDisabled';
import {
    createGridCellMap,
    findNonDisabledListIndex,
    getGridCellIndexOfCorner,
    getGridCellIndices,
    getGridNavigatedIndex,
    getMaxListIndex,
    getMinListIndex,
    isIndexOutOfListBounds,
    isListIndexDisabled
} from '~@packages/floating-ui/utils/composite';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '~@packages/floating-ui/utils/constants';
import { Store } from '~@store/Store';

import type { TextDirection } from '~@lib/types';

import { ListRegistry } from '../list/ListRegistry';
import {
    ACTIVE_COMPOSITE_ITEM,
    ALL_KEYS,
    ARROW_KEYS,
    END,
    HOME,
    HORIZONTAL_KEYS,
    HORIZONTAL_KEYS_WITH_EXTRA_KEYS,
    isModifierKeySet,
    isNativeInput,
    scrollIntoViewIfNeeded,
    VERTICAL_KEYS,
    VERTICAL_KEYS_WITH_EXTRA_KEYS
} from '../utils/compositeKeys';

import type { ListRegistryMap } from '../list/ListRegistry';
import type { ModifierKey } from '../utils/compositeKeys';

export type CompositeOrientation = 'horizontal' | 'vertical' | 'both';

export type CompositeRootOptions = {
    /**
     * @default 'both'
     */
    orientation?: CompositeOrientation | undefined;
    /**
     * @default 1
     */
    cols?: number | undefined;
    /**
     * @default true
     */
    loopFocus?: boolean | undefined;
    /**
     * Controlled highlighted index.
     */
    highlightedIndex?: number | undefined;
    onHighlightedIndexChange?: ((index: number) => void) | undefined;
    /**
     * @default false
     */
    dense?: boolean | undefined;
    direction: TextDirection;
    itemSizes?: Dimensions[] | undefined;
    /**
     * Whether Home/End move focus to the first/last item.
     * @default false
     */
    enableHomeAndEndKeys?: boolean | undefined;
    /**
     * Whether navigation keydown events are stopped from propagating.
     * @default false
     */
    stopEventPropagation?: boolean | undefined;
    /**
     * Item indices considered disabled (for items focusable when disabled).
     */
    disabledIndices?: number[] | undefined;
    /**
     * Modifier keys that still allow navigation.
     * @default []
     */
    modifierKeys?: ModifierKey[] | undefined;
    /**
     * Whether hovering an item highlights (focuses) it.
     * @default false
     */
    highlightItemOnHover?: boolean | undefined;
};

type CompositeKeyboardEvent = KeyboardEvent & { target: EventTarget | null };

/**
 * Roving tab index and arrow-key navigation over the items of a composite widget
 * (toolbars, tabs, radio groups, toggle groups, menubars).
 * Replacement for `useCompositeRoot` + `CompositeRoot`.
 */
export class CompositeRootMachine {
    /**
     * Internal (uncontrolled) highlighted index.
     */
    readonly store = new Store({ highlightedIndex: 0 });

    readonly registry: ListRegistry;

    private options: CompositeRootOptions;

    private root: HTMLElement | null = null;

    private hasSetDefaultIndex = false;

    constructor(options: CompositeRootOptions) {
        this.options = options;
        this.registry = new ListRegistry({ onMapChange: this.onMapChange });
    }

    setOptions(options: CompositeRootOptions) {
        this.options = options;
    }

    get elementsRef() {
        return this.registry.elementsRef;
    }

    /**
     * The highlighted index: the controlled one if provided.
     */
    get highlightedIndex() {
        return this.options.highlightedIndex ?? this.store.state.highlightedIndex;
    }

    setRoot = (element: HTMLElement | null) => {
        this.root = element;
    };

    onHighlightedIndexChange = (index: number, shouldScrollIntoView = false) => {
        const { onHighlightedIndexChange, direction, orientation = 'both' } = this.options;
        if (onHighlightedIndexChange) {
            onHighlightedIndexChange(index);
        } else {
            this.store.set('highlightedIndex', index);
        }

        if (shouldScrollIntoView) {
            const newActiveItem = this.elementsRef.current[index];
            scrollIntoViewIfNeeded(this.root, newActiveItem ?? null, direction, orientation);
        }
    };

    /**
     * Props of the root element (`aria-orientation`, focus and keyboard handlers).
     */
    getRootProps() {
        const { orientation = 'both' } = this.options;
        return {
            'aria-orientation': orientation === 'both' ? undefined : orientation,
            onFocus: this.onFocus,
            onKeyDown: this.onKeyDown
        };
    }

    /**
     * Props of an item with `index` (roving tab index, highlight on focus/hover).
     */
    getItemProps(index: number) {
        const isHighlighted = this.highlightedIndex === index;
        return {
            tabIndex: isHighlighted ? 0 : -1,
            onFocus: () => {
                this.onHighlightedIndexChange(index);
            },
            onMouseMove: (event: MouseEvent) => {
                const item = event.currentTarget as HTMLElement | null;
                if (!this.options.highlightItemOnHover || !item) {
                    return;
                }
                const disabled = item.hasAttribute('disabled') || item.ariaDisabled === 'true';
                if (this.highlightedIndex !== index && !disabled) {
                    item.focus();
                }
            }
        };
    }

    /**
     * Relays a keyboard event from another element (e.g. a nested input) to the navigation.
     */
    relayKeyboardEvent = (event: KeyboardEvent) => {
        this.onKeyDown(event as CompositeKeyboardEvent);
    };

    destroy() {
        this.registry.destroy();
    }

    private readonly onMapChange = (map: ListRegistryMap<Record<string, unknown>>) => {
        if (map.size === 0 || this.hasSetDefaultIndex) {
            return;
        }
        this.hasSetDefaultIndex = true;
        const sortedElements = Array.from(map.keys());
        const activeItem = (sortedElements.find((compositeElement) => compositeElement?.hasAttribute(ACTIVE_COMPOSITE_ITEM)) ??
            null) as HTMLElement | null;
        // Set the default highlighted index of an arbitrary composite item.
        const activeIndex = activeItem ? sortedElements.indexOf(activeItem) : -1;

        if (activeIndex !== -1) {
            this.onHighlightedIndexChange(activeIndex);
        }

        scrollIntoViewIfNeeded(this.root, activeItem, this.options.direction, this.options.orientation ?? 'both');
    };

    private readonly onFocus = (event: FocusEvent) => {
        const target = event.target;
        if (!this.root || !isNativeInput(target)) {
            return;
        }
        target.setSelectionRange(0, target.value.length ?? 0);
    };

    private readonly onKeyDown = (event: CompositeKeyboardEvent) => {
        const {
            itemSizes,
            cols = 1,
            loopFocus = true,
            dense = false,
            orientation = 'both',
            direction,
            enableHomeAndEndKeys = false,
            stopEventPropagation = false,
            disabledIndices,
            modifierKeys = EMPTY_ARRAY as ModifierKey[]
        } = this.options;
        const elementsRef = this.elementsRef;
        const highlightedIndex = this.highlightedIndex;
        const isGrid = cols > 1;

        const RELEVANT_KEYS = enableHomeAndEndKeys ? ALL_KEYS : ARROW_KEYS;
        if (!RELEVANT_KEYS.has(event.key)) {
            return;
        }

        if (isModifierKeySet(event, modifierKeys)) {
            return;
        }

        if (!this.root) {
            return;
        }
        const isRtl = direction === 'rtl';

        const horizontalForwardKey = isRtl ? ARROW_LEFT : ARROW_RIGHT;
        const forwardKey = { horizontal: horizontalForwardKey, vertical: ARROW_DOWN, both: horizontalForwardKey }[orientation];
        const horizontalBackwardKey = isRtl ? ARROW_RIGHT : ARROW_LEFT;
        const backwardKey = { horizontal: horizontalBackwardKey, vertical: ARROW_UP, both: horizontalBackwardKey }[orientation];

        const target = event.target;
        if (isNativeInput(target) && !isElementDisabled(target)) {
            const selectionStart = target.selectionStart;
            const selectionEnd = target.selectionEnd;
            const textContent = target.value ?? '';
            // return to native textbox behavior when
            // 1 - Shift is held to make a text selection, or if there already is a text selection
            if (selectionStart == null || event.shiftKey || selectionStart !== selectionEnd) {
                return;
            }
            // 2 - arrow-ing forward and not in the last position of the text
            if (event.key !== backwardKey && selectionStart < textContent.length) {
                return;
            }
            // 3 - arrow-ing backward and not in the first position of the text
            if (event.key !== forwardKey && selectionStart > 0) {
                return;
            }
        }

        let nextIndex = highlightedIndex;
        const minIndex = getMinListIndex(elementsRef, disabledIndices);
        const maxIndex = getMaxListIndex(elementsRef, disabledIndices);

        if (isGrid) {
            const sizes = itemSizes || Array.from({ length: elementsRef.current.length }, () => ({ width: 1, height: 1 }));
            // To calculate movements on the grid, we use hypothetical cell indices
            // as if every item was 1x1, then convert back to real indices.
            const cellMap = createGridCellMap(sizes, cols, dense);
            const minGridIndex = cellMap.findIndex((index) => index != null && !isListIndexDisabled(elementsRef, index, disabledIndices));
            // last enabled index
            const maxGridIndex = cellMap.reduce(
                (foundIndex: number, index, cellIndex) =>
                    index != null && !isListIndexDisabled(elementsRef, index, disabledIndices) ? cellIndex : foundIndex,
                -1
            );

            let corner: 'bl' | 'tr' | 'tl' = 'tl';
            if (event.key === ARROW_DOWN) {
                corner = 'bl';
            } else if (event.key === ARROW_RIGHT) {
                corner = 'tr';
            }

            nextIndex = cellMap[
                getGridNavigatedIndex(
                    { current: cellMap.map((itemIndex) => (itemIndex ? (elementsRef.current[itemIndex] ?? null) : null)) },
                    {
                        event,
                        orientation,
                        loopFocus,
                        cols,
                        // treat undefined (empty grid spaces) as disabled indices so we
                        // don't end up in them
                        disabledIndices: getGridCellIndices(
                            [
                                ...(disabledIndices ||
                                    elementsRef.current.map((_, index) => (isListIndexDisabled(elementsRef, index) ? index : undefined))),
                                undefined
                            ],
                            cellMap
                        ),
                        minIndex: minGridIndex,
                        maxIndex: maxGridIndex,
                        // use a corner matching the edge closest to the direction we're moving in
                        prevIndex: getGridCellIndexOfCorner(
                            highlightedIndex > maxIndex ? minIndex : highlightedIndex,
                            sizes,
                            cellMap,
                            cols,
                            corner
                        ),
                        rtl: isRtl
                    }
                )
            ] as number; // navigated cell will never be nullish
        }

        const forwardKeys = { horizontal: [horizontalForwardKey], vertical: [ARROW_DOWN], both: [horizontalForwardKey, ARROW_DOWN] }[
            orientation
        ];
        const backwardKeys = { horizontal: [horizontalBackwardKey], vertical: [ARROW_UP], both: [horizontalBackwardKey, ARROW_UP] }[
            orientation
        ];

        const preventedKeys = isGrid
            ? RELEVANT_KEYS
            : {
                  horizontal: enableHomeAndEndKeys ? HORIZONTAL_KEYS_WITH_EXTRA_KEYS : HORIZONTAL_KEYS,
                  vertical: enableHomeAndEndKeys ? VERTICAL_KEYS_WITH_EXTRA_KEYS : VERTICAL_KEYS,
                  both: RELEVANT_KEYS
              }[orientation];

        if (enableHomeAndEndKeys) {
            if (event.key === HOME) {
                nextIndex = minIndex;
            } else if (event.key === END) {
                nextIndex = maxIndex;
            }
        }

        if (nextIndex === highlightedIndex && (forwardKeys.includes(event.key) || backwardKeys.includes(event.key))) {
            if (loopFocus && nextIndex === maxIndex && forwardKeys.includes(event.key)) {
                nextIndex = minIndex;
            } else if (loopFocus && nextIndex === minIndex && backwardKeys.includes(event.key)) {
                nextIndex = maxIndex;
            } else {
                nextIndex = findNonDisabledListIndex(elementsRef, {
                    startingIndex: nextIndex,
                    decrement: backwardKeys.includes(event.key),
                    disabledIndices
                });
            }
        }

        if (nextIndex !== highlightedIndex && !isIndexOutOfListBounds(elementsRef, nextIndex)) {
            if (stopEventPropagation) {
                event.stopPropagation();
            }

            if (preventedKeys.has(event.key)) {
                event.preventDefault();
            }
            this.onHighlightedIndexChange(nextIndex, true);

            // Wait for the focus manager `returnFocus` to execute.
            queueMicrotask(() => {
                elementsRef.current[nextIndex]?.focus();
            });
        }
    };
}

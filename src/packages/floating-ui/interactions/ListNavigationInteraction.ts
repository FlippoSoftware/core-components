import { isHTMLElement } from '@floating-ui/utils/dom';

import type { Dimensions } from '@floating-ui/utils';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import type { MutableRef } from '~@lib/types';

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
} from '../utils/composite';
import { ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP } from '../utils/constants';
import { activeElement, contains, getDocument, getFloatingFocusElement, getTarget, isTypeableCombobox } from '../utils/element';
import { enqueueFocus } from '../utils/enqueueFocus';
import { getNativeEvent, isVirtualClick, isVirtualPointerEvent, stopEvent } from '../utils/event';

import type { FloatingRootStore } from '../FloatingRootStore';
import type { FloatingTreeStore } from '../FloatingTreeStore';
import type { InteractionProps } from '../types';
import type { DisabledIndices } from '../utils/composite';

export const ESCAPE = 'Escape';

export type ListOrientation = 'vertical' | 'horizontal' | 'both';

function doSwitch(orientation: ListOrientation | undefined, vertical: boolean, horizontal: boolean) {
    switch (orientation) {
        case 'vertical':
            return vertical;
        case 'horizontal':
            return horizontal;
        default:
            return vertical || horizontal;
    }
}

function isMainOrientationKey(key: string, orientation: ListOrientation | undefined) {
    const vertical = key === ARROW_UP || key === ARROW_DOWN;
    const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
    return doSwitch(orientation, vertical, horizontal);
}

function isMainOrientationToEndKey(key: string, orientation: ListOrientation | undefined, rtl: boolean) {
    const vertical = key === ARROW_DOWN;
    const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
    return doSwitch(orientation, vertical, horizontal) || key === 'Enter' || key === ' ' || key === '';
}

function isCrossOrientationOpenKey(key: string, orientation: ListOrientation | undefined, rtl: boolean) {
    const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
    const horizontal = key === ARROW_DOWN;
    return doSwitch(orientation, vertical, horizontal);
}

function isCrossOrientationCloseKey(key: string, orientation: ListOrientation | undefined, rtl: boolean, cols?: number) {
    const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
    const horizontal = key === ARROW_UP;
    if (orientation === 'both' || (orientation === 'horizontal' && cols && cols > 1)) {
        return key === ESCAPE;
    }
    return doSwitch(orientation, vertical, horizontal);
}

/**
 * Event passed to `onNavigate`: the native event or the adapter's wrapper.
 */
export type NavigationEvent = Event | { nativeEvent: Event };

export type ListNavigationInteractionOptions = {
    /**
     * List items, ordered by index.
     */
    listRef: MutableRef<(HTMLElement | null)[]>;
    /**
     * The index of the currently active (focused or highlighted) item.
     */
    activeIndex: number | null;
    /**
     * Called when the user navigates to a new active item.
     */
    onNavigate?: ((activeIndex: number | null, event: NavigationEvent | undefined) => void) | undefined;
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * The currently selected item index.
     * @default null
     */
    selectedIndex?: number | null | undefined;
    /**
     * Whether to focus the item upon opening. 'auto' infers it from the input type.
     * @default 'auto'
     */
    focusItemOnOpen?: boolean | 'auto' | undefined;
    /**
     * Whether hovering an item synchronizes the focus.
     * @default true
     */
    focusItemOnHover?: boolean | undefined;
    /**
     * Whether pressing an arrow key on the main axis opens the floating element.
     * @default true
     */
    openOnArrowKeyDown?: boolean | undefined;
    /**
     * Indices to treat as disabled (overrides `disabled`/`aria-disabled` detection).
     */
    disabledIndices?: DisabledIndices | undefined;
    /**
     * Whether focus can escape the list (requires `loopFocus` and `virtual`).
     * @default false
     */
    allowEscape?: boolean | undefined;
    /**
     * Whether focus loops past the first/last item.
     * @default false
     */
    loopFocus?: boolean | undefined;
    /**
     * Whether the list is nested within another one (e.g. a submenu).
     * @default false
     */
    nested?: boolean | undefined;
    /**
     * Orientation of the parent list.
     */
    parentOrientation?: ListOrientation | undefined;
    /**
     * @default false
     */
    rtl?: boolean | undefined;
    /**
     * Whether the focus is virtual (`aria-activedescendant`).
     * @default false
     */
    virtual?: boolean | undefined;
    /**
     * @default 'vertical'
     */
    orientation?: ListOrientation | undefined;
    /**
     * Number of columns (grid).
     * @default 1
     */
    cols?: number | undefined;
    /**
     * Whether to scroll the active item into view when navigating.
     * @default true
     */
    scrollItemIntoView?: boolean | ScrollIntoViewOptions | undefined;
    /**
     * Grid item sizes (only for `cols > 1`).
     */
    itemSizes?: Dimensions[] | undefined;
    /**
     * Whether the grid is dense (only for `cols > 1`).
     * @default false
     */
    dense?: boolean | undefined;
    /**
     * The id of the root component (for `aria-activedescendant`).
     */
    id?: string | undefined;
    /**
     * Whether to clear the active index when the pointer leaves an item.
     * @default true
     */
    resetOnPointerLeave?: boolean | undefined;
    /**
     * The floating tree (nested popups).
     */
    tree?: FloatingTreeStore | null | undefined;
    /**
     * ID of the parent tree node.
     */
    parentId?: string | null | undefined;
};

type ItemEvent = { currentTarget: EventTarget | null };

/**
 * Arrow-key navigation of a list of items, with real DOM focus or virtual focus.
 * Replacement for `useListNavigation`.
 */
export class ListNavigationInteraction {
    private options: ListNavigationInteractionOptions;

    private readonly store: FloatingRootStore;

    private focusItemOnOpen: boolean | 'auto';

    private index: number;

    private key: string | null = null;

    private isPointerModality = true;

    private forceSyncFocus = false;

    private forceScrollIntoView = false;

    private previousMounted: boolean;

    private previousOpen: boolean;

    private previousOnNavigate: () => void;

    private effectDeps: Record<string, unknown[]> = {};

    private readonly unsubscribe: () => void;

    private readonly itemProps: Record<string, unknown>;

    private readonly floatingHandlers: Record<string, unknown>;

    private readonly triggerProps: Record<string, unknown>;

    constructor(store: FloatingRootStore, options: ListNavigationInteractionOptions) {
        this.store = store;
        this.options = options;
        this.focusItemOnOpen = options.focusItemOnOpen ?? 'auto';
        this.index = options.selectedIndex ?? -1;
        this.previousMounted = Boolean(store.select('floatingElement'));
        this.previousOpen = store.select('open');
        this.previousOnNavigate = this.onNavigate;
        this.warn();

        this.itemProps = {
            onFocus: this.onItemFocus,
            onClick: this.onItemClick,
            onMouseMove: this.onItemMouseMove,
            onPointerLeave: this.onItemPointerLeave
        };
        this.floatingHandlers = {
            onKeyDown: this.onFloatingKeyDown,
            onPointerMove: this.onFloatingPointerMove
        };
        this.triggerProps = {
            onKeyDown: this.onTriggerKeyDown,
            onFocus: this.onTriggerFocus,
            onPointerDown: this.checkVirtualPointer,
            onPointerEnter: this.checkVirtualPointer,
            onMouseDown: this.checkVirtualMouse,
            onClick: this.checkVirtualMouse
        };

        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: ListNavigationInteractionOptions) {
        this.options = options;
        this.sync();
    }

    getProps(): InteractionProps {
        const { enabled = true, virtual = false, id, activeIndex, orientation = 'vertical' } = this.options;
        if (!enabled) {
            return {};
        }

        const open = this.store.select('open');
        const typeableComboboxReference = isTypeableCombobox(this.store.select('domReferenceElement'));
        const ariaActiveDescendantProp = virtual && open && activeIndex != null ? { 'aria-activedescendant': `${id}-${activeIndex}` } : {};

        const floating = {
            'aria-orientation': orientation === 'both' ? undefined : orientation,
            ...(typeableComboboxReference ? {} : ariaActiveDescendantProp),
            ...this.floatingHandlers
        };

        return {
            reference: { ...ariaActiveDescendantProp, ...this.triggerProps },
            floating,
            item: this.itemProps,
            trigger: this.triggerProps
        };
    }

    destroy() {
        this.unsubscribe();
    }

    private get settings() {
        const {
            listRef,
            activeIndex,
            enabled = true,
            selectedIndex = null,
            allowEscape = false,
            loopFocus = false,
            nested = false,
            rtl = false,
            virtual = false,
            focusItemOnOpen = 'auto',
            focusItemOnHover = true,
            openOnArrowKeyDown = true,
            disabledIndices,
            orientation = 'vertical',
            parentOrientation,
            cols = 1,
            scrollItemIntoView = true,
            itemSizes,
            dense = false,
            resetOnPointerLeave = true,
            tree = null,
            parentId = null
        } = this.options;
        return {
            listRef,
            activeIndex,
            enabled,
            selectedIndex,
            allowEscape,
            loopFocus,
            nested,
            rtl,
            virtual,
            focusItemOnOpen,
            focusItemOnHover,
            openOnArrowKeyDown,
            disabledIndices,
            orientation,
            parentOrientation,
            cols,
            scrollItemIntoView,
            itemSizes,
            dense,
            resetOnPointerLeave,
            tree,
            parentId
        };
    }

    private warn() {
        if (process.env.NODE_ENV !== 'production') {
            const { allowEscape, loopFocus, virtual, orientation, cols } = this.settings;
            if (allowEscape) {
                if (!loopFocus) {
                    // biome-ignore lint/suspicious/noConsole: development-only warning.
                    console.warn('`useListNavigation` looping must be enabled to allow escaping.');
                }

                if (!virtual) {
                    // biome-ignore lint/suspicious/noConsole: development-only warning.
                    console.warn('`useListNavigation` must be virtual to allow escaping.');
                }
            }

            if (orientation === 'vertical' && cols > 1) {
                // biome-ignore lint/suspicious/noConsole: development-only warning.
                console.warn('In grid list navigation mode (`cols` > 1), the `orientation` should', 'be either "horizontal" or "both".');
            }
        }
    }

    private changed(name: string, deps: unknown[]) {
        const previous = this.effectDeps[name];
        this.effectDeps[name] = deps;
        return !previous || previous.length !== deps.length || deps.some((dep, index) => !Object.is(dep, previous[index]));
    }

    private readonly onNavigate = (event?: NavigationEvent) => {
        this.options.onNavigate?.(this.index === -1 ? null : this.index, event);
    };

    /**
     * Runs the layout-effect equivalents in their original order.
     */
    private sync() {
        const { enabled, selectedIndex, activeIndex, nested, orientation, rtl, tree, parentId, virtual, focusItemOnOpen, listRef } =
            this.settings;
        const open = this.store.select('open');
        const floatingElement = this.store.select('floatingElement');

        if (this.changed('orientation', [orientation])) {
            this.store.context.dataRef.current.orientation = orientation;
        }

        // Sync `selectedIndex` to be the `activeIndex` upon opening the floating
        // element. Also, reset `activeIndex` upon closing the floating element.
        if (this.changed('selected', [enabled, open, floatingElement, selectedIndex]) && enabled) {
            if (open && floatingElement) {
                this.index = selectedIndex ?? -1;
                if (this.focusItemOnOpen && selectedIndex != null) {
                    // Regardless of the pointer modality, we want to ensure the selected
                    // item comes into view when the floating element is opened.
                    this.forceScrollIntoView = true;
                    this.onNavigate();
                }
            } else if (this.previousMounted) {
                this.index = -1;
                this.previousOnNavigate();
            }
        }

        // Sync `activeIndex` to be the focused item while the floating element is open.
        if (this.changed('active', [enabled, open, floatingElement, activeIndex, nested, listRef, orientation, rtl])) {
            this.syncActiveIndex(enabled, open, floatingElement, activeIndex);
        }

        // Ensure the parent floating element has focus when a nested child closes
        // to allow arrow key navigation to work after the pointer leaves the child.
        if (
            this.changed('parentFocus', [enabled, floatingElement, tree, parentId, virtual]) &&
            enabled &&
            !floatingElement &&
            tree &&
            !virtual &&
            this.previousMounted
        ) {
            const nodes = tree.nodesRef.current;
            const parent = nodes.find((node) => node.id === parentId)?.context?.elements.floating;
            const activeEl = activeElement(getDocument(floatingElement));
            const treeContainsActiveEl = nodes.some((node) => node.context && contains(node.context.elements.floating, activeEl));

            if (parent && !treeContainsActiveEl && this.isPointerModality) {
                parent.focus({ preventScroll: true });
            }
        }

        this.previousOnNavigate = this.onNavigate;
        this.previousOpen = open;
        this.previousMounted = Boolean(floatingElement);

        if (this.changed('reset', [open, focusItemOnOpen]) && !open) {
            this.key = null;
            this.focusItemOnOpen = focusItemOnOpen;
        }
    }

    private syncActiveIndex(enabled: boolean, open: boolean, floatingElement: HTMLElement | null, activeIndex: number | null) {
        const { listRef, selectedIndex, nested, orientation, rtl } = this.settings;

        if (!enabled) {
            return;
        }
        if (!open) {
            this.forceSyncFocus = false;
            return;
        }
        if (!floatingElement) {
            return;
        }

        if (activeIndex == null) {
            this.forceSyncFocus = false;

            if (selectedIndex != null) {
                return;
            }

            // Reset while the floating element was open (e.g. the list changed).
            if (this.previousMounted) {
                this.index = -1;
                this.focusItem();
            }

            // Initial sync.
            if (
                (!this.previousOpen || !this.previousMounted) &&
                this.focusItemOnOpen &&
                (this.key != null || (this.focusItemOnOpen === true && this.key == null))
            ) {
                let runs = 0;
                const waitForListPopulated = () => {
                    if (listRef.current[0] == null) {
                        // Avoid letting the browser paint if possible on the first try,
                        // otherwise use rAF. Don't try more than twice, since something
                        // is wrong otherwise.
                        if (runs < 2) {
                            const scheduler = runs ? requestAnimationFrame : queueMicrotask;
                            scheduler(waitForListPopulated);
                        }
                        runs += 1;
                    } else {
                        // initially focus the first non-disabled item
                        this.index =
                            this.key == null || isMainOrientationToEndKey(this.key, orientation, rtl) || nested
                                ? getMinListIndex(listRef)
                                : getMaxListIndex(listRef);
                        this.key = null;
                        this.onNavigate();
                    }
                };

                waitForListPopulated();
            }
        } else if (!isIndexOutOfListBounds(listRef, activeIndex)) {
            this.index = activeIndex;
            this.focusItem();
            this.forceScrollIntoView = false;
        }
    }

    private focusItem() {
        const { listRef, virtual, tree, scrollItemIntoView } = this.settings;

        const runFocus = (item: HTMLElement) => {
            if (virtual) {
                tree?.events.emit('virtualfocus', item);
            } else {
                enqueueFocus(item, { sync: this.forceSyncFocus, preventScroll: true });
            }
        };

        const initialItem = listRef.current[this.index];
        const forceScrollIntoView = this.forceScrollIntoView;

        if (initialItem) {
            runFocus(initialItem);
        }

        const scheduler = this.forceSyncFocus ? (fn: () => void) => fn() : requestAnimationFrame;

        scheduler(() => {
            const waitedItem = listRef.current[this.index] || initialItem;

            if (!waitedItem) {
                return;
            }

            if (!initialItem) {
                runFocus(waitedItem);
            }

            const shouldScrollIntoView = scrollItemIntoView && waitedItem && (forceScrollIntoView || !this.isPointerModality);

            if (shouldScrollIntoView) {
                // JSDOM doesn't support `.scrollIntoView()` but it's widely supported by all browsers.
                waitedItem.scrollIntoView?.(
                    typeof scrollItemIntoView === 'boolean' ? { block: 'nearest', inline: 'nearest' } : scrollItemIntoView
                );
            }
        });
    }

    private getParentOrientation(): ListOrientation | undefined {
        const { parentOrientation, tree, parentId } = this.settings;
        return (
            parentOrientation ??
            (tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.dataRef.current.orientation as
                | ListOrientation
                | undefined)
        );
    }

    private syncCurrentTarget(event: ItemEvent) {
        if (!this.store.select('open')) {
            return;
        }
        const index = this.settings.listRef.current.indexOf(event.currentTarget as HTMLElement);
        if (index !== -1 && this.index !== index) {
            this.index = index;
            this.onNavigate(event as unknown as NavigationEvent);
        }
    }

    private readonly onItemFocus = (event: FocusEvent) => {
        this.forceSyncFocus = true;
        this.syncCurrentTarget(event);
    };

    // Safari
    private readonly onItemClick = (event: MouseEvent) => {
        (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    };

    private readonly onItemMouseMove = (event: MouseEvent) => {
        this.forceSyncFocus = true;
        this.forceScrollIntoView = false;
        if (this.settings.focusItemOnHover) {
            this.syncCurrentTarget(event);
        }
    };

    private readonly onItemPointerLeave = (event: PointerEvent) => {
        const { focusItemOnHover, listRef, resetOnPointerLeave, virtual } = this.settings;
        if (!this.store.select('open') || !this.isPointerModality || event.pointerType === 'touch') {
            return;
        }

        this.forceSyncFocus = true;

        const relatedTarget = event.relatedTarget as HTMLElement | null;

        if (!focusItemOnHover || listRef.current.includes(relatedTarget)) {
            return;
        }

        if (!resetOnPointerLeave) {
            return;
        }

        this.index = -1;
        this.onNavigate(event);

        if (!virtual) {
            getFloatingFocusElement(this.store.select('floatingElement'))?.focus({ preventScroll: true });
        }
    };

    private readonly onFloatingPointerMove = () => {
        this.isPointerModality = true;
    };

    private readonly onFloatingKeyDown = (event: KeyboardEvent) => {
        const { virtual } = this.settings;
        const open = this.store.select('open');

        // Close submenu on Shift+Tab
        if (event.key === 'Tab' && event.shiftKey && open && !virtual) {
            // If the event originated from within a nested element (e.g., a Dialog opened from
            // within the menu), don't close the menu. The nested element has its own focus
            // management and should handle the Tab key.
            const target = getTarget(getNativeEvent(event)) as Element | null;
            if (target && !contains(getFloatingFocusElement(this.store.select('floatingElement')), target)) {
                return;
            }

            stopEvent(event);
            this.store.setOpen(false, createChangeEventDetails(REASONS.focusOut, getNativeEvent(event)));

            const domReferenceElement = this.store.select('domReferenceElement');
            if (isHTMLElement(domReferenceElement)) {
                domReferenceElement.focus();
            }

            return;
        }

        this.commonOnKeyDown(event);
    };

    private readonly commonOnKeyDown = (event: KeyboardEvent) => {
        const { nested, orientation, rtl, cols, virtual, tree, listRef, disabledIndices, itemSizes, dense, loopFocus, allowEscape } =
            this.settings;
        const open = this.store.select('open');
        const domReferenceElement = this.store.select('domReferenceElement');

        this.isPointerModality = false;
        this.forceSyncFocus = true;

        // When composing a character, Chrome fires ArrowDown twice. Firefox/Safari
        // don't appear to suffer from this. `event.isComposing` is avoided due to
        // Safari not supporting it properly.
        if (event.which === 229) {
            return;
        }

        // If the floating element is animating out, ignore navigation. Otherwise,
        // the `activeIndex` gets set to 0 despite not being open so the next time
        // the user ArrowDowns, the first item won't be focused.
        if (!open && event.currentTarget === getFloatingFocusElement(this.store.select('floatingElement'))) {
            return;
        }

        if (nested && isCrossOrientationCloseKey(event.key, orientation, rtl, cols)) {
            // If the nested list's close key is also the parent navigation key,
            // let the parent navigate. Otherwise, stop propagating the event.
            if (!isMainOrientationKey(event.key, this.getParentOrientation())) {
                stopEvent(event);
            }

            this.store.setOpen(false, createChangeEventDetails(REASONS.listNavigation, getNativeEvent(event)));

            if (isHTMLElement(domReferenceElement)) {
                if (virtual) {
                    tree?.events.emit('virtualfocus', domReferenceElement);
                } else {
                    domReferenceElement.focus();
                }
            }

            return;
        }

        const currentIndex = this.index;
        const minIndex = getMinListIndex(listRef, disabledIndices);
        const maxIndex = getMaxListIndex(listRef, disabledIndices);

        if (!isTypeableCombobox(domReferenceElement)) {
            if (event.key === 'Home') {
                stopEvent(event);
                this.index = minIndex;
                this.onNavigate(event);
            }

            if (event.key === 'End') {
                stopEvent(event);
                this.index = maxIndex;
                this.onNavigate(event);
            }
        }

        // Grid navigation.
        if (cols > 1) {
            const sizes = itemSizes || Array.from({ length: listRef.current.length }, () => ({ width: 1, height: 1 }));
            // To calculate movements on the grid, we use hypothetical cell indices
            // as if every item was 1x1, then convert back to real indices.
            const cellMap = createGridCellMap(sizes, cols, dense);
            const minGridIndex = cellMap.findIndex((index) => index != null && !isListIndexDisabled(listRef, index, disabledIndices));
            // last enabled index
            const maxGridIndex = cellMap.reduce(
                (foundIndex: number, index, cellIndex) =>
                    index != null && !isListIndexDisabled(listRef, index, disabledIndices) ? cellIndex : foundIndex,
                -1
            );

            let cornerKey: 'bl' | 'tr' | 'tl' = 'tl';
            if (event.key === ARROW_DOWN) {
                cornerKey = 'bl';
            } else if (event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)) {
                cornerKey = 'tr';
            }

            const index =
                cellMap[
                    getGridNavigatedIndex(
                        { current: cellMap.map((itemIndex) => (itemIndex != null ? (listRef.current[itemIndex] ?? null) : null)) },
                        {
                            event,
                            orientation,
                            loopFocus,
                            rtl,
                            cols,
                            // treat undefined (empty grid spaces) as disabled indices so we
                            // don't end up in them
                            disabledIndices: getGridCellIndices(
                                [
                                    ...((typeof disabledIndices !== 'function' ? disabledIndices : null) ||
                                        listRef.current.map((_, listIndex) =>
                                            isListIndexDisabled(listRef, listIndex, disabledIndices) ? listIndex : undefined
                                        )),
                                    undefined
                                ],
                                cellMap
                            ),
                            minIndex: minGridIndex,
                            maxIndex: maxGridIndex,
                            // use a corner matching the edge closest to the direction
                            // we're moving in so we don't end up in the same item.
                            prevIndex: getGridCellIndexOfCorner(
                                this.index > maxIndex ? minIndex : this.index,
                                sizes,
                                cellMap,
                                cols,
                                cornerKey
                            ),
                            stopEvent: true
                        }
                    )
                ];

            if (index != null) {
                this.index = index;
                this.onNavigate(event);
            }

            if (orientation === 'both') {
                return;
            }
        }

        if (!isMainOrientationKey(event.key, orientation)) {
            return;
        }

        stopEvent(event);

        // Reset the index if no item is focused.
        const currentTarget = event.currentTarget as HTMLElement;
        if (open && !virtual && activeElement(currentTarget.ownerDocument) === currentTarget) {
            this.index = isMainOrientationToEndKey(event.key, orientation, rtl) ? minIndex : maxIndex;
            this.onNavigate(event);
            return;
        }

        if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
            if (loopFocus) {
                if (currentIndex >= maxIndex) {
                    if (allowEscape && currentIndex !== listRef.current.length) {
                        this.index = -1;
                    } else {
                        // Give time for virtualizers to update the listRef.
                        this.forceSyncFocus = false;
                        this.index = minIndex;
                    }
                } else {
                    this.index = findNonDisabledListIndex(listRef, { startingIndex: currentIndex, disabledIndices });
                }
            } else {
                this.index = Math.min(maxIndex, findNonDisabledListIndex(listRef, { startingIndex: currentIndex, disabledIndices }));
            }
        } else if (loopFocus) {
            if (currentIndex <= minIndex) {
                if (allowEscape && currentIndex !== -1) {
                    this.index = listRef.current.length;
                } else {
                    // Give time for virtualizers to update the listRef.
                    this.forceSyncFocus = false;
                    this.index = maxIndex;
                }
            } else {
                this.index = findNonDisabledListIndex(listRef, { startingIndex: currentIndex, decrement: true, disabledIndices });
            }
        } else {
            this.index = Math.max(
                minIndex,
                findNonDisabledListIndex(listRef, { startingIndex: currentIndex, decrement: true, disabledIndices })
            );
        }

        if (isIndexOutOfListBounds(listRef, this.index)) {
            this.index = -1;
        }

        this.onNavigate(event);
    };

    private readonly checkVirtualMouse = (event: MouseEvent) => {
        const { focusItemOnOpen, virtual } = this.settings;
        if (focusItemOnOpen === 'auto' && isVirtualClick(getNativeEvent(event))) {
            this.focusItemOnOpen = !virtual;
        }
    };

    private readonly checkVirtualPointer = (event: PointerEvent) => {
        const { focusItemOnOpen } = this.settings;
        // `pointerdown` fires first, reset the state then perform the checks.
        this.focusItemOnOpen = focusItemOnOpen;
        if (focusItemOnOpen === 'auto' && isVirtualPointerEvent(getNativeEvent(event))) {
            this.focusItemOnOpen = true;
        }
    };

    private readonly onTriggerFocus = (event: FocusEvent) => {
        if (this.store.select('open') && !this.settings.virtual) {
            this.index = -1;
            this.onNavigate(event);
        }
    };

    private readonly onTriggerKeyDown = (event: KeyboardEvent) => {
        const { rtl, orientation, nested, virtual, openOnArrowKeyDown, listRef, disabledIndices, selectedIndex } = this.settings;
        // non-reactive open state
        const currentOpen = this.store.select('open');
        this.isPointerModality = false;

        const isArrowKey = event.key.startsWith('Arrow');
        const isParentCrossOpenKey = isCrossOrientationOpenKey(event.key, this.getParentOrientation(), rtl);
        const isMainKey = isMainOrientationKey(event.key, orientation);
        const isNavigationKey = (nested ? isParentCrossOpenKey : isMainKey) || event.key === 'Enter' || event.key.trim() === '';

        if (virtual && currentOpen) {
            this.commonOnKeyDown(event);
            return;
        }

        // If a floating element should not open on arrow key down, avoid
        // setting `activeIndex` while it's closed.
        if (!currentOpen && !openOnArrowKeyDown && isArrowKey) {
            return;
        }

        if (isNavigationKey) {
            const isParentMainKey = isMainOrientationKey(event.key, this.getParentOrientation());
            this.key = nested && isParentMainKey ? null : event.key;
        }

        if (nested) {
            if (isParentCrossOpenKey) {
                stopEvent(event);

                if (currentOpen) {
                    this.index = getMinListIndex(listRef, disabledIndices);
                    this.onNavigate(event);
                } else {
                    this.store.setOpen(
                        true,
                        createChangeEventDetails(REASONS.listNavigation, getNativeEvent(event), event.currentTarget as HTMLElement)
                    );
                }
            }

            return;
        }

        if (isMainKey) {
            if (selectedIndex != null) {
                this.index = selectedIndex;
            }

            stopEvent(event);

            if (!currentOpen && openOnArrowKeyDown) {
                this.store.setOpen(
                    true,
                    createChangeEventDetails(REASONS.listNavigation, getNativeEvent(event), event.currentTarget as HTMLElement)
                );
            } else {
                this.commonOnKeyDown(event);
            }

            if (currentOpen) {
                this.onNavigate(event);
            }
        }
    };
}

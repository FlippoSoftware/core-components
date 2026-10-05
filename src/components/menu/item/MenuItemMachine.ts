import { ButtonMachine } from '~@components/button/root/ButtonMachine';
import { ListRegistryItem } from '~@components/composite/list/ListRegistry';
import { REASONS } from '~@events/reasons';
import { isMac } from '~@lib/detectBrowser';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { ListRegistry } from '~@components/composite/list/ListRegistry';
import type { MutableRef } from '~@lib/types';
import type { PreventableEvent, Props } from '~@props/mergeProps';

import type { MenuStore } from '../store/MenuStore';
import type { ItemEvent } from '../utils/ItemEvent';

type ItemMetadata = { type: 'regular-item' } | { type: 'submenu-trigger'; setActive: () => void };

const REGULAR_ITEM: ItemMetadata = { type: 'regular-item' };

export type MenuItemSetup = {
    /**
     * The item registry of the menu's positioner.
     */
    registry: ListRegistry;
    /**
     * Floating tree node ID of the menu (from the positioner).
     */
    nodeId: string | undefined;
    /**
     * `ContextMenu` data when the menu is a context menu.
     */
    contextMenu?:
        | {
              initialCursorPointRef?: MutableRef<{ x: number; y: number } | null> | undefined;
          }
        | undefined;
};

export type MenuItemBaseOptions = {
    id: string;
    label?: string | undefined;
    /**
     * @default false
     */
    nativeButton?: boolean | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    closeOnClick?: boolean | undefined;
};

/**
 * Behaviour shared by all menu items: list registration, highlight, closing on click,
 * the press-drag-release gesture and the item's props. Replacement for `useMenuItem` + `useMenuItemCommonProps`.
 */
export class MenuItemMachine<Options extends MenuItemBaseOptions = MenuItemBaseOptions> {
    readonly button: ButtonMachine;

    /**
     * The item's index in the menu (changes as items mount).
     */
    readonly index = new Store<{ index: number }>({ index: -1 });

    protected options: Options;

    protected readonly store: MenuStore<unknown>;

    protected readonly setup: MenuItemSetup;

    protected element: HTMLElement | null = null;

    private readonly listItem: ListRegistryItem;

    private readonly metadata: ItemMetadata;

    private readonly defaultCloseOnClick: boolean;

    constructor(
        store: MenuStore<unknown>,
        options: Options,
        setup: MenuItemSetup,
        defaults: { closeOnClick: boolean; metadata?: ItemMetadata } = { closeOnClick: true }
    ) {
        this.store = store;
        this.options = options;
        this.setup = setup;
        this.defaultCloseOnClick = defaults.closeOnClick;
        this.metadata = defaults.metadata ?? REGULAR_ITEM;
        this.button = new ButtonMachine({ disabled: this.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
        this.listItem = new ListRegistryItem(setup.registry, {
            label: options.label,
            onIndexChange: (index) => this.index.set('index', index)
        });
    }

    setOptions(options: Options) {
        this.options = options;
        this.listItem.setLabel(options.label);
        this.button.setOptions({ disabled: this.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
    }

    setElement = (element: HTMLElement | null) => {
        this.handleElement(element);
    };

    get highlighted(): boolean {
        return this.store.select('isActive', this.index.state.index);
    }

    get disabled(): boolean {
        return this.options.disabled ?? false;
    }

    getState(): { disabled: boolean; highlighted: boolean } {
        return { disabled: this.disabled, highlighted: this.highlighted };
    }

    /**
     * Props of the item element (`ownProps` go between the menu's item props and the user's props).
     */
    getItemProps(elementProps: Props = {}, ownProps?: Props): Props {
        return mergeProps(
            this.store.select('itemProps'),
            ownProps,
            elementProps,
            this.getCommonProps(),
            {
                onMouseEnter: () => {
                    if (this.metadata.type === 'submenu-trigger') {
                        this.metadata.setActive();
                    }
                },
                onKeyUp: (event: KeyboardEvent & Partial<PreventableEvent>) => {
                    if (event.key === ' ' && this.store.context.typingRef.current) {
                        event.preventHeadlessUIHandler?.();
                    }
                }
            },
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    destroy() {
        this.listItem.setElement(null);
        this.listItem.destroy();
    }

    protected handleElement(element: HTMLElement | null) {
        this.element = element;
        this.listItem.setElement(element);
        this.button.setElement(element);
        this.index.set('index', this.listItem.getIndex());
    }

    /**
     * Props shared with link items. Replacement for `useMenuItemCommonProps`.
     */
    protected getCommonProps(): Props {
        const { store, setup } = this;
        const closeOnClick = this.options.closeOnClick ?? this.defaultCloseOnClick;
        const events = store.select('floatingTreeRoot').events;
        const contextMenu = setup.contextMenu;

        return {
            id: this.options.id,
            role: 'menuitem',
            tabIndex: this.highlighted ? 0 : -1,
            onMouseMove: (event: { currentTarget: EventTarget | null }) => {
                if (!setup.nodeId) {
                    return;
                }
                // Lets unrelated descendant submenus close when another item of this menu is hovered.
                events.emit('itemhover', { nodeId: setup.nodeId, target: event.currentTarget });
            },
            onClick: (event: ItemEvent) => {
                if (closeOnClick) {
                    events.emit('close', { domEvent: getNativeEvent(event as MouseEvent), reason: REASONS.itemPress });
                }
            },
            onMouseUp: (event: MouseEvent) => {
                if (contextMenu) {
                    const initialCursorPoint = contextMenu.initialCursorPointRef?.current;
                    if (contextMenu.initialCursorPointRef) {
                        contextMenu.initialCursorPointRef.current = null;
                    }
                    if (
                        initialCursorPoint &&
                        Math.abs(event.clientX - initialCursorPoint.x) <= 1 &&
                        Math.abs(event.clientY - initialCursorPoint.y) <= 1
                    ) {
                        return;
                    }
                    // On non-macOS platforms, this mouseup belongs to the right-click that opened the context menu.
                    if (!isMac && event.button === 2) {
                        return;
                    }
                }

                // Press on the trigger, move the cursor and release over the item: click it (always closes the menu).
                if (
                    this.element &&
                    store.context.allowMouseUpTriggerRef.current &&
                    (!contextMenu || event.button === 2) &&
                    this.metadata.type === 'regular-item'
                ) {
                    this.element.click();
                }
            }
        };
    }
}

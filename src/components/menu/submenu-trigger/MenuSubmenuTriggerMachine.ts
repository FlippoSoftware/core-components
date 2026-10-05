import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { triggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { ClickInteraction } from '~@packages/floating-ui/interactions/ClickInteraction';
import { HoverReferenceInteraction } from '~@packages/floating-ui/interactions/hover/HoverReferenceInteraction';
import { mergeInteractionProps } from '~@packages/floating-ui/interactions/mergeInteractionProps';
import { safePolygon } from '~@packages/floating-ui/safePolygon';
import { mergeProps } from '~@props/mergeProps';

import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { Props } from '~@props/mergeProps';

import { MenuItemMachine } from '../item/MenuItemMachine';

import type { MenuItemBaseOptions, MenuItemSetup } from '../item/MenuItemMachine';
import type { MenuStore } from '../store/MenuStore';

export type MenuSubmenuTriggerOptions = MenuItemBaseOptions & {
    /**
     * @default true
     */
    openOnHover?: boolean | undefined;
    /**
     * @default 100
     */
    delay?: number | undefined;
    /**
     * @default 0
     */
    closeDelay?: number | undefined;
};

export type MenuSubmenuTriggerState = {
    disabled: boolean;
    highlighted: boolean;
    open: boolean;
};

/**
 * State machine of `Menu.SubmenuTrigger`: an item of the parent menu that opens the submenu
 * (`store` is the submenu's store, `parentStore` the parent menu's).
 */
export class MenuSubmenuTriggerMachine extends MenuItemMachine<MenuSubmenuTriggerOptions> {
    private readonly parentStore: MenuStore<unknown>;

    private floatingRoot: FloatingRootStore | null = null;

    private click: ClickInteraction | null = null;

    private hover: HoverReferenceInteraction | null = null;

    private unregisterTrigger: (() => void) | null = null;

    private readonly handleClose = safePolygon({ blockPointerEvents: true });

    private readonly unsubscribers: (() => void)[] = [];

    constructor(store: MenuStore<unknown>, parentStore: MenuStore<unknown>, options: MenuSubmenuTriggerOptions, setup: MenuItemSetup) {
        let self: MenuSubmenuTriggerMachine | null = null;
        super(store, options, setup, {
            closeOnClick: false,
            metadata: {
                type: 'submenu-trigger',
                setActive: () => {
                    if (self) {
                        parentStore.set('activeIndex', self.index.state.index);
                    }
                }
            }
        });
        self = this;
        this.parentStore = parentStore;
        this.button.setOptions({ disabled: this.disabled, focusableWhenDisabled: true, native: options.nativeButton ?? false });
        store.syncValue('closeDelay', options.closeDelay ?? 0);
        this.unsubscribers.push(
            store.subscribe(() => this.sync()),
            parentStore.subscribe(() => this.sync())
        );
        this.sync();
    }

    setOptions(options: MenuSubmenuTriggerOptions) {
        super.setOptions(options);
        this.store.syncValue('closeDelay', options.closeDelay ?? 0);
        this.sync();
    }

    get highlighted(): boolean {
        return this.parentStore?.select('isActive', this.index.state.index) ?? false;
    }

    get disabled(): boolean {
        return (this.options.disabled ?? false) || (this.store?.select('disabled') ?? false);
    }

    protected handleElement(element: HTMLElement | null) {
        this.unregisterTrigger?.();
        this.unregisterTrigger = null;
        super.handleElement(element);

        const { store } = this;
        const id = this.options.id;
        if (element) {
            store.context.triggerElements.add(id, element);
            this.unregisterTrigger = () => store.context.triggerElements.delete(id);
            if (store.select('open') && store.select('activeTriggerId') == null) {
                store.update({ activeTriggerId: id, activeTriggerElement: element, closeDelay: this.options.closeDelay ?? 0 });
            }
        }
        store.set('activeTriggerElement', element);
        this.sync();
    }

    getState(): MenuSubmenuTriggerState {
        return { disabled: this.disabled, highlighted: this.highlighted, open: this.store.select('open') };
    }

    static attrs(state: MenuSubmenuTriggerState) {
        return getStyleHookProps(state, triggerOpenStateMapping);
    }

    getSubmenuTriggerProps(elementProps: Props = {}): Props {
        const { store, parentStore } = this;
        const rootTriggerProps = { ...store.select('triggerProps', true) };
        delete rootTriggerProps.id;

        const ownProps = mergeProps(
            this.click ? mergeInteractionProps(undefined, [this.click.getProps()], 'reference') : undefined,
            this.hover?.getProps(),
            rootTriggerProps
        );

        return mergeProps(
            ownProps,
            parentStore.select('itemProps'),
            {
                tabIndex: store.select('open') || this.highlighted ? 0 : -1,
                onBlur: () => {
                    if (this.highlighted) {
                        parentStore.set('activeIndex', null);
                    }
                }
            },
            elementProps,
            this.getCommonProps(),
            {
                onMouseEnter: () => parentStore.set('activeIndex', this.index.state.index)
            },
            (props: Props) => this.button.getButtonProps(props)
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.unregisterTrigger?.();
        this.click?.destroy();
        this.hover?.destroy();
        super.destroy();
    }

    private getHoverOptions() {
        const { store, parentStore } = this;
        const { openOnHover = true, delay = 100, closeDelay = 0 } = this.options;
        return {
            enabled: store.select('hoverEnabled') && openOnHover && !this.disabled,
            handleClose: this.handleClose,
            mouseOnly: true,
            move: true,
            restMs: delay,
            delay: parentStore.select('allowMouseEnter') ? { open: delay, close: closeDelay } : 0,
            triggerElement: this.element,
            tree: store.select('floatingTreeRoot')
        };
    }

    private getClickOptions() {
        const { openOnHover = true } = this.options;
        return {
            enabled: !this.disabled,
            event: 'mousedown' as const,
            toggle: !openOnHover,
            ignoreMouse: openOnHover,
            stickIfOpen: false
        };
    }

    private sync() {
        if (!this.parentStore) {
            return;
        }
        const floatingRoot = this.store.select('floatingRootContext');
        if (floatingRoot !== this.floatingRoot) {
            this.click?.destroy();
            this.hover?.destroy();
            this.floatingRoot = floatingRoot;
            this.click = new ClickInteraction(floatingRoot, this.getClickOptions());
            this.hover = new HoverReferenceInteraction(floatingRoot, this.getHoverOptions());
        } else {
            this.click?.setOptions(this.getClickOptions());
            this.hover?.setOptions(this.getHoverOptions());
        }
    }
}

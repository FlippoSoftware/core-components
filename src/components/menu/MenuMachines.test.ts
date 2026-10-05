import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextMenuRootMachine } from '~@components/context-menu/root/ContextMenuRootMachine';
import { ContextMenuTriggerMachine } from '~@components/context-menu/trigger/ContextMenuTriggerMachine';
import { MenubarMachine } from '~@components/menubar/root/MenubarMachine';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { MenuCheckboxItemMachine } from './checkbox-item/MenuCheckboxItemMachine';
import { MenuGroupMachine } from './group/MenuGroupMachine';
import { MenuPopupMachine } from './popup/MenuPopupMachine';
import { MenuPositionerMachine } from './positioner/MenuPositionerMachine';
import { MenuRadioGroupMachine } from './radio-group/MenuRadioGroupMachine';
import { MenuRadioItemMachine } from './radio-item/MenuRadioItemMachine';
import { MenuRegularItemMachine } from './regular-item/MenuRegularItemMachine';
import { MenuRootMachine } from './root/MenuRootMachine';
import { MenuSubmenuTriggerMachine } from './submenu-trigger/MenuSubmenuTriggerMachine';
import { MenuTriggerMachine } from './trigger/MenuTriggerMachine';

function mount<T extends { setElement: (element: HTMLElement | null) => void }>(machine: T, tag = 'div', parent: Element = document.body) {
    const element = document.createElement(tag);
    parent.append(element);
    machine.setElement(element);
    return element;
}

function withTarget<E extends Event>(event: E, target: Element) {
    Object.defineProperty(event, 'currentTarget', { value: target });
    return event;
}

function createMenu(options: ConstructorParameters<typeof MenuRootMachine>[0] = {}, parent?: MenuRootMachine) {
    const root = new MenuRootMachine(options, {
        rootId: 'root',
        fallbackReferenceId: 'ref',
        nodeId: parent ? 'child-node' : 'node',
        parent: parent ? { type: 'menu', store: parent.store as never } : undefined
    });
    const positioner = new MenuPositionerMachine(root);
    const popup = new MenuPopupMachine(root, { positioner: positioner as never });
    const positionerElement = mount(positioner);
    const popupElement = mount(popup, 'div', positionerElement);
    return { root, positioner, popup, popupElement };
}

describe('Menu machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('opens from the trigger on mousedown and closes when an item is clicked', async () => {
        const onOpenChange = vi.fn();
        const { root, positioner, popup, popupElement } = createMenu({ onOpenChange });
        const trigger = new MenuTriggerMachine(root.store, { id: 'trigger' });
        const triggerElement = mount(trigger, 'button');
        triggerElement.id = 'trigger';

        const mousedown = new MouseEvent('mousedown', { button: 0, bubbles: true });
        Object.defineProperty(mousedown, 'currentTarget', { value: triggerElement });
        trigger.getTriggerProps().onMouseDown(mousedown);
        // The click interaction commits on the next frame (after focus moves).
        await new Promise((resolve) => requestAnimationFrame(resolve));

        expect(root.store.select('open')).toBe(true);
        expect(onOpenChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: REASONS.triggerPress }));
        expect(MenuTriggerMachine.attrs(trigger.getState())).toHaveProperty('data-popup-open', '');
        expect(popup.getPopupProps()['data-rootownerid']).toBe('root');
        expect(popup.getPopupProps().role).toBe('menu');

        const item = new MenuRegularItemMachine(
            root.store as never,
            { id: 'item', label: 'Item' },
            { registry: positioner.items, nodeId: positioner.nodeId }
        );
        const itemElement = mount(item, 'div', popupElement);
        expect(item.getItemProps().role).toBe('menuitem');

        item.getItemProps().onClick(withTarget(new MouseEvent('click'), itemElement));
        expect(root.store.select('open')).toBe(false);
        expect(itemElement.isConnected).toBe(true);

        item.destroy();
        trigger.destroy();
        popup.destroy();
        positioner.destroy();
        root.destroy();
    });

    it('toggles checkbox and radio items', () => {
        const { root, positioner, popupElement } = createMenu({ defaultOpen: true });
        const setup = { registry: positioner.items, nodeId: positioner.nodeId };

        const onCheckedChange = vi.fn();
        const checkbox = new MenuCheckboxItemMachine(root.store as never, { id: 'checkbox', onCheckedChange }, setup);
        const checkboxElement = mount(checkbox, 'div', popupElement);
        checkbox.getCheckboxItemProps().onClick(withTarget(new MouseEvent('click'), checkboxElement));
        expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
        expect(MenuCheckboxItemMachine.attrs(checkbox.getState())).toHaveProperty('data-checked', '');
        expect(root.store.select('open')).toBe(true);

        const group = new MenuRadioGroupMachine({ defaultValue: 'a' });
        const radioB = new MenuRadioItemMachine(root.store as never, group, { id: 'b', value: 'b' }, setup);
        const radioElement = mount(radioB, 'div', popupElement);
        expect(radioB.getState().checked).toBe(false);
        radioB.getRadioItemProps().onClick(withTarget(new MouseEvent('click'), radioElement));
        expect(group.value).toBe('b');
        expect(radioB.getRadioItemProps()['aria-checked']).toBe(true);

        const menuGroup = new MenuGroupMachine();
        const cleanup = menuGroup.registerLabel('label');
        expect(menuGroup.getGroupProps()['aria-labelledby']).toBe('label');
        cleanup();

        checkbox.destroy();
        radioB.destroy();
        positioner.destroy();
        root.destroy();
    });

    it('closes submenus when the parent closes', () => {
        const parentMenu = createMenu({ defaultOpen: true });
        const child = new MenuRootMachine(
            {},
            {
                rootId: 'root',
                fallbackReferenceId: 'child-ref',
                nodeId: 'child-node',
                parent: { type: 'menu', store: parentMenu.root.store as never }
            }
        );
        const childPositioner = new MenuPositionerMachine(child);
        const submenuTrigger = new MenuSubmenuTriggerMachine(
            child.store as never,
            parentMenu.root.store as never,
            { id: 'sub' },
            {
                registry: parentMenu.positioner.items,
                nodeId: parentMenu.positioner.nodeId
            }
        );
        mount(submenuTrigger, 'div', parentMenu.popupElement);

        child.store.setOpen(true, createChangeEventDetails(REASONS.triggerPress));
        expect(child.store.select('open')).toBe(true);
        expect(child.store.select('floatingParentNodeId')).toBe('node');
        expect(MenuSubmenuTriggerMachine.attrs(submenuTrigger.getState())).toHaveProperty('data-popup-open', '');

        parentMenu.root.actions.close();
        expect(child.store.select('open')).toBe(false);

        submenuTrigger.destroy();
        childPositioner.destroy();
        child.destroy();
        parentMenu.positioner.destroy();
        parentMenu.root.destroy();
    });

    it('opens a context menu at the cursor', () => {
        const contextMenu = new ContextMenuRootMachine({}, { rootId: 'ctx', fallbackReferenceId: 'ref', nodeId: 'ctx-node' });
        const positioner = new MenuPositionerMachine(contextMenu.menu);
        mount(positioner);
        const trigger = new ContextMenuTriggerMachine(contextMenu as never);
        mount(trigger);

        const event = new MouseEvent('contextmenu', { clientX: 40, clientY: 50, bubbles: true, cancelable: true });
        trigger.getTriggerProps().onContextMenu(event);

        expect(contextMenu.store.select('open')).toBe(true);
        expect(contextMenu.context.anchor.getBoundingClientRect().x).toBe(40);
        expect(positioner.getPositionerProps().hidden).toBe(false);

        trigger.destroy();
        positioner.destroy();
        contextMenu.destroy();
    });

    it('tracks open submenus in a menubar', () => {
        const menubar = new MenubarMachine({}, { id: 'menubar', nodeId: 'menubar-node' });
        mount(menubar);
        const root = new MenuRootMachine(
            {},
            {
                rootId: 'root',
                fallbackReferenceId: 'ref',
                nodeId: 'menu-node',
                parent: { type: 'menubar', context: menubar.context }
            }
        );
        const positioner = new MenuPositionerMachine(root);
        mount(positioner);

        root.store.setOpen(true, createChangeEventDetails(REASONS.triggerPress));
        expect(menubar.getState().hasSubmenuOpen).toBe(true);
        expect(MenubarMachine.attrs(menubar.getState())).toHaveProperty('data-has-submenu-open', 'true');
        expect(menubar.getMenubarProps().role).toBe('menubar');

        root.actions.close();
        expect(menubar.getState().hasSubmenuOpen).toBe(false);

        positioner.destroy();
        root.destroy();
        menubar.destroy();
    });
});

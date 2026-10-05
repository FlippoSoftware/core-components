import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { NavigationMenuContentMachine } from './content/NavigationMenuContentMachine';
import { getNavigationMenuLinkProps } from './link/getNavigationMenuLinkProps';
import { NavigationMenuListMachine } from './list/NavigationMenuListMachine';
import { NavigationMenuPopup } from './popup/NavigationMenuPopup';
import { NavigationMenuPositionerMachine } from './positioner/NavigationMenuPositionerMachine';
import { NavigationMenuRootMachine } from './root/NavigationMenuRootMachine';
import { NavigationMenuTriggerMachine } from './trigger/NavigationMenuTriggerMachine';
import { isOutsideMenuEvent } from './utils/isOutsideMenuEvent';
import { NavigationMenuViewportMachine } from './viewport/NavigationMenuViewportMachine';

describe('NavigationMenu machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('opens the item of the clicked trigger and closes from a link', async () => {
        const onValueChange = vi.fn();
        const root = new NavigationMenuRootMachine({ onValueChange }, { nodeId: 'nav' });
        const rootElement = document.createElement('nav');
        document.body.append(rootElement);
        root.setRootElement(rootElement);

        const list = new NavigationMenuListMachine(root);
        const trigger = new NavigationMenuTriggerMachine(root, 'products');
        const triggerElement = document.createElement('button');
        rootElement.append(triggerElement);
        trigger.setElement(triggerElement);

        const positioner = new NavigationMenuPositionerMachine(root);
        const viewport = new NavigationMenuViewportMachine(root, true);
        const content = new NavigationMenuContentMachine(root, 'products');
        const positionerElement = document.createElement('div');
        const viewportElement = document.createElement('div');
        positionerElement.append(viewportElement);
        document.body.append(positionerElement);
        positioner.setElement(positionerElement);
        viewport.setElement(viewportElement);
        const popupElement = document.createElement('nav');
        positionerElement.append(popupElement);
        NavigationMenuPopup.setElement(root, popupElement);

        expect(list.getDismissProps()).toBeUndefined();

        root.setValue('products', createChangeEventDetails(REASONS.triggerPress));
        expect(onValueChange).toHaveBeenCalledWith('products', expect.anything());
        expect(root.open).toBe(true);
        expect(trigger.getState().open).toBe(true);
        expect(NavigationMenuTriggerMachine.attrs(trigger.getState())).toHaveProperty('data-popup-open', '');
        expect(trigger.getTriggerProps()['aria-expanded']).toBe(true);
        expect(root.store.state.floatingRootContext).toBe(trigger.floatingRoot);
        expect(list.getDismissProps()).toBeDefined();
        expect(content.open).toBe(true);
        expect(content.getPortalContainer()).toBe(viewportElement);
        expect(positioner.getPositionerProps().hidden).toBe(false);

        const link = getNavigationMenuLinkProps(root, { closeOnClick: true, active: true });
        expect(link['aria-current']).toBe('page');
        link.onClick(new MouseEvent('click'));
        expect(root.open).toBe(false);
        expect(root.transitions.state.mounted).toBe(false);

        content.destroy();
        viewport.destroy();
        positioner.destroy();
        trigger.destroy();
        list.destroy();
        root.destroy();
    });

    it('detects focus leaving the menu', () => {
        const rootElement = document.createElement('nav');
        const popup = document.createElement('div');
        const inside = document.createElement('a');
        const outside = document.createElement('a');
        popup.append(inside);
        document.body.append(rootElement, popup, outside);

        const params = { popupElement: popup, rootRef: { current: rootElement }, tree: null, nodeId: undefined };
        expect(isOutsideMenuEvent({ currentTarget: rootElement, relatedTarget: inside }, params)).toBe(false);
        expect(isOutsideMenuEvent({ currentTarget: rootElement, relatedTarget: outside }, params)).toBe(true);
    });
});

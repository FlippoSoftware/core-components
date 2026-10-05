import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PopoverBackdrop } from './backdrop/PopoverBackdrop';
import { PopoverCloseMachine } from './close/PopoverCloseMachine';
import { PopoverPopupMachine } from './popup/PopoverPopupMachine';
import { PopoverPositionerMachine } from './positioner/PopoverPositionerMachine';
import { PopoverRootMachine } from './root/PopoverRootMachine';
import { registerPopoverTitle } from './title/registerPopoverTitle';
import { PopoverTriggerMachine } from './trigger/PopoverTriggerMachine';

function setup(options: ConstructorParameters<typeof PopoverRootMachine>[0] = {}) {
    const root = new PopoverRootMachine(options, { fallbackReferenceId: 'ref' });
    const trigger = new PopoverTriggerMachine(root.store, { id: 'trigger' });
    const triggerElement = document.createElement('button');
    triggerElement.id = 'trigger';
    document.body.append(triggerElement);
    trigger.setElement(triggerElement);

    const positioner = new PopoverPositionerMachine(root.store, { nodeId: 'node', tree: root.tree });
    const popup = new PopoverPopupMachine(root.store, { positioner });
    const positionerElement = document.createElement('div');
    const popupElement = document.createElement('div');
    positionerElement.append(popupElement);
    document.body.append(positionerElement);
    positioner.setElement(positionerElement);
    popup.setElement(popupElement);

    const destroy = () => {
        popup.destroy();
        positioner.destroy();
        trigger.destroy();
        root.destroy();
        triggerElement.remove();
        positionerElement.remove();
    };

    return { root, trigger, positioner, popup, triggerElement, destroy };
}

describe('Popover machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('opens on trigger click and closes on a second click', () => {
        const onOpenChange = vi.fn();
        const { root, trigger, triggerElement, destroy } = setup({ onOpenChange });

        const click = () => {
            const event = new MouseEvent('click', { detail: 1, bubbles: true });
            Object.defineProperty(event, 'currentTarget', { value: triggerElement });
            trigger.getTriggerProps().onClick(event);
        };
        click();

        expect(onOpenChange).toHaveBeenCalled();
        expect(root.store.select('open')).toBe(true);
        expect(root.store.select('mounted')).toBe(true);
        expect(root.store.select('activeTriggerId')).toBe('trigger');
        expect(trigger.getState().open).toBe(true);
        expect(trigger.getStateAttributes()).toHaveProperty('data-popup-open', '');
        expect(trigger.getTriggerProps()['aria-expanded']).toBe('true');

        click();
        expect(root.store.select('open')).toBe(false);

        destroy();
    });

    it('closes imperatively and unmounts', () => {
        const onOpenChangeComplete = vi.fn();
        const { root, destroy } = setup({ defaultOpen: true, onOpenChangeComplete });
        expect(root.store.select('mounted')).toBe(true);

        root.actions.close();
        expect(root.store.select('open')).toBe(false);
        expect(root.store.select('mounted')).toBe(false);
        expect(onOpenChangeComplete).toHaveBeenCalledWith(false);

        destroy();
    });

    it('follows the controlled open prop', () => {
        const { root, destroy } = setup({ open: false });
        root.setOptions({ open: true });
        expect(root.store.select('open')).toBe(true);
        expect(root.store.select('activeTriggerId')).toBe('trigger');
        destroy();
    });

    it('provides popup, positioner, backdrop, title and close props', () => {
        const { root, popup, positioner, destroy } = setup({ defaultOpen: true, modal: true });
        const cleanupTitle = registerPopoverTitle(root.store, 'title');

        expect(popup.getPopupProps()['aria-labelledby']).toBe('title');
        expect(PopoverPopupMachine.attrs(popup.getState())).toHaveProperty('data-open', '');
        expect(positioner.getPositionerProps()).toMatchObject({ role: 'presentation', hidden: false });
        expect(positioner.shouldRenderInternalBackdrop()).toBe(true);
        expect(positioner.getInternalBackdropProps().style.position).toBe('fixed');
        expect(PopoverBackdrop.getProps(root.store).hidden).toBe(false);

        const close = new PopoverCloseMachine(root.store);
        close.getCloseProps().onClick(new MouseEvent('click'));
        expect(root.store.select('open')).toBe(false);

        cleanupTitle();
        expect(root.store.select('titleElementId')).toBeUndefined();
        destroy();
    });
});

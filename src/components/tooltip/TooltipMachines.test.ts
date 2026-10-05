import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';

import { convexHull, isPointInPolygon, multipleSafePolygon } from './multiple/multipleSafePolygon';
import { TooltipMultipleMachine } from './multiple/TooltipMultipleMachine';
import { TooltipPopupMachine } from './popup/TooltipPopupMachine';
import { TooltipPositionerMachine } from './positioner/TooltipPositionerMachine';
import { TooltipProviderMachine } from './provider/TooltipProviderMachine';
import { TooltipRootMachine } from './root/TooltipRootMachine';
import { TooltipTriggerMachine } from './trigger/TooltipTriggerMachine';

describe('Tooltip machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('opens on focus of the trigger and exposes popup and positioner state', () => {
        const provider = new TooltipProviderMachine({ delay: 100 });
        const root = new TooltipRootMachine({});
        const trigger = new TooltipTriggerMachine(root.store, { id: 'trigger' }, { delayGroup: provider.delayGroup });
        const triggerElement = document.createElement('button');
        triggerElement.id = 'trigger';
        document.body.append(triggerElement);
        trigger.setElement(triggerElement);

        const positioner = new TooltipPositionerMachine(root);
        const popup = new TooltipPopupMachine(root, { positioner: positioner as never });

        root.store.setOpen(true, createChangeEventDetails(REASONS.triggerFocus, undefined, triggerElement));
        expect(root.getOpenState()).toBe(true);
        expect(root.store.select('mounted')).toBe(true);
        expect(trigger.getState().open).toBe(true);
        expect(TooltipTriggerMachine.attrs(trigger.getState())).toHaveProperty('data-popup-open', '');
        expect(trigger.getTriggerProps().id).toBe('trigger');
        expect(popup.getState()).toMatchObject({ open: true, side: 'top', instant: 'focus' });
        expect(positioner.getState().instant).toBe('focus');

        root.setOptions({ disabled: true });
        expect(root.store.select('open')).toBe(false);

        popup.destroy();
        positioner.destroy();
        trigger.destroy();
        root.destroy();
        provider.destroy();
    });

    it('keeps the multiple tooltip open inside the group safe area', () => {
        const multiple = new TooltipMultipleMachine();
        const root = new TooltipRootMachine({}, { multiple });
        const trigger = document.createElement('button');
        trigger.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 20, height: 20 });
        root.store.context.triggerElements.add('t', trigger);
        const onClose = vi.fn();
        const handler = multipleSafePolygon(multiple.store)({ onClose } as never);
        handler(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
        vi.advanceTimersByTime(100);
        expect(onClose).not.toHaveBeenCalled();
        handler(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }));
        vi.advanceTimersByTime(100);
        expect(onClose).toHaveBeenCalled();
        expect(
            isPointInPolygon(
                [1, 1],
                convexHull([
                    [0, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2]
                ])
            )
        ).toBe(true);
        root.destroy();
        multiple.destroy();
    });

    it('shares the open state inside Tooltip.Multiple', () => {
        const multiple = new TooltipMultipleMachine({ defaultOpen: false });
        const first = new TooltipRootMachine({}, { multiple });
        const second = new TooltipRootMachine({}, { multiple });

        first.store.setOpen(true, createChangeEventDetails(REASONS.triggerHover));
        expect(multiple.store.select('open')).toBe(true);
        expect(first.getOpenState()).toBe(true);
        expect(second.getOpenState()).toBe(true);

        second.destroy();
        first.destroy();
        multiple.destroy();
    });
});

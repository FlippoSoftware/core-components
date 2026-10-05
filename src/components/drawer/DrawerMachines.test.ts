import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DrawerDragMachine } from './drag/DrawerDragMachine';
import { DrawerGesture } from './drag/DrawerGesture';
import { getDrawerPopupProps } from './popup/getDrawerPopupProps';
import { DrawerRootMachine } from './root/DrawerRootMachine';
import { parseSnapPoint } from './utils/parseSnapPoint';

function pointer(type: string, init: Partial<PointerEvent> = {}) {
    return {
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 0,
        clientY: 0,
        movementX: 0,
        movementY: 0,
        preventDefault: () => {},
        target: null,
        type,
        ...init
    } as PointerEvent;
}

describe('Drawer machines', () => {
    beforeEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = true;
    });

    afterEach(() => {
        globalThis.FLIPPO_UI_ANIMATIONS_DISABLED = false;
        document.body.innerHTML = '';
    });

    it('parses snap points', () => {
        expect(parseSnapPoint('50%', 800)).toBe(400);
        expect(parseSnapPoint(120, 800)).toBe(120);
        expect(parseSnapPoint('abc', 800)).toBe(0);
        expect(parseSnapPoint(null, 800)).toBe(0);
    });

    it('closes the dialog when swiped down past the threshold', () => {
        const onDragEnd = vi.fn();
        const root = new DrawerRootMachine({ defaultOpen: true, onDragEnd }, { fallbackReferenceId: 'ref' });
        const popup = document.createElement('div');
        popup.setAttribute('role', 'dialog');
        document.body.append(popup);
        root.store.set('popupElement', popup);

        const drag = new DrawerDragMachine(root.drawerStore, root.store as never, { closeThreshold: 50 });
        const handle = document.createElement('div');
        popup.append(handle);
        drag.setElement(handle);

        const props = drag.getDragProps();
        props.onPointerDown(pointer('pointerdown', { clientY: 0, target: handle }));
        props.onPointerMove(pointer('pointermove', { clientY: 0 }));
        props.onPointerMove(pointer('pointermove', { clientY: 200, movementY: 200 }));

        expect(root.drawerStore.select('isDragging')).toBe(true);
        expect(DrawerDragMachine.attrs(drag.getState())).toHaveProperty('data-dragging', '');
        expect(getDrawerPopupProps(root.drawerStore).style['--drag-offset']).not.toBe('0px');

        props.onPointerUp(pointer('pointerup', { clientY: 200 }));
        expect(root.store.select('open')).toBe(false);
        expect(onDragEnd).toHaveBeenCalledWith({ open: false });

        drag.destroy();
        root.destroy();
    });

    it('resets the snap point when closed', () => {
        const root = new DrawerRootMachine({ defaultOpen: true, snapPoints: ['50%', '100%'] }, { fallbackReferenceId: 'ref' });
        root.drawerStore.setActiveSnapPoint(1);
        root.dialog.actions.close();
        expect(root.drawerStore.select('activeSnapPointIndex')).toBe(0);
        expect(getDrawerPopupProps(root.drawerStore)['data-snap-points']).toBe('');
        root.destroy();
    });

    it('closes an up drawer past the distance threshold and ignores swipes the other way', () => {
        const draggableRef = { current: document.createElement('div') };
        const onDragEnd = vi.fn();
        const gesture = new DrawerGesture({
            swipeDirection: 'up',
            draggableRef,
            panel: null,
            closeThreshold: 50,
            velocityThreshold: 1000,
            onDragEnd
        });
        const drag = (deltaY: number) => {
            gesture.onPointerDown(pointer('pointerdown', { clientY: 300 }));
            gesture.onPointerMove(pointer('pointermove', { clientY: 300 }));
            gesture.onPointerMove(pointer('pointermove', { clientY: 300 + deltaY, movementY: deltaY }));
            gesture.onPointerUp(pointer('pointerup', { clientY: 300 + deltaY }));
        };
        drag(-120);
        expect(onDragEnd).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ shouldClose: true, dismissDirection: 'up' })
        );
        drag(120);
        expect(onDragEnd).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ shouldClose: false }));
        gesture.destroy();
    });

    it('ignores presses on interactive elements', () => {
        const draggableRef = { current: document.createElement('div') };
        const gesture = new DrawerGesture({ swipeDirection: 'down', draggableRef, panel: null });
        const button = document.createElement('button');
        gesture.onPointerDown(pointer('pointerdown', { target: button }));
        expect(gesture.isGesturing).toBe(false);
        gesture.destroy();
    });
});

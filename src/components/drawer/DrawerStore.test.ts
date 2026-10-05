import { describe, expect, it, vi } from 'vitest';

import { DrawerGestureDataAttributes } from './drag/DrawerGestureDataAttributes';
import { DrawerStore } from './store/DrawerStore';

import type { DrawerState } from './store/DrawerStore';

const initialState = (): DrawerState => ({
    direction: 'down',
    shouldDrag: true,
    isDragging: false,
    dragOffset: 0,
    snapPoints: [0.5, 1],
    activeSnapPointIndex: 0,
    shouldScaleBackground: false,
    backgroundScale: 1,
    popupStyle: {},
    popupDataAttributes: {
        [DrawerGestureDataAttributes.snapPoints]: null,
        [DrawerGestureDataAttributes.swipeDirectionRight]: null,
        [DrawerGestureDataAttributes.swipeDirectionLeft]: null,
        [DrawerGestureDataAttributes.swipeDirectionUp]: null,
        [DrawerGestureDataAttributes.swipeDirectionDown]: ''
    }
});

describe('DrawerStore', () => {
    it('tracks dragging and reports it through the context', () => {
        const store = DrawerStore.create(initialState());
        const dragStart = vi.fn();
        const dragMove = vi.fn();
        const snapPointChange = vi.fn();
        store.setContextValue('dragStart', dragStart);
        store.setContextValue('dragMove', dragMove);
        store.setContextValue('snapPointChange', snapPointChange);

        store.setIsDragging(true);
        store.setDragOffset(24);
        store.setIsDragging(false);
        store.setActiveSnapPoint(1);

        expect(dragStart).toHaveBeenCalledTimes(1);
        expect(dragMove).toHaveBeenCalledWith(24);
        expect(snapPointChange).toHaveBeenCalledWith(1);
        expect(store.state).toMatchObject({ isDragging: false, dragOffset: 24, activeSnapPointIndex: 1 });
        expect(store.context.dragRef.current).toBeNull();
    });

    it('exposes drawer selectors', () => {
        const onPointerDown = vi.fn();
        const store = DrawerStore.create({ ...initialState(), onPointerDown, containerRef: { current: null } });
        expect(store.select('direction')).toBe('down');
        expect(store.select('shouldDrag')).toBe(true);
        expect(store.select('isDragging')).toBe(false);
        expect(store.select('dragOffset')).toBe(0);
        expect(store.select('snapPoints')).toEqual([0.5, 1]);
        expect(store.select('activeSnapPointIndex')).toBe(0);
        expect(store.select('shouldScaleBackground')).toBe(false);
        expect(store.select('backgroundScale')).toBe(1);
        expect(store.select('popupStyle')).toEqual({});
        expect(store.select('popupDataAttributes')['data-swipe-direction-down']).toBe('');
        expect(store.select('onPointerDown')).toBe(onPointerDown);
        expect(store.select('onPointerMove')).toBeUndefined();
        expect(store.select('onPointerUp')).toBeUndefined();
        expect(store.select('containerRef')).toEqual({ current: null });
    });
});

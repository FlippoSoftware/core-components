import { createRef } from '~@lib/ref';
import { ComponentStore } from '~@store/ComponentStore';
import { createSelector } from '~@store/createSelector';

import type { BivariantEventHandler, MutableRef, PointerEventLike, Style } from '~@lib/types';

import { DrawerGestureDataAttributes } from '../drag/DrawerGestureDataAttributes';

export type DrawerDirection = 'up' | 'down' | 'left' | 'right';

export type SnapPoint = number | string;

export type DrawerPopupDataAttributes = {
    [DrawerGestureDataAttributes.snapPoints]: string | null;
    [DrawerGestureDataAttributes.swipeDirectionRight]: string | null;
    [DrawerGestureDataAttributes.swipeDirectionLeft]: string | null;
    [DrawerGestureDataAttributes.swipeDirectionUp]: string | null;
    [DrawerGestureDataAttributes.swipeDirectionDown]: string | null;
};

/**
 * @template PointerEventType Pointer event type of the adapter (native `PointerEvent`, `React.PointerEvent`, …).
 */
export type DrawerState<PointerEventType = PointerEventLike> = {
    /**
     * Direction from which the drawer opens.
     */
    direction: DrawerDirection;
    /**
     * Should drag be enabled.
     */
    shouldDrag: boolean;
    /**
     * Is currently being dragged.
     */
    isDragging: boolean;
    /**
     * Current drag offset.
     */
    dragOffset: number;
    /**
     * Snap points for the drawer position.
     */
    snapPoints: SnapPoint[];
    /**
     * Current active snap point index.
     */
    activeSnapPointIndex: number;
    /**
     * Whether to scale the background when drawer is open.
     */
    shouldScaleBackground: boolean;
    /**
     * Background scale amount.
     */
    backgroundScale: number;
    /**
     * Style for the drawer popup.
     */
    popupStyle: Style;
    /**
     * Data attributes for the drawer popup.
     */
    popupDataAttributes: DrawerPopupDataAttributes;

    onPointerDown?: BivariantEventHandler<PointerEventType> | undefined;
    onPointerMove?: BivariantEventHandler<PointerEventType> | undefined;
    onPointerUp?: BivariantEventHandler<PointerEventType> | undefined;

    containerRef?: MutableRef<HTMLElement | null> | undefined;
};

export type DrawerContext = {
    dragRef: MutableRef<HTMLElement | null>;

    dragStart?: (() => void) | undefined;
    dragMove?: ((offset: number) => void) | undefined;
    dragEnd?: ((open: boolean) => void) | undefined;
    snapPointChange?: ((index: number) => void) | undefined;
};

type S = DrawerState<never>;

export const drawerSelectors = {
    direction: createSelector((state: S) => state.direction),
    shouldDrag: createSelector((state: S) => state.shouldDrag),
    isDragging: createSelector((state: S) => state.isDragging),
    dragOffset: createSelector((state: S) => state.dragOffset),
    snapPoints: createSelector((state: S) => state.snapPoints),
    activeSnapPointIndex: createSelector((state: S) => state.activeSnapPointIndex),
    shouldScaleBackground: createSelector((state: S) => state.shouldScaleBackground),
    backgroundScale: createSelector((state: S) => state.backgroundScale),
    popupStyle: createSelector((state: S) => state.popupStyle),
    popupDataAttributes: createSelector((state: S) => state.popupDataAttributes),
    onPointerDown: createSelector((state: S) => state.onPointerDown),
    onPointerMove: createSelector((state: S) => state.onPointerMove),
    onPointerUp: createSelector((state: S) => state.onPointerUp),
    containerRef: createSelector((state: S) => state.containerRef)
};

export type DrawerSelectors = typeof drawerSelectors;

/**
 * Drag/snap state of a drawer. The open state itself lives in the {@link DialogStore}.
 */
export class DrawerStore<PointerEventType = PointerEventLike> extends ComponentStore<
    DrawerState<PointerEventType>,
    DrawerContext,
    DrawerSelectors
> {
    static create<PointerEventType = PointerEventLike>(initialState: DrawerState<PointerEventType>) {
        return new DrawerStore<PointerEventType>(initialState, { dragRef: createRef<HTMLElement>() }, drawerSelectors);
    }

    public setDragOffset = (offset: number) => {
        this.set('dragOffset', offset);
        this.context.dragMove?.(offset);
    };

    public setIsDragging = (isDragging: boolean) => {
        this.set('isDragging', isDragging);
        if (isDragging) {
            this.context.dragStart?.();
        }
    };

    public setActiveSnapPoint = (index: number) => {
        this.set('activeSnapPointIndex', index);
        this.context.snapPointChange?.(index);
    };
}

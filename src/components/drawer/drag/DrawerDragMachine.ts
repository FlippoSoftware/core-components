import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { popupStateMapping } from '~@attributes/popupStateMapping';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { mergeProps } from '~@props/mergeProps';

import type { DialogStore } from '~@components/dialog/store/DialogStore';
import type { Props } from '~@props/mergeProps';

import { DrawerPopupStateAttributes } from '../popup/DrawerPopupStateAttributes';

import type { DrawerStore } from '../store/DrawerStore';

import { DrawerGesture } from './DrawerGesture';

import type { DrawerDragEndDetails, DrawerGestureOptions } from './DrawerGesture';

export type DrawerDragOptions = Pick<DrawerGestureOptions, 'closeThreshold' | 'velocityThreshold' | 'scrollLockTimeout'> & {
    onDragEnd?: DrawerGestureOptions['onDragEnd'];
    onDragMove?: DrawerGestureOptions['onDragMove'];
    onDragStart?: DrawerGestureOptions['onDragStart'];
    onActiveSnapPointIndexChange?: ((index: number) => void) | undefined;
};

export type DrawerDragState = {
    dragging: boolean;
    open: boolean;
};

const drawerDragStateAttributesMapping = {
    ...popupStateMapping,
    dragging(value: boolean) {
        return value ? { [DrawerPopupStateAttributes.dragging]: '' } : null;
    }
};

/**
 * State machine of `Drawer.Drag`: the drag handle running the {@link DrawerGesture}.
 */
export class DrawerDragMachine {
    readonly gesture: DrawerGesture;

    private options: DrawerDragOptions;

    private readonly drawerStore: DrawerStore;

    private readonly dialogStore: DialogStore<unknown>;

    private readonly unsubscribers: (() => void)[];

    constructor(drawerStore: DrawerStore, dialogStore: DialogStore<unknown>, options: DrawerDragOptions = {}) {
        this.drawerStore = drawerStore;
        this.dialogStore = dialogStore;
        this.options = options;
        this.gesture = new DrawerGesture(this.getGestureOptions());
        this.unsubscribers = [
            this.gesture.store.subscribe(() => this.syncDrawerStore()),
            drawerStore.subscribe(() => this.gesture.setOptions(this.getGestureOptions())),
            dialogStore.subscribe(() => this.gesture.setOptions(this.getGestureOptions()))
        ];
        this.syncDrawerStore();
    }

    setOptions(options: DrawerDragOptions) {
        this.options = options;
        this.gesture.setOptions(this.getGestureOptions());
    }

    /**
     * Ref callback for the drag handle.
     */
    setElement = (element: HTMLElement | null) => {
        this.drawerStore.context.dragRef.current = element;
        this.gesture.setOptions(this.getGestureOptions());
    };

    getState(): DrawerDragState {
        return { dragging: this.drawerStore.select('isDragging'), open: this.dialogStore.select('open') };
    }

    static attrs(state: DrawerDragState) {
        return getStyleHookProps(state, drawerDragStateAttributesMapping);
    }

    getDragProps(elementProps: Props = {}): Props {
        return mergeProps(
            {
                onPointerDown: this.gesture.onPointerDown,
                onPointerMove: this.gesture.onPointerMove,
                onPointerUp: this.gesture.onPointerUp
            },
            elementProps,
            { 'aria-hidden': true }
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.gesture.destroy();
    }

    private getGestureOptions(): DrawerGestureOptions {
        const { drawerStore, dialogStore, options } = this;
        return {
            swipeDirection: drawerStore.select('direction'),
            containerRef: drawerStore.select('containerRef'),
            draggableRef: drawerStore.context.dragRef,
            closeThreshold: options.closeThreshold,
            velocityThreshold: options.velocityThreshold,
            scrollLockTimeout: options.scrollLockTimeout,
            enabled: drawerStore.select('shouldDrag') && dialogStore.select('open'),
            snapPoints: drawerStore.select('snapPoints'),
            activeSnapPointIndex: drawerStore.select('activeSnapPointIndex'),
            panel: dialogStore.select('popupElement'),
            onDragEnd: (event, details: DrawerDragEndDetails) => {
                if (details.shouldClose) {
                    dialogStore.setOpen(false, createChangeEventDetails('drag') as never);
                }
                drawerStore.context.dragEnd?.(!details.shouldClose);
                options.onDragEnd?.(event, details);
            },
            onDragMove: options.onDragMove,
            onDragStart: options.onDragStart,
            onActiveSnapPointIndexChange: (index) => {
                drawerStore.setActiveSnapPoint(index);
                options.onActiveSnapPointIndexChange?.(index);
            }
        };
    }

    private syncDrawerStore() {
        const { gesture, drawerStore } = this;
        const wasDragging = drawerStore.select('isDragging');
        drawerStore.update({
            popupStyle: gesture.getStyle(),
            popupDataAttributes: gesture.getDataAttributes()
        });
        if (wasDragging !== gesture.isGesturing) {
            drawerStore.setIsDragging(gesture.isGesturing);
        }
        if (drawerStore.select('dragOffset') !== gesture.offset) {
            drawerStore.setDragOffset(gesture.offset);
        }
    }
}

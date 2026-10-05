import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { pressableTriggerOpenStateMapping } from '~@attributes/popupStateMapping';
import { findRootOwnerId } from '~@components/menu/utils/findRootOwnerId';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { ownerDocument } from '~@lib/owner';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { stopEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Timeout } from '~@timers/Timeout';

import type { MenuChangeEventDetails } from '~@components/menu/store/MenuStore';
import type { Props } from '~@props/mergeProps';

import { createAnchor } from '../utils/createAnchor';

import type { ContextMenuRootMachine } from '../root/ContextMenuRootMachine';

const LONG_PRESS_DELAY = 500;

const TOUCH_MOVE_THRESHOLD = 10;

type TouchLikeEvent = { touches: ArrayLike<{ clientX: number; clientY: number }>; stopPropagation: () => void; nativeEvent?: TouchEvent };

/**
 * State machine of `ContextMenu.Trigger`: opens on right click or long press at the pointer.
 */
export class ContextMenuTriggerMachine {
    private readonly root: ContextMenuRootMachine;

    private element: HTMLElement | null = null;

    private touchPosition: { x: number; y: number } | null = null;

    private allowMouseUp = false;

    private readonly longPressTimeout = new Timeout();

    private readonly allowMouseUpTimeout = new Timeout();

    private readonly documentContextMenuEffect = new Effect(() => this.attachDocumentContextMenu());

    constructor(root: ContextMenuRootMachine) {
        this.root = root;
    }

    setElement = (element: HTMLElement | null) => {
        this.element = element;
        this.documentContextMenuEffect.sync([element]);
    };

    getState(): { open: boolean } {
        return { open: this.root.store.select('open') };
    }

    static attrs(state: { open: boolean }) {
        return getStyleHookProps(state, pressableTriggerOpenStateMapping);
    }

    getTriggerProps(elementProps: Props = {}): Props {
        return mergeProps(
            {
                onContextMenu: this.handleContextMenu,
                onTouchStart: this.handleTouchStart,
                onTouchMove: this.handleTouchMove,
                onTouchEnd: this.handleTouchEnd,
                onTouchCancel: this.handleTouchEnd,
                style: { WebkitTouchCallout: 'none' }
            },
            elementProps
        );
    }

    destroy() {
        this.longPressTimeout.clear();
        this.allowMouseUpTimeout.clear();
        this.documentContextMenuEffect.destroy();
    }

    private setOpen(open: boolean, details: Omit<MenuChangeEventDetails, 'preventUnmountOnClose'>) {
        this.root.context.actionsRef.current?.setOpen(open, details as never);
    }

    private handleLongPress(x: number, y: number, event: MouseEvent | TouchEvent) {
        const isTouchEvent = event.type.startsWith('touch');
        const { context } = this.root;
        context.initialCursorPointRef.current = { x, y };
        this.root.setAnchor(createAnchor(x, y, isTouchEvent ? 10 : 0));
        this.allowMouseUp = false;
        this.setOpen(true, createChangeEventDetails(REASONS.triggerPress, event));
        this.allowMouseUpTimeout.start(LONG_PRESS_DELAY, () => {
            this.allowMouseUp = true;
        });
    }

    private readonly handleContextMenu = (event: MouseEvent | { nativeEvent: MouseEvent; clientX: number; clientY: number }) => {
        const { context } = this.root;
        const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
        context.allowMouseUpTriggerRef.current = true;
        stopEvent(event as MouseEvent);
        this.handleLongPress(event.clientX, event.clientY, nativeEvent);

        ownerDocument(this.element).addEventListener(
            'mouseup',
            (mouseEvent: MouseEvent) => {
                context.allowMouseUpTriggerRef.current = false;
                if (!this.allowMouseUp) {
                    return;
                }
                this.allowMouseUpTimeout.clear();
                this.allowMouseUp = false;

                const mouseUpTarget = getTarget(mouseEvent) as Element | null;
                if (contains(context.positionerRef.current, mouseUpTarget)) {
                    return;
                }
                if (context.rootId && mouseUpTarget && findRootOwnerId(mouseUpTarget) === context.rootId) {
                    return;
                }
                this.setOpen(false, createChangeEventDetails(REASONS.cancelOpen, mouseEvent));
            },
            { once: true }
        );
    };

    private readonly handleTouchStart = (event: TouchLikeEvent) => {
        this.root.context.allowMouseUpTriggerRef.current = false;
        if (event.touches.length !== 1) {
            return;
        }
        event.stopPropagation();
        const touch = event.touches[0];
        this.touchPosition = { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
        const nativeEvent = (event.nativeEvent ?? event) as TouchEvent;
        this.longPressTimeout.start(LONG_PRESS_DELAY, () => {
            if (this.touchPosition) {
                this.handleLongPress(this.touchPosition.x, this.touchPosition.y, nativeEvent);
            }
        });
    };

    private readonly handleTouchMove = (event: TouchLikeEvent) => {
        if (!this.longPressTimeout.isStarted() || !this.touchPosition || event.touches.length !== 1) {
            return;
        }
        const touch = event.touches[0];
        const deltaX = Math.abs((touch?.clientX ?? 0) - this.touchPosition.x);
        const deltaY = Math.abs((touch?.clientY ?? 0) - this.touchPosition.y);
        if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
            this.longPressTimeout.clear();
        }
    };

    private readonly handleTouchEnd = () => {
        this.longPressTimeout.clear();
        this.touchPosition = null;
    };

    private attachDocumentContextMenu() {
        const element = this.element;
        if (!element) {
            return;
        }
        const { context } = this.root;
        const handleDocumentContextMenu = (event: MouseEvent) => {
            const target = getTarget(event) as Element | null;
            if (
                contains(element, target) ||
                contains(context.internalBackdropRef.current, target) ||
                contains(context.backdropRef.current, target)
            ) {
                event.preventDefault();
            }
        };
        const doc = ownerDocument(element);
        doc.addEventListener('contextmenu', handleDocumentContextMenu);
        return () => doc.removeEventListener('contextmenu', handleDocumentContextMenu);
    }
}

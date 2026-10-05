import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { ownerDocument } from '~@lib/owner';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { activeElement, contains, getTarget } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { MutableRef, Style, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { ToastObject } from '../manager/ToastManager';
import type { ToastProviderMachine } from '../provider/ToastProviderMachine';

import { ToastRootCssVars } from './ToastRootCssVars';
import { toastRootStateAttributesMapping } from './toastRootStateAttributesMapping';

export type ToastSwipeDirection = 'up' | 'down' | 'left' | 'right';

export type ToastRootState = {
    transitionStatus: TransitionStatus;
    expanded: boolean;
    limited: boolean;
    type: string | undefined;
    swiping: boolean;
    swipeDirection: ToastSwipeDirection | undefined;
};

export type ToastRootOptions = {
    toast: ToastObject;
    /**
     * @default ['down', 'right']
     */
    swipeDirection?: ToastSwipeDirection | ToastSwipeDirection[] | undefined;
};

const SWIPE_THRESHOLD = 40;

const REVERSE_CANCEL_THRESHOLD = 10;

const OPPOSITE_DIRECTION_DAMPING_FACTOR = 0.5;

const MIN_DRAG_THRESHOLD = 1;

const DEFAULT_SWIPE_DIRECTIONS: ToastSwipeDirection[] = ['down', 'right'];

type Transform = { x: number; y: number; scale: number };

type SwipeState = {
    currentSwipeDirection: ToastSwipeDirection | undefined;
    isSwiping: boolean;
    isRealSwipe: boolean;
    dragDismissed: boolean;
    dragOffset: { x: number; y: number };
    initialTransform: Transform;
    titleId: string | undefined;
    descriptionId: string | undefined;
    lockedDirection: 'horizontal' | 'vertical' | null;
};

type SwipePointerEvent = Pick<
    PointerEvent,
    'button' | 'pointerType' | 'clientX' | 'clientY' | 'movementX' | 'movementY' | 'pointerId' | 'preventDefault'
> & {
    nativeEvent?: Event;
    target?: EventTarget | null;
};

function getDisplacement(direction: ToastSwipeDirection, deltaX: number, deltaY: number) {
    switch (direction) {
        case 'up':
            return -deltaY;
        case 'down':
            return deltaY;
        case 'left':
            return -deltaX;
        case 'right':
            return deltaX;
        default:
            return 0;
    }
}

function getElementTransform(element: HTMLElement): Transform {
    const transform = element.ownerDocument.defaultView?.getComputedStyle(element).transform;
    let x = 0;
    let y = 0;
    let scale = 1;
    const matrix = transform && transform !== 'none' ? transform.match(/matrix(?:3d)?\(([^)]+)\)/) : null;
    if (matrix?.[1]) {
        const values = matrix[1].split(', ').map(Number.parseFloat);
        if (values.length === 6) {
            x = values[4] ?? 0;
            y = values[5] ?? 0;
            if (values[0] !== undefined && values[1] !== undefined) {
                scale = Math.sqrt(values[0] * values[0] + values[1] * values[1]);
            }
        } else if (values.length === 16) {
            x = values[12] ?? 0;
            y = values[13] ?? 0;
            scale = values[0] ?? 1;
        }
    }
    return { x, y, scale };
}

/**
 * State machine of `Toast.Root`: swipe to dismiss, height measurement for stacking,
 * removal after the exit animation and the toast's props.
 */
export class ToastRootMachine {
    readonly store: Store<SwipeState>;

    readonly rootRef: MutableRef<HTMLElement | null> = { current: null };

    private options: ToastRootOptions;

    private readonly provider: ToastProviderMachine;

    private dragStartPos = { x: 0, y: 0 };

    private initialTransformValue: Transform = { x: 0, y: 0, scale: 1 };

    private intendedSwipeDirection: ToastSwipeDirection | undefined;

    private maxSwipeDisplacement = 0;

    private cancelledSwipe = false;

    private swipeCancelBaseline = { x: 0, y: 0 };

    private isFirstPointerMove = false;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly heightEffect = new Effect(() => this.observeHeight());

    private readonly touchMoveEffect = new Effect(() => this.preventTouchMove());

    private readonly unsubscribe: () => void;

    constructor(provider: ToastProviderMachine, options: ToastRootOptions) {
        this.provider = provider;
        this.options = options;
        this.store = new Store<SwipeState>({
            currentSwipeDirection: undefined,
            isSwiping: false,
            isRealSwipe: false,
            dragDismissed: false,
            dragOffset: { x: 0, y: 0 },
            initialTransform: { x: 0, y: 0, scale: 1 },
            titleId: undefined,
            descriptionId: undefined,
            lockedDirection: null
        });
        this.openChangeComplete = new OpenChangeComplete(this.rootRef, () => {
            if (this.toast.transitionStatus === 'ending') {
                provider.remove(this.toast.id);
            }
        });
        this.unsubscribe = provider.store.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: ToastRootOptions) {
        this.options = options;
        this.sync();
    }

    get toast(): ToastObject {
        return this.options.toast;
    }

    setElement = (element: HTMLElement | null) => {
        this.rootRef.current = element;
        this.sync();
    };

    setTitleId = (id: string | undefined) => {
        this.store.set('titleId', id);
    };

    setDescriptionId = (id: string | undefined) => {
        this.store.set('descriptionId', id);
    };

    getState(): ToastRootState {
        const { isSwiping, currentSwipeDirection } = this.store.state;
        return {
            transitionStatus: this.toast.transitionStatus,
            expanded: this.provider.expanded,
            limited: this.toast.limited || false,
            type: this.toast.type,
            swiping: isSwiping,
            swipeDirection: currentSwipeDirection
        };
    }

    static attrs(state: ToastRootState) {
        return getStyleHookProps(state, toastRootStateAttributesMapping);
    }

    getRootProps(elementProps: Props = {}): Props {
        const { toast } = this;
        const { toasts, focused } = this.provider.store.state;
        const { titleId, descriptionId } = this.store.state;
        const isHighPriority = toast.priority === 'high';
        const domIndex = toasts.indexOf(toast);
        const visibleIndex = toasts.filter((t) => t.transitionStatus !== 'ending').indexOf(toast);
        const offsetY = toasts.slice(0, domIndex).reduce((acc, t) => acc + (t.height || 0), 0);

        return mergeProps(
            {
                role: isHighPriority ? 'alertdialog' : 'dialog',
                tabIndex: 0,
                'aria-modal': false,
                'aria-labelledby': titleId,
                'aria-describedby': descriptionId,
                'aria-hidden': isHighPriority && !focused ? true : undefined,
                onPointerDown: this.handlePointerDown,
                onPointerMove: this.handlePointerMove,
                onPointerUp: this.handlePointerUp,
                onKeyDown: this.handleKeyDown,
                inert: toast.limited,
                style: {
                    ...this.getDragStyles(),
                    [ToastRootCssVars.index]: toast.transitionStatus === 'ending' ? domIndex : visibleIndex,
                    [ToastRootCssVars.offsetY]: `${offsetY}px`
                } as Style
            },
            elementProps
        );
    }

    destroy() {
        this.unsubscribe();
        this.heightEffect.destroy();
        this.touchMoveEffect.destroy();
        this.openChangeComplete.destroy();
    }

    private get swipeDirections(): ToastSwipeDirection[] {
        const { swipeDirection = DEFAULT_SWIPE_DIRECTIONS } = this.options;
        return Array.isArray(swipeDirection) ? swipeDirection : [swipeDirection];
    }

    private sync() {
        this.openChangeComplete.sync(this.toast.transitionStatus !== 'ending');
        this.heightEffect.sync([this.rootRef.current, this.toast.id]);
        this.touchMoveEffect.sync([this.rootRef.current]);
    }

    private observeHeight() {
        const element = this.rootRef.current;
        if (!element) {
            return;
        }
        const id = this.toast.id;
        const setHeights = () => {
            const height = element.offsetHeight;
            this.provider.setToasts((prev) =>
                prev.map((t) => (t.id === id ? { ...t, ref: this.rootRef, height, transitionStatus: undefined } : t))
            );
        };
        setHeights();

        if (typeof ResizeObserver !== 'function') {
            return;
        }
        const resizeObserver = new ResizeObserver(setHeights);
        resizeObserver.observe(element);
        return () => resizeObserver.disconnect();
    }

    private preventTouchMove() {
        const element = this.rootRef.current;
        if (!element) {
            return;
        }
        const handleTouchMove = (event: TouchEvent) => {
            if (contains(element, event.target as Element | null)) {
                event.preventDefault();
            }
        };
        element.addEventListener('touchmove', handleTouchMove, { passive: false });
        return () => element.removeEventListener('touchmove', handleTouchMove);
    }

    private getDragStyles(): Style {
        const { isSwiping, dragOffset, initialTransform, dragDismissed } = this.store.state;
        if (!isSwiping && dragOffset.x === initialTransform.x && dragOffset.y === initialTransform.y && !dragDismissed) {
            return { [ToastRootCssVars.swipeMovementX]: '0px', [ToastRootCssVars.swipeMovementY]: '0px' };
        }
        return {
            transition: isSwiping ? 'none' : undefined,
            [ToastRootCssVars.swipeMovementX]: `${dragOffset.x - initialTransform.x}px`,
            [ToastRootCssVars.swipeMovementY]: `${dragOffset.y - initialTransform.y}px`
        };
    }

    private applyDirectionalDamping(deltaX: number, deltaY: number) {
        const directions = this.swipeDirections;
        let x = deltaX;
        let y = deltaY;
        if (!directions.includes('right') && deltaX > 0) {
            x = deltaX ** OPPOSITE_DIRECTION_DAMPING_FACTOR;
        }
        if (!directions.includes('left') && deltaX < 0) {
            x = -(Math.abs(deltaX) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
        }
        if (!directions.includes('down') && deltaY > 0) {
            y = deltaY ** OPPOSITE_DIRECTION_DAMPING_FACTOR;
        }
        if (!directions.includes('up') && deltaY < 0) {
            y = -(Math.abs(deltaY) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
        }
        return { x, y };
    }

    private readonly handlePointerDown = (event: SwipePointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        if (event.pointerType === 'touch') {
            this.provider.pauseTimers();
        }

        const target = getTarget((event.nativeEvent ?? event) as Event) as HTMLElement | null;
        if (target?.closest('button,a,input,textarea,[role="button"],[data-swipe-ignore]')) {
            return;
        }

        this.cancelledSwipe = false;
        this.intendedSwipeDirection = undefined;
        this.maxSwipeDisplacement = 0;
        this.dragStartPos = { x: event.clientX, y: event.clientY };
        this.swipeCancelBaseline = this.dragStartPos;

        const updates: Partial<SwipeState> = { isSwiping: true, isRealSwipe: false, lockedDirection: null };
        if (this.rootRef.current) {
            const transform = getElementTransform(this.rootRef.current);
            this.initialTransformValue = transform;
            updates.initialTransform = transform;
            updates.dragOffset = { x: transform.x, y: transform.y };
        }
        this.store.update(updates);

        this.isFirstPointerMove = true;
        this.rootRef.current?.setPointerCapture?.(event.pointerId);
    };

    private readonly handlePointerMove = (event: SwipePointerEvent) => {
        if (!this.store.state.isSwiping) {
            return;
        }

        // Prevent text selection on Safari.
        event.preventDefault();

        if (this.isFirstPointerMove) {
            // Account for the delay between pointerdown and the first pointermove on iOS.
            this.dragStartPos = { x: event.clientX, y: event.clientY };
            this.isFirstPointerMove = false;
        }

        const { clientY, clientX, movementX, movementY } = event;
        const baseline = this.swipeCancelBaseline;
        if ((movementY < 0 && clientY > baseline.y) || (movementY > 0 && clientY < baseline.y)) {
            this.swipeCancelBaseline = { x: this.swipeCancelBaseline.x, y: clientY };
        }
        if ((movementX < 0 && clientX > baseline.x) || (movementX > 0 && clientX < baseline.x)) {
            this.swipeCancelBaseline = { x: clientX, y: this.swipeCancelBaseline.y };
        }

        const deltaX = clientX - this.dragStartPos.x;
        const deltaY = clientY - this.dragStartPos.y;
        const cancelDeltaY = clientY - this.swipeCancelBaseline.y;
        const cancelDeltaX = clientX - this.swipeCancelBaseline.x;
        const directions = this.swipeDirections;
        const hasHorizontal = directions.includes('left') || directions.includes('right');
        const hasVertical = directions.includes('up') || directions.includes('down');

        // Parity: the locked direction takes effect from the next move (it was React state).
        const { lockedDirection } = this.store.state;
        if (!this.store.state.isRealSwipe && Math.sqrt(deltaX * deltaX + deltaY * deltaY) >= MIN_DRAG_THRESHOLD) {
            const updates: Partial<SwipeState> = { isRealSwipe: true };
            if (lockedDirection === null && hasHorizontal && hasVertical) {
                updates.lockedDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
            }
            this.store.update(updates);
        }

        this.trackIntendedDirection(lockedDirection, deltaX, deltaY, cancelDeltaX, cancelDeltaY);

        const dampedDelta = this.applyDirectionalDamping(deltaX, deltaY);
        let newOffsetX = this.initialTransformValue.x;
        let newOffsetY = this.initialTransformValue.y;

        if (lockedDirection !== 'vertical' && hasHorizontal) {
            newOffsetX += dampedDelta.x;
        }
        if (lockedDirection !== 'horizontal' && hasVertical) {
            newOffsetY += dampedDelta.y;
        }

        this.store.set('dragOffset', { x: newOffsetX, y: newOffsetY });
    };

    private trackIntendedDirection(
        lockedDirection: SwipeState['lockedDirection'],
        deltaX: number,
        deltaY: number,
        cancelDeltaX: number,
        cancelDeltaY: number
    ) {
        if (this.intendedSwipeDirection) {
            const direction = this.intendedSwipeDirection;
            const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);
            if (currentDisplacement > SWIPE_THRESHOLD) {
                this.cancelledSwipe = false;
                this.store.set('currentSwipeDirection', direction);
            } else if (this.maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD) {
                // A change of mind occurred.
                this.cancelledSwipe = true;
            }
            return;
        }

        let candidate: ToastSwipeDirection | undefined;
        if (lockedDirection === 'vertical') {
            candidate = deltaY > 0 ? 'down' : deltaY < 0 ? 'up' : undefined;
        } else if (lockedDirection === 'horizontal') {
            candidate = deltaX > 0 ? 'right' : deltaX < 0 ? 'left' : undefined;
        } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
            candidate = deltaX > 0 ? 'right' : 'left';
        } else {
            candidate = deltaY > 0 ? 'down' : 'up';
        }

        if (candidate && this.swipeDirections.includes(candidate)) {
            this.intendedSwipeDirection = candidate;
            this.maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
            this.store.set('currentSwipeDirection', candidate);
        }
    }

    private readonly handlePointerUp = (event: SwipePointerEvent) => {
        if (!this.store.state.isSwiping) {
            return;
        }
        if (event.pointerType === 'touch' && !this.provider.store.state.focused) {
            this.provider.resumeTimers();
        }

        this.store.update({ isSwiping: false, isRealSwipe: false, lockedDirection: null });
        this.rootRef.current?.releasePointerCapture?.(event.pointerId);

        const { initialTransform, dragOffset } = this.store.state;
        const resetOffset = () => {
            this.store.update({ dragOffset: { x: initialTransform.x, y: initialTransform.y }, currentSwipeDirection: undefined });
        };

        if (this.cancelledSwipe) {
            resetOffset();
            return;
        }

        const deltaX = dragOffset.x - initialTransform.x;
        const deltaY = dragOffset.y - initialTransform.y;
        const dismissDirection = this.swipeDirections.find(
            (direction) =>
                (direction === 'right' && deltaX > SWIPE_THRESHOLD) ||
                (direction === 'left' && deltaX < -SWIPE_THRESHOLD) ||
                (direction === 'down' && deltaY > SWIPE_THRESHOLD) ||
                (direction === 'up' && deltaY < -SWIPE_THRESHOLD)
        );

        if (dismissDirection) {
            this.store.update({ currentSwipeDirection: dismissDirection, dragDismissed: true });
            this.provider.close(this.toast.id);
        } else {
            resetOffset();
        }
    };

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        const root = this.rootRef.current;
        if (event.key === 'Escape' && root && contains(root, activeElement(ownerDocument(root)))) {
            this.provider.close(this.toast.id);
        }
    };
}

import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { Store } from '~@store/Store';

import type { MutableRef, Style } from '~@lib/types';

import { getDrawerDataAttributes } from '../utils/getDrawerDataAttributes';
import { parseSnapPoint } from '../utils/parseSnapPoint';

import type { DrawerDirection, DrawerPopupDataAttributes, SnapPoint } from '../store/DrawerStore';

import { DrawerGestureCssVars } from './DrawerGestureCssVars';

const SWIPE_THRESHOLD = 40;

const REVERSE_CANCEL_THRESHOLD = 10;

const MIN_DRAG_THRESHOLD = 1;

const VELOCITY_FOR_FORCED_CLOSE = 2;

const FORCED_CLOSE_THRESHOLD = 0.4;

const DEFAULT_CLOSE_THRESHOLD = 0.4;

const DEFAULT_VELOCITY_THRESHOLD = 0.5;

const DEFAULT_SCROLL_LOCK_TIMEOUT = 100;

const DEFAULT_DAMPING_FACTOR = 0.5;

export type DrawerDragEndDetails = {
    shouldClose: boolean;
    dismissDirection: DrawerDirection | undefined;
    velocityX: number;
    velocityY: number;
};

type GesturePointerEvent = Pick<
    PointerEvent,
    'button' | 'clientX' | 'clientY' | 'movementX' | 'movementY' | 'pointerId' | 'preventDefault'
> & {
    nativeEvent?: Event;
    target?: EventTarget | null;
};

export type DrawerGestureOptions = {
    swipeDirection: DrawerDirection;
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    onDragStart?: ((event: GesturePointerEvent) => void) | undefined;
    onDragMove?: ((event: GesturePointerEvent, offset: { x: number; y: number }) => void) | undefined;
    onDragEnd?: ((event: GesturePointerEvent, details: DrawerDragEndDetails) => void) | undefined;
    snapPoints?: SnapPoint[] | undefined;
    /**
     * Controlled index of the active snap point.
     */
    activeSnapPointIndex?: number | undefined;
    onActiveSnapPointIndexChange?: ((index: number) => void) | undefined;
    containerRef?: MutableRef<HTMLElement | null> | undefined;
    /**
     * Distance (px) or fraction of the panel size (0–1) past which a release closes the drawer.
     * @default 0.4
     */
    closeThreshold?: number | undefined;
    /**
     * @default 0.5
     */
    velocityThreshold?: number | undefined;
    draggableRef: MutableRef<HTMLElement | null>;
    panel: HTMLElement | null;
    /**
     * @default 100
     */
    scrollLockTimeout?: number | undefined;
    /**
     * @default 0.5
     */
    dampingFactor?: number | undefined;
};

type GestureState = {
    isSwiping: boolean;
    isRealSwipe: boolean;
    dragOffset: { x: number; y: number };
    activeSnapPointIndex: number;
};

function getDisplacement(direction: DrawerDirection, deltaX: number, deltaY: number) {
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

const isVertical = (direction: DrawerDirection) => direction === 'up' || direction === 'down';

function findClosestSnapPoint(offset: number, zones: number[]): number {
    return zones.reduce((closest, point) => (Math.abs(point - offset) < Math.abs(closest - offset) ? point : closest));
}

function isCloseDirection(direction: DrawerDirection, deltaAxis: number) {
    return (
        (deltaAxis > 0 && (direction === 'down' || direction === 'right')) ||
        (deltaAxis < 0 && (direction === 'up' || direction === 'left'))
    );
}

/**
 * Swipe-to-dismiss and snap point gestures of a drawer. Replacement for `useDrawerGesture`.
 *
 * Attach {@link DrawerGesture.onPointerDown}/`onPointerMove`/`onPointerUp` to the drag handle and
 * read {@link DrawerGesture.getStyle}, {@link DrawerGesture.getDataAttributes} and the `store` state.
 */
export class DrawerGesture {
    readonly store: Store<GestureState>;

    private options: DrawerGestureOptions;

    private dragStartPos = { x: 0, y: 0 };

    private panelStartPos = { x: 0, y: 0 };

    private intendedSwipeDirection: DrawerDirection | undefined;

    private maxSwipeDisplacement = 0;

    private cancelledSwipe = false;

    private swipeCancelBaseline = { x: 0, y: 0 };

    private isFirstPointerMove = false;

    private startTime: number | null = null;

    private lastTimeDragPrevented: number | null = null;

    private touchMoveElement: HTMLElement | null = null;

    private readonly removeResizeListener: () => void;

    private windowDimensions: { innerWidth: number; innerHeight: number } | undefined;

    constructor(options: DrawerGestureOptions) {
        this.options = options;
        this.store = new Store<GestureState>({
            isSwiping: false,
            isRealSwipe: false,
            dragOffset: { x: 0, y: 0 },
            activeSnapPointIndex: options.activeSnapPointIndex ?? 0
        });

        if (typeof window === 'undefined') {
            this.removeResizeListener = () => {};
        } else {
            const onResize = () => {
                this.windowDimensions = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
            };
            onResize();
            window.addEventListener('resize', onResize);
            this.removeResizeListener = () => window.removeEventListener('resize', onResize);
        }

        this.syncTouchMoveListener();
        this.snapToFirstPoint();
    }

    setOptions(options: DrawerGestureOptions) {
        this.options = options;
        if (options.activeSnapPointIndex !== undefined) {
            this.store.set('activeSnapPointIndex', options.activeSnapPointIndex);
        }
        this.syncTouchMoveListener();
        this.snapToFirstPoint();
    }

    get offset(): number {
        const { swipeDirection } = this.options;
        const { dragOffset } = this.store.state;
        return swipeDirection === 'left' || swipeDirection === 'right' ? dragOffset.x : dragOffset.y;
    }

    get isGesturing(): boolean {
        return this.store.state.isSwiping;
    }

    getDataAttributes(): DrawerPopupDataAttributes {
        const { snapPoints = [], swipeDirection } = this.options;
        return getDrawerDataAttributes(snapPoints.length > 0, swipeDirection);
    }

    getStyle(): Style {
        const { snapPoints = [], swipeDirection } = this.options;
        const { isSwiping, dragOffset, activeSnapPointIndex } = this.store.state;
        const { maxSnapPoint, snapPointsOffset } = this.measure();
        const swipeMovement = isVertical(swipeDirection) ? dragOffset.y : dragOffset.x;

        return {
            ...(isSwiping ? { transition: 'none', [DrawerGestureCssVars.swipeMovement]: `${swipeMovement}px` } : {}),
            ...(snapPoints.length > 0
                ? {
                      [DrawerGestureCssVars.snapPointIndex]: `${activeSnapPointIndex}`,
                      [DrawerGestureCssVars.snapPointTransform]: `${snapPointsOffset[activeSnapPointIndex]}px`,
                      [DrawerGestureCssVars.snapPointMax]: `${maxSnapPoint}px`
                  }
                : {})
        };
    }

    onPointerDown = (event: GesturePointerEvent) => {
        const { enabled = true, scrollLockTimeout = DEFAULT_SCROLL_LOCK_TIMEOUT, swipeDirection, panel, draggableRef } = this.options;
        if (event.button !== 0 || !enabled) {
            return;
        }

        let target = getTarget((event.nativeEvent ?? event) as Event) as HTMLElement | null;
        if (target?.closest('button,a,input,textarea,[role="button"],[data-swipe-ignore]')) {
            return;
        }

        const currentTime = Date.now();
        const { dragOffset } = this.store.state;
        const dragOffsetValue = isVertical(swipeDirection) ? dragOffset.y : dragOffset.x;

        // Disallow dragging if the drawer was scrolled within `scrollLockTimeout`.
        if (this.lastTimeDragPrevented && currentTime - this.lastTimeDragPrevented < scrollLockTimeout && dragOffsetValue === 0) {
            this.lastTimeDragPrevented = currentTime;
            return;
        }

        while (target) {
            if (target.scrollHeight > target.clientHeight) {
                if (target.scrollTop !== 0) {
                    // The element is scrollable and not scrolled to the top, so don't drag.
                    this.lastTimeDragPrevented = Date.now();
                    return;
                }
                if (target.getAttribute('role') === 'dialog') {
                    break;
                }
            }
            target = target.parentNode as HTMLElement | null;
        }

        const panelRect = panel?.getBoundingClientRect() ?? { x: 0, y: 0 };
        this.cancelledSwipe = false;
        this.intendedSwipeDirection = undefined;
        this.maxSwipeDisplacement = 0;
        this.dragStartPos = { x: event.clientX, y: event.clientY };
        this.panelStartPos = { x: panelRect.x, y: panelRect.y };
        this.swipeCancelBaseline = this.dragStartPos;

        const updates: Partial<GestureState> = { isSwiping: true, isRealSwipe: false };
        if (draggableRef.current && panel) {
            updates.dragOffset = { x: 0, y: 0 };
        }
        this.store.update(updates);

        this.isFirstPointerMove = true;
        this.startTime = Date.now();
        draggableRef.current?.setPointerCapture?.(event.pointerId);
        this.options.onDragStart?.(event);
    };

    onPointerMove = (event: GesturePointerEvent) => {
        const { swipeDirection, snapPoints = [] } = this.options;
        const { isSwiping, isRealSwipe, activeSnapPointIndex } = this.store.state;
        if (!isSwiping) {
            return;
        }

        // Prevent text selection on Safari.
        event.preventDefault();

        if (this.isFirstPointerMove) {
            // Adjust the starting position to account for the delay between pointerdown and the first pointermove on iOS.
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

        if (!isRealSwipe && Math.sqrt(deltaX * deltaX + deltaY * deltaY) >= MIN_DRAG_THRESHOLD) {
            this.store.set('isRealSwipe', true);
        }

        this.trackIntendedDirection(deltaX, deltaY, cancelDeltaX, cancelDeltaY);

        const isVerticalSwipe = isVertical(swipeDirection);
        const isCloseDirectionValue = isCloseDirection(swipeDirection, isVerticalSwipe ? deltaY : deltaX);
        const shouldDamp = snapPoints.length === 0 || activeSnapPointIndex === snapPoints.length - 1;

        let finalDeltaX = deltaX;
        let finalDeltaY = deltaY;

        if (shouldDamp) {
            finalDeltaX = isVerticalSwipe ? deltaX : this.applyDamping(deltaX);
            finalDeltaY = isVerticalSwipe ? this.applyDamping(deltaY) : deltaY;
        } else if (snapPoints.length > 0 && !isCloseDirectionValue) {
            const finalDelta = this.getOvershootDelta(isVerticalSwipe ? deltaY : deltaX);
            if (finalDelta !== null) {
                if (isVerticalSwipe) {
                    finalDeltaY = finalDelta;
                } else {
                    finalDeltaX = finalDelta;
                }
            }
        }

        const offset = { x: isVerticalSwipe ? 0 : finalDeltaX, y: isVerticalSwipe ? finalDeltaY : 0 };
        this.store.set('dragOffset', offset);
        this.options.onDragMove?.(event, offset);
    };

    onPointerUp = (event: GesturePointerEvent) => {
        const { enabled = true, swipeDirection, draggableRef } = this.options;
        if (!this.store.state.isSwiping || !enabled) {
            return;
        }

        draggableRef.current?.releasePointerCapture?.(event.pointerId);
        this.store.update({ isSwiping: false, isRealSwipe: false });

        const timeDelta = Date.now() - (this.startTime ?? 0);
        this.startTime = null;

        if (this.cancelledSwipe) {
            return;
        }

        const { dragOffset } = this.store.state;
        const velocityX = Math.abs(dragOffset.x) / timeDelta;
        const velocityY = Math.abs(dragOffset.y) / timeDelta;
        const shouldClose = this.calculateShouldClose(velocityX, velocityY);

        this.options.onDragEnd?.(event, {
            shouldClose,
            dismissDirection: shouldClose ? swipeDirection : undefined,
            velocityX,
            velocityY
        });
    };

    destroy() {
        this.removeResizeListener();
        this.detachTouchMove();
    }

    private trackIntendedDirection(deltaX: number, deltaY: number, cancelDeltaX: number, cancelDeltaY: number) {
        if (!this.intendedSwipeDirection) {
            let candidate: DrawerDirection;
            if (Math.abs(deltaX) >= Math.abs(deltaY)) {
                candidate = deltaX > 0 ? 'right' : 'left';
            } else {
                candidate = deltaY > 0 ? 'down' : 'up';
            }
            if (candidate === this.options.swipeDirection) {
                this.intendedSwipeDirection = candidate;
                this.maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
            }
            return;
        }

        const currentDisplacement = getDisplacement(this.intendedSwipeDirection, cancelDeltaX, cancelDeltaY);
        if (currentDisplacement > SWIPE_THRESHOLD) {
            this.cancelledSwipe = false;
        } else if (this.maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD) {
            // A change of mind occurred.
            this.cancelledSwipe = true;
        }
    }

    private getOvershootDelta(currentDelta: number): number | null {
        const isVerticalSwipe = isVertical(this.options.swipeDirection);
        const { containerSize, maxSnapPoint } = this.measure();
        const panelStartPosition = isVerticalSwipe ? this.panelStartPos.y : this.panelStartPos.x;
        const potentialPosition = panelStartPosition + currentDelta;

        if (currentDelta < 0 && potentialPosition < containerSize.height - maxSnapPoint) {
            const overshoot = potentialPosition - maxSnapPoint;
            const baseDelta = Math.sign(currentDelta) * (panelStartPosition - (containerSize.height - maxSnapPoint));
            return baseDelta + this.applyDamping(overshoot);
        }
        if (currentDelta > 0 && potentialPosition + maxSnapPoint > maxSnapPoint) {
            const overshoot = potentialPosition;
            const baseDelta = Math.sign(currentDelta) * Math.abs(maxSnapPoint - (panelStartPosition + maxSnapPoint));
            return baseDelta + this.applyDamping(overshoot);
        }
        return null;
    }

    private calculateShouldClose(velocityX: number, velocityY: number): boolean {
        const { swipeDirection, snapPoints = [], velocityThreshold = DEFAULT_VELOCITY_THRESHOLD, panel } = this.options;
        const { dragOffset, activeSnapPointIndex } = this.store.state;
        const { containerSize, snapPointsOffset } = this.measure();
        const isVerticalSwipe = isVertical(swipeDirection);

        const positionDelta = isVerticalSwipe ? dragOffset.y : dragOffset.x;
        const velocity = isVerticalSwipe ? velocityY : velocityX;
        const panelSize = panel?.getBoundingClientRect() ?? containerSize;
        const panelSizeValue = isVerticalSwipe ? panelSize.height : panelSize.width;
        const positionDeltaAbsolute = Math.abs(positionDelta);
        const isCloseDirectionValue = isCloseDirection(swipeDirection, positionDelta >= 0 ? 1 : -1);
        const closeThreshold = this.getCloseThreshold();

        if (snapPoints.length > 0) {
            const closestSnapPoint = findClosestSnapPoint(positionDelta + (snapPointsOffset[activeSnapPointIndex] ?? 0), snapPointsOffset);

            if (velocity > VELOCITY_FOR_FORCED_CLOSE && positionDeltaAbsolute < panelSizeValue * FORCED_CLOSE_THRESHOLD) {
                if (isCloseDirectionValue) {
                    return true;
                }
                this.snapToPoint(snapPointsOffset[snapPoints.length - 1] ?? 0);
                return false;
            }

            if (
                activeSnapPointIndex === 0 &&
                isCloseDirectionValue &&
                (positionDeltaAbsolute > closeThreshold || velocity > velocityThreshold)
            ) {
                return true;
            }

            this.snapToPoint(closestSnapPoint);
            return false;
        }

        // Close only when moving towards the closed side, far enough or fast enough (every direction alike).
        return isCloseDirectionValue && (positionDeltaAbsolute > closeThreshold || velocity > velocityThreshold);
    }

    private getCloseThreshold() {
        const { closeThreshold = DEFAULT_CLOSE_THRESHOLD, panel, swipeDirection } = this.options;
        if (closeThreshold < 1 && closeThreshold > 0) {
            const panelSize = panel?.getBoundingClientRect() ?? this.measure().containerSize;
            return (isVertical(swipeDirection) ? panelSize.height : panelSize.width) * closeThreshold;
        }
        return closeThreshold;
    }

    private applyDamping(overshoot: number) {
        const { swipeDirection, dampingFactor = DEFAULT_DAMPING_FACTOR } = this.options;
        let newOvershoot = overshoot;
        if (swipeDirection !== 'down' && swipeDirection !== 'right' && overshoot > 0) {
            newOvershoot = overshoot ** dampingFactor;
        }
        if (swipeDirection !== 'up' && swipeDirection !== 'left' && overshoot < 0) {
            newOvershoot = -(Math.abs(overshoot) ** dampingFactor);
        }
        return newOvershoot;
    }

    private measure() {
        const { containerRef, swipeDirection, snapPoints = [] } = this.options;
        const container = containerRef?.current;
        let containerSize = { width: 0, height: 0 };
        if (container) {
            const rect = container.getBoundingClientRect();
            containerSize = { width: rect.width, height: rect.height };
        } else if (this.windowDimensions) {
            containerSize = { width: this.windowDimensions.innerWidth, height: this.windowDimensions.innerHeight };
        }

        const containerSizeAxis = isVertical(swipeDirection) ? containerSize.height : containerSize.width;
        const snapPointsAxis = snapPoints.map((snapPoint) => parseSnapPoint(snapPoint, containerSizeAxis)).sort((a, b) => a - b);
        const maxSnapPoint = Math.max(...snapPointsAxis.map((snapPoint) => Math.abs(snapPoint)));
        const snapPointsOffset = snapPointsAxis.map((snapPoint) =>
            swipeDirection === 'down' || swipeDirection === 'right' ? maxSnapPoint - snapPoint : -maxSnapPoint + snapPoint
        );

        return { containerSize, maxSnapPoint, snapPointsOffset };
    }

    private snapToPoint(translateValue: number) {
        const newIndex = this.measure().snapPointsOffset.indexOf(translateValue);
        if (newIndex !== -1 && newIndex !== this.store.state.activeSnapPointIndex) {
            if (this.options.activeSnapPointIndex === undefined) {
                this.store.set('activeSnapPointIndex', newIndex);
            }
            this.options.onActiveSnapPointIndexChange?.(newIndex);
        }
    }

    private snapToFirstPoint() {
        if (this.store.state.activeSnapPointIndex !== 0) {
            return;
        }
        const first = this.measure().snapPointsOffset[0];
        if (typeof first === 'number') {
            this.snapToPoint(first);
        }
    }

    private syncTouchMoveListener() {
        const element = this.options.draggableRef.current;
        if (element === this.touchMoveElement) {
            return;
        }
        this.detachTouchMove();
        this.touchMoveElement = element;
        element?.addEventListener('touchmove', this.preventTouchMove, { passive: false });
    }

    private detachTouchMove() {
        this.touchMoveElement?.removeEventListener('touchmove', this.preventTouchMove);
        this.touchMoveElement = null;
    }

    private readonly preventTouchMove = (event: TouchEvent) => {
        if (contains(this.touchMoveElement, event.target as Element | null)) {
            event.preventDefault();
        }
    };
}

import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { clamp } from '~@lib/clamp';
import { isWebKit } from '~@lib/detectBrowser';
import { styleDisableScrollbar } from '~@lib/disableScrollbar';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { contains } from '~@packages/floating-ui/utils/element';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { Style, TextDirection } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { ScrollAreaScrollbarCssVars } from '../scrollbar/ScrollAreaScrollbarCssVars';
import { ScrollAreaScrollbarDataAttributes } from '../scrollbar/ScrollAreaScrollbarDataAttributes';
import { MIN_THUMB_SIZE, SCROLL_TIMEOUT } from '../utils/constants';
import { getOffset } from '../utils/getOffset';
import { normalizeScrollOffset } from '../utils/normalizeScrollOffset';
import { ScrollAreaViewportCssVars } from '../viewport/ScrollAreaViewportCssVars';

import { ScrollAreaRootCssVars } from './ScrollAreaRootCssVars';
import { scrollAreaStateAttributesMapping } from './scrollAreaStateAttributesMapping';

export type ScrollAreaOrientation = 'vertical' | 'horizontal';

type Size = { width: number; height: number };

type Coords = { x: number; y: number };

type HiddenState = { x: boolean; y: boolean; corner: boolean };

type OverflowEdges = { xStart: boolean; xEnd: boolean; yStart: boolean; yEnd: boolean };

export type ScrollAreaState = {
    scrolling: boolean;
    hasOverflowX: boolean;
    hasOverflowY: boolean;
    overflowXStart: boolean;
    overflowXEnd: boolean;
    overflowYStart: boolean;
    overflowYEnd: boolean;
    cornerHidden: boolean;
};

export type ScrollAreaScrollbarState = ScrollAreaState & {
    hovering: boolean;
    orientation: ScrollAreaOrientation;
};

function onVisible(element: HTMLElement, callback: () => void) {
    if (typeof IntersectionObserver === 'undefined') {
        return () => {};
    }

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.intersectionRatio > 0) {
                callback();
                observer.disconnect();
            }
        }
    });

    observer.observe(element);

    return () => {
        observer.disconnect();
    };
}

// Register the overflow CSS properties once, regardless of how many scroll areas are mounted.
let scrollAreaOverflowVarsRegistered = false;

function removeCSSVariableInheritance() {
    // When `inherits: false`, specifying `inherit` on child elements doesn't work in Safari.
    if (scrollAreaOverflowVarsRegistered || isWebKit) {
        return;
    }

    if (typeof CSS !== 'undefined' && 'registerProperty' in CSS) {
        for (const name of Object.values(ScrollAreaViewportCssVars)) {
            try {
                CSS.registerProperty({ name, syntax: '<length>', inherits: false, initialValue: '0px' });
            } catch {
                /* ignore already-registered */
            }
        }
    }

    scrollAreaOverflowVarsRegistered = true;
}

export type OverflowEdgeThreshold = number | Partial<{ xStart: number; xEnd: number; yStart: number; yEnd: number }>;

function normalizeOverflowEdgeThreshold(threshold: OverflowEdgeThreshold | undefined) {
    if (typeof threshold === 'number') {
        const value = Math.max(0, threshold);
        return { xStart: value, xEnd: value, yStart: value, yEnd: value };
    }

    return {
        xStart: Math.max(0, threshold?.xStart || 0),
        xEnd: Math.max(0, threshold?.xEnd || 0),
        yStart: Math.max(0, threshold?.yStart || 0),
        yEnd: Math.max(0, threshold?.yEnd || 0)
    };
}

type ScrollAreaInternalState = {
    hovering: boolean;
    scrollingX: boolean;
    scrollingY: boolean;
    touchModality: boolean;
    cornerSize: Size;
    thumbSize: Size;
    overflowEdges: OverflowEdges;
    hiddenState: HiddenState;
};

export type ScrollAreaOptions = {
    overflowEdgeThreshold?: OverflowEdgeThreshold | undefined;
    direction?: TextDirection | undefined;
    /**
     * Root id (used for `data-id` on the viewport and scrollbars).
     */
    rootId?: string | undefined;
};

type ScrollAreaPointerEvent = PointerEvent & { currentTarget: EventTarget | null };

/**
 * State machine of a scroll area: custom scrollbars, thumb sizes and positions, overflow edges,
 * hover/scrolling flags and thumb dragging.
 */
export class ScrollAreaMachine {
    readonly store = new Store<ScrollAreaInternalState>({
        hovering: false,
        scrollingX: false,
        scrollingY: false,
        touchModality: false,
        cornerSize: { width: 0, height: 0 },
        thumbSize: { width: 0, height: 0 },
        overflowEdges: { xStart: false, xEnd: false, yStart: false, yEnd: false },
        hiddenState: { x: false, y: false, corner: false }
    });

    private options: ScrollAreaOptions;

    private root: HTMLElement | null = null;

    private viewport: HTMLElement | null = null;

    private content: HTMLElement | null = null;

    private scrollbarY: HTMLElement | null = null;

    private scrollbarX: HTMLElement | null = null;

    private thumbY: HTMLElement | null = null;

    private thumbX: HTMLElement | null = null;

    private corner: HTMLElement | null = null;

    private thumbDragging = false;

    private startY = 0;

    private startX = 0;

    private startScrollTop = 0;

    private startScrollLeft = 0;

    private currentOrientation: ScrollAreaOrientation = 'vertical';

    private scrollPosition: Coords = { x: 0, y: 0 };

    private programmaticScroll = true;

    private readonly scrollYTimeout = new Timeout();

    private readonly scrollXTimeout = new Timeout();

    private readonly scrollEndTimeout = new Timeout();

    private readonly waitForAnimationsTimeout = new Timeout();

    private readonly visibleEffect: Effect;

    private readonly resizeEffect: Effect;

    private readonly contentResizeEffect: Effect;

    private readonly wheelEffects: Record<ScrollAreaOrientation, Effect>;

    private recomputeDeps: unknown[] = [];

    constructor(options: ScrollAreaOptions = {}) {
        this.options = options;
        this.visibleEffect = new Effect(() => this.observeVisibility());
        this.resizeEffect = new Effect(() => this.observeViewportResize());
        this.contentResizeEffect = new Effect(() => this.observeContentResize());
        this.wheelEffects = {
            vertical: new Effect(() => this.attachWheel('vertical')),
            horizontal: new Effect(() => this.attachWheel('horizontal'))
        };
        this.store.subscribe(() => this.scheduleRecompute());
    }

    setOptions(options: ScrollAreaOptions) {
        this.options = options;
        this.scheduleRecompute();
    }

    private get direction(): TextDirection {
        return this.options.direction ?? 'ltr';
    }

    get overflowEdgeThreshold() {
        return normalizeOverflowEdgeThreshold(this.options.overflowEdgeThreshold);
    }

    getState(): ScrollAreaState {
        const { scrollingX, scrollingY, hiddenState, overflowEdges } = this.store.state;
        return {
            scrolling: scrollingX || scrollingY,
            hasOverflowX: !hiddenState.x,
            hasOverflowY: !hiddenState.y,
            overflowXStart: overflowEdges.xStart,
            overflowXEnd: overflowEdges.xEnd,
            overflowYStart: overflowEdges.yStart,
            overflowYEnd: overflowEdges.yEnd,
            cornerHidden: hiddenState.corner
        };
    }

    getScrollbarState(orientation: ScrollAreaOrientation): ScrollAreaScrollbarState {
        const { hovering, scrollingX, scrollingY } = this.store.state;
        return { ...this.getState(), hovering, scrolling: orientation === 'horizontal' ? scrollingX : scrollingY, orientation };
    }

    static attrs(state: ScrollAreaState | ScrollAreaScrollbarState): Record<string, string> {
        return getStyleHookProps(state, scrollAreaStateAttributesMapping);
    }

    destroy() {
        this.visibleEffect.destroy();
        this.resizeEffect.destroy();
        this.contentResizeEffect.destroy();
        this.wheelEffects.vertical.destroy();
        this.wheelEffects.horizontal.destroy();
        this.scrollYTimeout.clear();
        this.scrollXTimeout.clear();
        this.scrollEndTimeout.clear();
        this.waitForAnimationsTimeout.clear();
    }

    // ---- elements ---------------------------------------------------------------------

    setRoot = (element: HTMLElement | null) => {
        this.root = element;
    };

    setViewport = (element: HTMLElement | null) => {
        this.viewport = element;
        this.visibleEffect.sync([element]);
        this.resizeEffect.sync([element]);
        // `onMouseEnter` doesn't fire upon load, so check if the viewport is already hovered.
        if (element?.matches(':hover')) {
            this.store.set('hovering', true);
        }
        this.syncWheel();
        this.scheduleRecompute(true);
    };

    setContent = (element: HTMLElement | null) => {
        this.content = element;
        this.contentResizeEffect.sync([element]);
    };

    setScrollbar = (orientation: ScrollAreaOrientation, element: HTMLElement | null) => {
        if (orientation === 'vertical') {
            this.scrollbarY = element;
        } else {
            this.scrollbarX = element;
        }
        this.syncWheel();
        this.scheduleRecompute(true);
    };

    setThumb = (orientation: ScrollAreaOrientation, element: HTMLElement | null) => {
        if (orientation === 'vertical') {
            this.thumbY = element;
        } else {
            this.thumbX = element;
        }
        this.scheduleRecompute(true);
    };

    setCorner = (element: HTMLElement | null) => {
        this.corner = element;
    };

    // ---- props ------------------------------------------------------------------------

    getRootProps(): Props {
        const { cornerSize } = this.store.state;
        return {
            role: 'presentation',
            onPointerEnter: this.handlePointerEnterOrMove,
            onPointerMove: this.handlePointerEnterOrMove,
            onPointerDown: this.handleTouchModalityChange,
            onPointerLeave: () => {
                this.store.set('hovering', false);
            },
            style: {
                position: 'relative',
                [ScrollAreaRootCssVars.scrollAreaCornerHeight]: `${cornerSize.height}px`,
                [ScrollAreaRootCssVars.scrollAreaCornerWidth]: `${cornerSize.width}px`
            } satisfies Style
        };
    }

    getViewportProps(): Props {
        const { hiddenState } = this.store.state;
        const rootId = this.options.rootId;
        const handleUserInteraction = () => {
            this.programmaticScroll = false;
        };

        return {
            role: 'presentation',
            ...(rootId && { 'data-id': `${rootId}-viewport` }),
            // https://accessibilityinsights.io/info-examples/web/scrollable-region-focusable/
            ...((!hiddenState.x || !hiddenState.y) && { tabIndex: 0 }),
            className: styleDisableScrollbar.className,
            style: { overflow: 'scroll' },
            onScroll: this.onViewportScroll,
            onWheel: handleUserInteraction,
            onTouchMove: handleUserInteraction,
            onPointerMove: handleUserInteraction,
            onPointerEnter: handleUserInteraction,
            onKeyDown: handleUserInteraction
        };
    }

    getContentProps(): Props {
        return { role: 'presentation', style: { minWidth: 'fit-content' } };
    }

    /**
     * Whether a scrollbar is rendered.
     */
    shouldRenderScrollbar(orientation: ScrollAreaOrientation, keepMounted = false) {
        const { hiddenState } = this.store.state;
        const isHidden = orientation === 'vertical' ? hiddenState.y : hiddenState.x;
        return keepMounted || !isHidden;
    }

    getScrollbarProps(orientation: ScrollAreaOrientation): Props {
        const { thumbSize } = this.store.state;
        const rootId = this.options.rootId;
        return {
            ...(rootId && { 'data-id': `${rootId}-scrollbar` }),
            onPointerDown: (event: ScrollAreaPointerEvent) => this.onTrackPointerDown(orientation, event),
            onPointerUp: this.handlePointerUp,
            style: {
                position: 'absolute',
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                ...(orientation === 'vertical' && {
                    top: 0,
                    bottom: `var(${ScrollAreaRootCssVars.scrollAreaCornerHeight})`,
                    insetInlineEnd: 0,
                    [ScrollAreaScrollbarCssVars.scrollAreaThumbHeight]: `${thumbSize.height}px`
                }),
                ...(orientation === 'horizontal' && {
                    insetInlineStart: 0,
                    insetInlineEnd: `var(${ScrollAreaRootCssVars.scrollAreaCornerWidth})`,
                    bottom: 0,
                    [ScrollAreaScrollbarCssVars.scrollAreaThumbWidth]: `${thumbSize.width}px`
                })
            } satisfies Style
        };
    }

    getThumbProps(orientation: ScrollAreaOrientation): Props {
        return {
            onPointerDown: this.handlePointerDown,
            onPointerMove: this.handlePointerMove,
            onPointerUp: (event: ScrollAreaPointerEvent) => {
                if (orientation === 'vertical') {
                    this.store.set('scrollingY', false);
                }
                if (orientation === 'horizontal') {
                    this.store.set('scrollingX', false);
                }
                this.handlePointerUp(event);
            },
            style: {
                ...(orientation === 'vertical' && { height: `var(${ScrollAreaScrollbarCssVars.scrollAreaThumbHeight})` }),
                ...(orientation === 'horizontal' && { width: `var(${ScrollAreaScrollbarCssVars.scrollAreaThumbWidth})` })
            } satisfies Style
        };
    }

    /**
     * Whether the corner is rendered.
     */
    shouldRenderCorner() {
        return !this.store.state.hiddenState.corner;
    }

    getCornerProps(): Props {
        const { cornerSize } = this.store.state;
        return {
            style: {
                position: 'absolute',
                bottom: 0,
                insetInlineEnd: 0,
                width: cornerSize.width,
                height: cornerSize.height
            } satisfies Style
        };
    }

    // ---- behaviour --------------------------------------------------------------------

    private setScrolling(axis: 'x' | 'y') {
        if (axis === 'y') {
            this.store.set('scrollingY', true);
            this.scrollYTimeout.start(SCROLL_TIMEOUT, () => this.store.set('scrollingY', false));
        } else {
            this.store.set('scrollingX', true);
            this.scrollXTimeout.start(SCROLL_TIMEOUT, () => this.store.set('scrollingX', false));
        }
    }

    private handleScroll(scrollPosition: Coords) {
        const offsetX = scrollPosition.x - this.scrollPosition.x;
        const offsetY = scrollPosition.y - this.scrollPosition.y;
        this.scrollPosition = scrollPosition;

        if (offsetY !== 0) {
            this.setScrolling('y');
        }

        if (offsetX !== 0) {
            this.setScrolling('x');
        }
    }

    private readonly onViewportScroll = () => {
        const viewport = this.viewport;
        if (!viewport) {
            return;
        }

        this.computeThumbPosition();

        if (!this.programmaticScroll) {
            this.handleScroll({ x: viewport.scrollLeft, y: viewport.scrollTop });
        }

        // Restore the programmatic flag once scrolling has come to a rest (~100ms without scroll events),
        // so momentum scrolling is still treated as user-driven.
        this.scrollEndTimeout.start(100, () => {
            this.programmaticScroll = true;
        });
    };

    private readonly handleTouchModalityChange = (event: PointerEvent) => {
        this.store.set('touchModality', event.pointerType === 'touch');
    };

    private readonly handlePointerEnterOrMove = (event: PointerEvent) => {
        this.handleTouchModalityChange(event);

        if (event.pointerType !== 'touch') {
            this.store.set('hovering', contains(this.root, event.target as Element));
        }
    };

    private readonly handlePointerDown = (event: ScrollAreaPointerEvent) => {
        if (event.button !== 0) {
            return;
        }

        this.thumbDragging = true;
        this.startY = event.clientY;
        this.startX = event.clientX;
        this.currentOrientation = (event.currentTarget as Element).getAttribute(
            ScrollAreaScrollbarDataAttributes.orientation
        ) as ScrollAreaOrientation;

        if (this.viewport) {
            this.startScrollTop = this.viewport.scrollTop;
            this.startScrollLeft = this.viewport.scrollLeft;
        }

        if (this.thumbY && this.currentOrientation === 'vertical') {
            this.thumbY.setPointerCapture(event.pointerId);
        }

        if (this.thumbX && this.currentOrientation === 'horizontal') {
            this.thumbX.setPointerCapture(event.pointerId);
        }
    };

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (!this.thumbDragging) {
            return;
        }

        const deltaY = event.clientY - this.startY;
        const deltaX = event.clientX - this.startX;
        const viewport = this.viewport;

        if (!viewport) {
            return;
        }

        const scrollableContentHeight = viewport.scrollHeight;
        const viewportHeight = viewport.clientHeight;
        const scrollableContentWidth = viewport.scrollWidth;
        const viewportWidth = viewport.clientWidth;

        if (this.thumbY && this.scrollbarY && this.currentOrientation === 'vertical') {
            const scrollbarYOffset = getOffset(this.scrollbarY, 'padding', 'y');
            const thumbYOffset = getOffset(this.thumbY, 'margin', 'y');
            const thumbHeight = this.thumbY.offsetHeight;
            const maxThumbOffsetY = this.scrollbarY.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset;
            const scrollRatioY = deltaY / maxThumbOffsetY;
            viewport.scrollTop = this.startScrollTop + scrollRatioY * (scrollableContentHeight - viewportHeight);
            event.preventDefault();
            this.setScrolling('y');
        }

        if (this.thumbX && this.scrollbarX && this.currentOrientation === 'horizontal') {
            const scrollbarXOffset = getOffset(this.scrollbarX, 'padding', 'x');
            const thumbXOffset = getOffset(this.thumbX, 'margin', 'x');
            const thumbWidth = this.thumbX.offsetWidth;
            const maxThumbOffsetX = this.scrollbarX.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset;
            const scrollRatioX = deltaX / maxThumbOffsetX;
            viewport.scrollLeft = this.startScrollLeft + scrollRatioX * (scrollableContentWidth - viewportWidth);
            event.preventDefault();
            this.setScrolling('x');
        }
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        this.thumbDragging = false;

        if (this.thumbY && this.currentOrientation === 'vertical') {
            this.thumbY.releasePointerCapture(event.pointerId);
        }

        if (this.thumbX && this.currentOrientation === 'horizontal') {
            this.thumbX.releasePointerCapture(event.pointerId);
        }
    };

    private onTrackPointerDown(orientation: ScrollAreaOrientation, event: ScrollAreaPointerEvent) {
        if (event.button !== 0) {
            return;
        }

        // Ignore clicks on thumb
        if (event.currentTarget !== event.target) {
            return;
        }

        const viewport = this.viewport;
        if (!viewport) {
            return;
        }

        if (this.thumbY && this.scrollbarY && orientation === 'vertical') {
            const thumbYOffset = getOffset(this.thumbY, 'margin', 'y');
            const scrollbarYOffset = getOffset(this.scrollbarY, 'padding', 'y');
            const thumbHeight = this.thumbY.offsetHeight;
            const trackRectY = this.scrollbarY.getBoundingClientRect();
            const clickY = event.clientY - trackRectY.top - thumbHeight / 2 - scrollbarYOffset + thumbYOffset / 2;

            const scrollableContentHeight = viewport.scrollHeight;
            const viewportHeight = viewport.clientHeight;

            const maxThumbOffsetY = this.scrollbarY.offsetHeight - thumbHeight - scrollbarYOffset - thumbYOffset;
            const scrollRatioY = clickY / maxThumbOffsetY;
            viewport.scrollTop = scrollRatioY * (scrollableContentHeight - viewportHeight);
        }

        if (this.thumbX && this.scrollbarX && orientation === 'horizontal') {
            const thumbXOffset = getOffset(this.thumbX, 'margin', 'x');
            const scrollbarXOffset = getOffset(this.scrollbarX, 'padding', 'x');
            const thumbWidth = this.thumbX.offsetWidth;
            const trackRectX = this.scrollbarX.getBoundingClientRect();
            const clickX = event.clientX - trackRectX.left - thumbWidth / 2 - scrollbarXOffset + thumbXOffset / 2;

            const scrollableContentWidth = viewport.scrollWidth;
            const viewportWidth = viewport.clientWidth;

            const maxThumbOffsetX = this.scrollbarX.offsetWidth - thumbWidth - scrollbarXOffset - thumbXOffset;
            const scrollRatioX = clickX / maxThumbOffsetX;

            let newScrollLeft: number;
            if (this.direction === 'rtl') {
                // In RTL, invert the scroll direction
                newScrollLeft = (1 - scrollRatioX) * (scrollableContentWidth - viewportWidth);
                // Adjust for browsers that use negative scrollLeft in RTL
                if (viewport.scrollLeft <= 0) {
                    newScrollLeft = -newScrollLeft;
                }
            } else {
                newScrollLeft = scrollRatioX * (scrollableContentWidth - viewportWidth);
            }

            viewport.scrollLeft = newScrollLeft;
        }

        this.handlePointerDown(event);
    }

    private syncWheel() {
        this.wheelEffects.vertical.sync([this.scrollbarY, this.viewport]);
        this.wheelEffects.horizontal.sync([this.scrollbarX, this.viewport]);
    }

    private attachWheel(orientation: ScrollAreaOrientation) {
        const viewportEl = this.viewport;
        const scrollbarEl = orientation === 'vertical' ? this.scrollbarY : this.scrollbarX;
        if (!scrollbarEl) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            if (!viewportEl || event.ctrlKey) {
                return;
            }

            event.preventDefault();

            if (orientation === 'vertical') {
                if (viewportEl.scrollTop === 0 && event.deltaY < 0) {
                    return;
                }
                if (viewportEl.scrollTop === viewportEl.scrollHeight - viewportEl.clientHeight && event.deltaY > 0) {
                    return;
                }
                viewportEl.scrollTop += event.deltaY;
                return;
            }

            if (viewportEl.scrollLeft === 0 && event.deltaX < 0) {
                return;
            }
            if (viewportEl.scrollLeft === viewportEl.scrollWidth - viewportEl.clientWidth && event.deltaX > 0) {
                return;
            }
            viewportEl.scrollLeft += event.deltaX;
        };

        scrollbarEl.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            scrollbarEl.removeEventListener('wheel', handleWheel);
        };
    }

    private observeVisibility() {
        const viewport = this.viewport;
        if (!viewport) {
            return;
        }

        removeCSSVariableInheritance();

        let hasInitialized = false;
        return onVisible(viewport, () => {
            if (!hasInitialized) {
                hasInitialized = true;
                return;
            }
            this.computeThumbPosition();
        });
    }

    private observeViewportResize() {
        const viewport = this.viewport;
        if (typeof ResizeObserver === 'undefined' || !viewport) {
            return;
        }

        let hasInitialized = false;
        const ro = new ResizeObserver(() => {
            // ResizeObserver fires once upon observing; skip the initial call.
            if (!hasInitialized) {
                hasInitialized = true;
                return;
            }
            this.computeThumbPosition();
        });

        ro.observe(viewport);

        // If there are animations in the viewport (e.g. a dialog popup with a transform),
        // wait for them to finish and then recompute the thumb position.
        this.waitForAnimationsTimeout.start(0, () => {
            const animations = viewport.getAnimations?.({ subtree: true }) ?? [];
            if (animations.length === 0) {
                return;
            }

            Promise.allSettled(animations.map((animation) => animation.finished))
                .then(() => this.computeThumbPosition())
                .catch(() => {});
        });

        return () => {
            ro.disconnect();
            this.waitForAnimationsTimeout.clear();
        };
    }

    private observeContentResize() {
        const content = this.content;
        if (typeof ResizeObserver === 'undefined' || !content) {
            return;
        }

        let hasInitialized = false;
        const ro = new ResizeObserver(() => {
            if (!hasInitialized) {
                hasInitialized = true;
                return;
            }
            this.computeThumbPosition();
        });

        ro.observe(content);

        return () => {
            ro.disconnect();
        };
    }

    // Recompute after the hidden state or direction changes (waits for scrollbar elements to be set).
    private scheduleRecompute(force = false) {
        const deps = [this.store.state.hiddenState, this.direction];
        if (!force && deps.every((dep, index) => Object.is(dep, this.recomputeDeps[index]))) {
            return;
        }
        this.recomputeDeps = deps;
        queueMicrotask(() => this.computeThumbPosition());
    }

    /**
     * Measures the viewport and positions the thumbs.
     */
    computeThumbPosition = () => {
        const viewportEl = this.viewport;
        const scrollbarYEl = this.scrollbarY;
        const scrollbarXEl = this.scrollbarX;
        const thumbYEl = this.thumbY;
        const thumbXEl = this.thumbX;
        const cornerEl = this.corner;
        const direction = this.direction;

        if (!viewportEl) {
            return;
        }

        const scrollableContentHeight = viewportEl.scrollHeight;
        const scrollableContentWidth = viewportEl.scrollWidth;
        const viewportHeight = viewportEl.clientHeight;
        const viewportWidth = viewportEl.clientWidth;
        const scrollTop = viewportEl.scrollTop;
        const scrollLeft = viewportEl.scrollLeft;

        if (scrollableContentHeight === 0 || scrollableContentWidth === 0) {
            return;
        }

        const scrollbarYHidden = viewportHeight >= scrollableContentHeight;
        const scrollbarXHidden = viewportWidth >= scrollableContentWidth;
        const ratioX = viewportWidth / scrollableContentWidth;
        const ratioY = viewportHeight / scrollableContentHeight;
        const maxScrollLeft = Math.max(0, scrollableContentWidth - viewportWidth);
        const maxScrollTop = Math.max(0, scrollableContentHeight - viewportHeight);

        let scrollLeftFromStart = 0;
        let scrollLeftFromEnd = 0;
        if (!scrollbarXHidden) {
            const rawScrollLeftFromStart = direction === 'rtl' ? clamp(-scrollLeft, 0, maxScrollLeft) : clamp(scrollLeft, 0, maxScrollLeft);
            scrollLeftFromStart = normalizeScrollOffset(rawScrollLeftFromStart, maxScrollLeft);
            scrollLeftFromEnd = maxScrollLeft - scrollLeftFromStart;
        }

        const rawScrollTopFromStart = scrollbarYHidden ? 0 : clamp(scrollTop, 0, maxScrollTop);
        const scrollTopFromStart = scrollbarYHidden ? 0 : normalizeScrollOffset(rawScrollTopFromStart, maxScrollTop);
        const scrollTopFromEnd = scrollbarYHidden ? 0 : maxScrollTop - scrollTopFromStart;

        const nextWidth = scrollbarXHidden ? 0 : viewportWidth;
        const nextHeight = scrollbarYHidden ? 0 : viewportHeight;

        let nextCornerWidth = 0;
        let nextCornerHeight = 0;
        if (!(scrollbarXHidden || scrollbarYHidden)) {
            nextCornerWidth = scrollbarYEl?.offsetWidth || 0;
            nextCornerHeight = scrollbarXEl?.offsetHeight || 0;
        }

        // Only subtract corner size from scrollbar dimensions if the corner hasn't been sized yet.
        const { cornerSize } = this.store.state;
        const cornerNotYetSized = cornerSize.width === 0 && cornerSize.height === 0;
        const cornerWidthOffset = cornerNotYetSized ? nextCornerWidth : 0;
        const cornerHeightOffset = cornerNotYetSized ? nextCornerHeight : 0;

        const scrollbarXOffset = getOffset(scrollbarXEl, 'padding', 'x');
        const scrollbarYOffset = getOffset(scrollbarYEl, 'padding', 'y');
        const thumbXOffset = getOffset(thumbXEl, 'margin', 'x');
        const thumbYOffset = getOffset(thumbYEl, 'margin', 'y');

        const idealNextWidth = nextWidth - scrollbarXOffset - thumbXOffset;
        const idealNextHeight = nextHeight - scrollbarYOffset - thumbYOffset;

        const maxNextWidth = scrollbarXEl ? Math.min(scrollbarXEl.offsetWidth - cornerWidthOffset, idealNextWidth) : idealNextWidth;
        const maxNextHeight = scrollbarYEl ? Math.min(scrollbarYEl.offsetHeight - cornerHeightOffset, idealNextHeight) : idealNextHeight;

        const clampedNextWidth = Math.max(MIN_THUMB_SIZE, maxNextWidth * ratioX);
        const clampedNextHeight = Math.max(MIN_THUMB_SIZE, maxNextHeight * ratioY);

        const prevThumbSize = this.store.state.thumbSize;
        if (prevThumbSize.height !== clampedNextHeight || prevThumbSize.width !== clampedNextWidth) {
            this.store.set('thumbSize', { width: clampedNextWidth, height: clampedNextHeight });
        }

        // Handle Y (vertical) scroll
        if (scrollbarYEl && thumbYEl) {
            const maxThumbOffsetY = scrollbarYEl.offsetHeight - clampedNextHeight - scrollbarYOffset - thumbYOffset;
            const scrollRangeY = scrollableContentHeight - viewportHeight;
            const scrollRatioY = scrollRangeY === 0 ? 0 : scrollTop / scrollRangeY;
            // In Safari, don't allow it to go negative or too far as `scrollTop` considers the rubber band effect.
            const thumbOffsetY = Math.min(maxThumbOffsetY, Math.max(0, scrollRatioY * maxThumbOffsetY));
            thumbYEl.style.transform = `translate3d(0,${thumbOffsetY}px,0)`;
        }

        // Handle X (horizontal) scroll
        if (scrollbarXEl && thumbXEl) {
            const maxThumbOffsetX = scrollbarXEl.offsetWidth - clampedNextWidth - scrollbarXOffset - thumbXOffset;
            const scrollRangeX = scrollableContentWidth - viewportWidth;
            const scrollRatioX = scrollRangeX === 0 ? 0 : scrollLeft / scrollRangeX;
            const thumbOffsetX =
                direction === 'rtl'
                    ? clamp(scrollRatioX * maxThumbOffsetX, -maxThumbOffsetX, 0)
                    : clamp(scrollRatioX * maxThumbOffsetX, 0, maxThumbOffsetX);
            thumbXEl.style.transform = `translate3d(${thumbOffsetX}px,0,0)`;
        }

        const overflowMetricsPx: [ScrollAreaViewportCssVars, number][] = [
            [ScrollAreaViewportCssVars.scrollAreaOverflowXStart, scrollLeftFromStart],
            [ScrollAreaViewportCssVars.scrollAreaOverflowXEnd, scrollLeftFromEnd],
            [ScrollAreaViewportCssVars.scrollAreaOverflowYStart, scrollTopFromStart],
            [ScrollAreaViewportCssVars.scrollAreaOverflowYEnd, scrollTopFromEnd]
        ];
        for (const [cssVar, value] of overflowMetricsPx) {
            viewportEl.style.setProperty(cssVar, `${value}px`);
        }

        if (cornerEl) {
            const nextCornerSize =
                scrollbarXHidden || scrollbarYHidden ? { width: 0, height: 0 } : { width: nextCornerWidth, height: nextCornerHeight };
            if (cornerSize.width !== nextCornerSize.width || cornerSize.height !== nextCornerSize.height) {
                this.store.set('cornerSize', nextCornerSize);
            }
        }

        const prevHidden = this.store.state.hiddenState;
        const cornerHidden = scrollbarYHidden || scrollbarXHidden;
        if (prevHidden.y !== scrollbarYHidden || prevHidden.x !== scrollbarXHidden || prevHidden.corner !== cornerHidden) {
            this.store.set('hiddenState', { y: scrollbarYHidden, x: scrollbarXHidden, corner: cornerHidden });
        }

        const threshold = this.overflowEdgeThreshold;
        const nextOverflowEdges = {
            xStart: !scrollbarXHidden && scrollLeftFromStart > threshold.xStart,
            xEnd: !scrollbarXHidden && scrollLeftFromEnd > threshold.xEnd,
            yStart: !scrollbarYHidden && scrollTopFromStart > threshold.yStart,
            yEnd: !scrollbarYHidden && scrollTopFromEnd > threshold.yEnd
        };

        const prev = this.store.state.overflowEdges;
        if (
            prev.xStart !== nextOverflowEdges.xStart ||
            prev.xEnd !== nextOverflowEdges.xEnd ||
            prev.yStart !== nextOverflowEdges.yStart ||
            prev.yEnd !== nextOverflowEdges.yEnd
        ) {
            this.store.set('overflowEdges', nextOverflowEdges);
        }
    };
}

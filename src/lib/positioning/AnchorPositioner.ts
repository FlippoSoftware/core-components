import { autoUpdate, computePosition, flip, limitShift, offset, shift, size } from '@floating-ui/dom';
import { getAlignment, getSide, getSideAxis } from '@floating-ui/utils';
import { isElement } from '@floating-ui/utils/dom';

import type {
    AutoUpdateOptions,
    Middleware,
    MiddlewareData,
    MiddlewareState,
    Padding,
    Side as PhysicalSide,
    Placement,
    Strategy,
    VirtualElement
} from '@floating-ui/dom';
import type { Rect } from '@floating-ui/utils';

import { whenConnected } from '~@dom/whenConnected';
import { ownerDocument, ownerWindow } from '~@lib/owner';
import { DEFAULT_SIDES } from '~@packages/floating-ui/middleware/adaptiveOriginMiddleware';
import { arrow } from '~@packages/floating-ui/middleware/arrow';
import { hide } from '~@packages/floating-ui/middleware/hideMiddleware';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { Store } from '~@store/Store';

import type { Align, MutableRef, Side, Style } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { ReferenceType } from '~@packages/floating-ui/types';

export type Boundary = 'clipping-ancestors' | Element | Element[] | Rect;

export type OffsetFunction = (data: {
    side: Side;
    align: Align;
    anchor: { width: number; height: number };
    positioner: { width: number; height: number };
}) => number;

type SideFlipMode = {
    /**
     * How to avoid collisions on the side axis.
     */
    side?: 'flip' | 'none' | undefined;
    /**
     * How to avoid collisions on the align axis.
     */
    align?: 'flip' | 'shift' | 'none' | undefined;
    /**
     * If both sides on the preferred axis do not fit, determines whether to fallback
     * to a side on the perpendicular axis and which logical side to prefer.
     */
    fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
};

type SideShiftMode = {
    side?: 'shift' | 'none' | undefined;
    align?: 'shift' | 'none' | undefined;
    fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
};

export type CollisionAvoidance = SideFlipMode | SideShiftMode;

export type Anchor = Element | null | VirtualElement | MutableRef<Element | null> | (() => Element | VirtualElement | null);

/**
 * Public positioning parameters shared by all positioners.
 */
export type AnchorPositioningSharedOptions = {
    /**
     * An element to position the popup against. Defaults to the trigger.
     */
    anchor?: Anchor | undefined;
    /**
     * @default 'absolute'
     */
    positionMethod?: Strategy | undefined;
    /**
     * @default 'bottom'
     */
    side?: Side | undefined;
    /**
     * @default 0
     */
    sideOffset?: number | OffsetFunction | undefined;
    /**
     * @default 'center'
     */
    align?: Align | undefined;
    /**
     * @default 0
     */
    alignOffset?: number | OffsetFunction | undefined;
    /**
     * @default 'clipping-ancestors'
     */
    collisionBoundary?: Boundary | undefined;
    /**
     * @default 5
     */
    collisionPadding?: Padding | undefined;
    /**
     * @default false
     */
    sticky?: boolean | undefined;
    /**
     * @default 5
     */
    arrowPadding?: number | undefined;
    /**
     * @default false
     */
    disableAnchorTracking?: boolean | undefined;
    collisionAvoidance?: CollisionAvoidance | undefined;
};

export type AnchorPositionerOptions = AnchorPositioningSharedOptions & {
    /**
     * Whether the popup is mounted (rendered).
     */
    mounted: boolean;
    keepMounted?: boolean | undefined;
    collisionAvoidance: CollisionAvoidance;
    shiftCrossAxis?: boolean | undefined;
    adaptiveOrigin?: Middleware | undefined;
    /**
     * Locks the flip so the popup flips back lazily (for lists that change size while typing).
     * @default false
     */
    lazyFlip?: boolean | undefined;
    /**
     * Text direction.
     * @default 'ltr'
     */
    direction?: 'ltr' | 'rtl' | undefined;
};

export type AnchorPositionState = {
    x: number;
    y: number;
    strategy: Strategy;
    placement: Placement;
    middlewareData: MiddlewareData;
    isPositioned: boolean;
    /**
     * Side locked by `lazyFlip`.
     */
    mountSide: PhysicalSide | null;
};

function getLogicalSide(sideParam: Side, renderedSide: PhysicalSide, isRtl: boolean): Side {
    const isLogicalSideParam = sideParam === 'inline-start' || sideParam === 'inline-end';
    const logicalRight = isRtl ? 'inline-start' : 'inline-end';
    const logicalLeft = isRtl ? 'inline-end' : 'inline-start';
    return (
        {
            top: 'top',
            right: isLogicalSideParam ? logicalRight : 'right',
            bottom: 'bottom',
            left: isLogicalSideParam ? logicalLeft : 'left'
        } satisfies Record<PhysicalSide, Side>
    )[renderedSide];
}

function getOffsetData(state: MiddlewareState, sideParam: Side, isRtl: boolean) {
    const { rects, placement } = state;
    return {
        side: getLogicalSide(sideParam, getSide(placement), isRtl),
        align: getAlignment(placement) || 'center',
        anchor: { width: rects.reference.width, height: rects.reference.height },
        positioner: { width: rects.floating.width, height: rects.floating.height }
    } as const;
}

function getDPR(element: Element) {
    if (typeof window === 'undefined') {
        return 1;
    }
    const win = element.ownerDocument.defaultView || window;
    return win.devicePixelRatio || 1;
}

function roundByDPR(element: Element, value: number) {
    const dpr = getDPR(element);
    return Math.round(value * dpr) / dpr;
}

function isRef(param: Anchor | undefined): param is MutableRef<Element | null> {
    return param != null && typeof param === 'object' && 'current' in param;
}

/**
 * Wraps a DOM element into a virtual element, like `refs.setPositionReference` of `useFloating`.
 */
function toPositionReference(node: ReferenceType | null): ReferenceType | null {
    return isElement(node)
        ? ({
              getBoundingClientRect: () => node.getBoundingClientRect(),
              getClientRects: () => node.getClientRects(),
              contextElement: node
          } satisfies VirtualElement)
        : node;
}

/**
 * Anchor positioning of a floating element on top of `@floating-ui/dom`: computes the position,
 * keeps it up to date (`autoUpdate`), sets the `--available-*`, `--anchor-*` and `--transform-origin`
 * CSS variables, and exposes the rendered side/alignment, arrow position and styles.
 * Replacement for `useAnchorPositioning` + `@floating-ui/react-dom`.
 */
export class AnchorPositioner {
    readonly store: Store<AnchorPositionState>;

    private options: AnchorPositionerOptions;

    private readonly root: FloatingRootStore;

    private arrowElement: Element | null = null;

    private registeredPositionReference: ReferenceType | null = null;

    private readonly autoUpdateEffect: Effect;

    private readonly mountedEffect: Effect;

    private readonly unsubscribeRoot: () => void;

    private updateId = 0;

    private destroyed = false;

    constructor(root: FloatingRootStore, options: AnchorPositionerOptions) {
        this.root = root;
        this.options = options;
        this.store = new Store<AnchorPositionState>({
            x: 0,
            y: 0,
            strategy: options.positionMethod ?? 'absolute',
            placement: 'bottom',
            middlewareData: {},
            isPositioned: false,
            mountSide: null
        });
        // Like `useFloating`, report the requested placement until the first position is computed.
        this.store.set('placement', this.getPlacement());
        this.autoUpdateEffect = new Effect(() => this.attachAutoUpdate());
        this.mountedEffect = new Effect(() => this.clearElementsWhenUnmounted());
        this.unsubscribeRoot = root.subscribe(() => this.sync());
        this.sync();
    }

    setOptions(options: AnchorPositionerOptions) {
        this.options = options;
        if (!options.mounted && this.store.state.mountSide !== null) {
            this.store.set('mountSide', null);
        }
        if (!this.store.state.isPositioned) {
            this.store.set('placement', this.getPlacement());
        }
        this.sync();
    }

    /**
     * Ref callback for the arrow element.
     */
    setArrow = (element: Element | null) => {
        this.arrowElement = element;
    };

    get arrowRef(): MutableRef<Element | null> {
        const self = this;
        return {
            get current() {
                return self.arrowElement;
            },
            set current(value) {
                self.arrowElement = value;
            }
        };
    }

    /**
     * Recomputes the position.
     */
    update = () => {
        const reference = this.root.select('referenceElement');
        const floating = this.root.select('floatingElement');
        if (!reference || !floating) {
            return;
        }

        const updateId = ++this.updateId;
        const placement = this.getPlacement();

        computePosition(reference, floating, {
            placement,
            strategy: this.options.positionMethod ?? 'absolute',
            middleware: this.createMiddleware()
        }).then((data) => {
            if (this.destroyed || updateId !== this.updateId) {
                return;
            }
            this.store.update({
                x: data.x,
                y: data.y,
                strategy: data.strategy,
                placement: data.placement,
                middlewareData: data.middlewareData,
                isPositioned: true
            });
            this.applyLazyFlip();
        });
    };

    destroy() {
        this.destroyed = true;
        this.unsubscribeRoot();
        this.autoUpdateEffect.destroy();
        this.mountedEffect.destroy();
    }

    // ---- derived values ---------------------------------------------------------------

    get isRtl() {
        return this.options.direction === 'rtl';
    }

    /**
     * The side actually rendered (physical).
     */
    static physicalSide(state: AnchorPositionState): PhysicalSide {
        return getSide(state.placement);
    }

    /**
     * The side actually rendered, in the logical notation of the `side` option.
     */
    side(state: AnchorPositionState = this.store.state): Side {
        return getLogicalSide(this.options.side ?? 'bottom', getSide(state.placement), this.isRtl);
    }

    static align(state: AnchorPositionState): Align {
        return getAlignment(state.placement) || 'center';
    }

    static anchorHidden(state: AnchorPositionState): boolean {
        return Boolean(state.middlewareData.hide?.referenceHidden);
    }

    static arrowUncentered(state: AnchorPositionState): boolean {
        return state.middlewareData.arrow?.centerOffset !== 0;
    }

    static arrowStyles(state: AnchorPositionState): Style {
        return {
            position: 'absolute',
            top: state.middlewareData.arrow?.y,
            left: state.middlewareData.arrow?.x
        };
    }

    /**
     * Styles of the positioner element.
     */
    positionerStyles(state: AnchorPositionState = this.store.state): Style {
        const positionMethod = this.options.positionMethod ?? 'absolute';
        // Default to `fixed` when not positioned to prevent `autoFocus` scroll jumps.
        // This ensures the popup is inside the viewport initially before it gets positioned.
        const resolvedPosition = state.isPositioned ? positionMethod : 'fixed';

        let base: Style;
        if (this.options.adaptiveOrigin) {
            const { sideX, sideY } = (state.middlewareData.adaptiveOrigin as typeof DEFAULT_SIDES | undefined) || DEFAULT_SIDES;
            base = { position: resolvedPosition, [sideX]: state.x, [sideY]: state.y };
        } else {
            base = { position: resolvedPosition, ...this.floatingStyles(state) };
        }

        if (!state.isPositioned) {
            base.opacity = 0;
        }
        return base;
    }

    private floatingStyles(state: AnchorPositionState): Style {
        const floating = this.root.select('floatingElement');
        const initialStyles: Style = { position: state.strategy, left: 0, top: 0 };
        if (!floating) {
            return initialStyles;
        }

        const x = roundByDPR(floating, state.x);
        const y = roundByDPR(floating, state.y);

        return {
            ...initialStyles,
            transform: `translate(${x}px, ${y}px)`,
            ...(getDPR(floating) >= 1.5 && { willChange: 'transform' })
        };
    }

    // ---- internals --------------------------------------------------------------------

    private sync() {
        const { mounted, keepMounted = false, disableAnchorTracking = false } = this.options;
        this.mountedEffect.sync([mounted]);
        this.syncAnchor();
        this.autoUpdateEffect.sync([
            this.root.select('referenceElement'),
            this.root.select('floatingElement'),
            this.root.select('domReferenceElement'),
            keepMounted,
            mounted,
            disableAnchorTracking
        ]);
    }

    private clearElementsWhenUnmounted() {
        // Ensure positioning doesn't run initially for `keepMounted` elements that aren't initially open.
        if (!this.options.mounted) {
            this.root.update({ referenceElement: null, floatingElement: null, domReferenceElement: null });
        }
    }

    private syncAnchor() {
        const { mounted, anchor } = this.options;
        if (!mounted) {
            return;
        }

        const resolvedAnchor = typeof anchor === 'function' ? anchor() : anchor;
        const finalAnchor = (isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;

        if (finalAnchor !== this.registeredPositionReference) {
            this.registeredPositionReference = finalAnchor;
            this.root.set('positionReference', toPositionReference(finalAnchor));
        }
    }

    private attachAutoUpdate() {
        const { keepMounted = false, mounted, disableAnchorTracking = false } = this.options;
        const reference = this.root.select('referenceElement');
        const floating = this.root.select('floatingElement');

        if (!reference || !floating || (keepMounted && !mounted)) {
            return;
        }

        const autoUpdateOptions: AutoUpdateOptions = {
            elementResize: !disableAnchorTracking && typeof ResizeObserver !== 'undefined',
            layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== 'undefined'
        };

        // With `keepMounted`, autoUpdate follows the DOM reference (as in the React version).
        const autoUpdateReference = keepMounted ? this.root.select('domReferenceElement') : reference;
        if (!autoUpdateReference) {
            return;
        }

        let stopAutoUpdate: (() => void) | null = null;
        const cancel = whenConnected(floating, () => {
            stopAutoUpdate = autoUpdate(autoUpdateReference, floating, this.update, autoUpdateOptions);
        });

        return () => {
            cancel();
            stopAutoUpdate?.();
        };
    }

    private applyLazyFlip() {
        const { lazyFlip = false, mounted } = this.options;
        const state = this.store.state;
        if (lazyFlip && mounted && state.isPositioned) {
            this.store.set('mountSide', getSide(state.placement));
        }
    }

    private getPhysicalSide(): PhysicalSide {
        const sideParam = this.options.side ?? 'bottom';
        const isRtl = this.isRtl;
        return (
            this.store.state.mountSide ||
            (
                {
                    top: 'top',
                    right: 'right',
                    bottom: 'bottom',
                    left: 'left',
                    'inline-end': isRtl ? 'left' : 'right',
                    'inline-start': isRtl ? 'right' : 'left'
                } satisfies Record<Side, PhysicalSide>
            )[sideParam]
        );
    }

    private getPlacement(): Placement {
        const align = this.options.align ?? 'center';
        const side = this.getPhysicalSide();
        return align === 'center' ? side : (`${side}-${align}` as Placement);
    }

    private createMiddleware(): Middleware[] {
        const {
            side: sideParam = 'bottom',
            sideOffset = 0,
            align = 'center',
            alignOffset = 0,
            collisionBoundary,
            collisionPadding: collisionPaddingParam = 5,
            sticky = false,
            arrowPadding = 5,
            collisionAvoidance,
            shiftCrossAxis = false,
            adaptiveOrigin
        } = this.options;
        const isRtl = this.isRtl;

        const collisionAvoidanceSide = collisionAvoidance.side || 'flip';
        const collisionAvoidanceAlign = collisionAvoidance.align || 'flip';
        const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || 'end';

        // Create a bias to the preferred side.
        // On iOS, when the mobile software keyboard opens, the input is exactly centered
        // in the viewport, but this can cause it to flip to the top undesirably.
        const bias = 1;
        const biasTop = sideParam === 'bottom' ? bias : 0;
        const biasBottom = sideParam === 'top' ? bias : 0;
        const biasLeft = sideParam === 'right' ? bias : 0;
        const biasRight = sideParam === 'left' ? bias : 0;

        const collisionPadding =
            typeof collisionPaddingParam === 'number'
                ? {
                      top: collisionPaddingParam + biasTop,
                      right: collisionPaddingParam + biasRight,
                      bottom: collisionPaddingParam + biasBottom,
                      left: collisionPaddingParam + biasLeft
                  }
                : {
                      top: (collisionPaddingParam.top || 0) + biasTop,
                      right: (collisionPaddingParam.right || 0) + biasRight,
                      bottom: (collisionPaddingParam.bottom || 0) + biasBottom,
                      left: (collisionPaddingParam.left || 0) + biasLeft
                  };

        const commonCollisionProps = {
            boundary: collisionBoundary === 'clipping-ancestors' ? 'clippingAncestors' : collisionBoundary,
            padding: collisionPadding
        } as const;

        const middleware: (Middleware | null | false | undefined)[] = [
            offset((state) => {
                const data = getOffsetData(state, sideParam, isRtl);
                const sideAxis = typeof sideOffset === 'function' ? sideOffset(data) : sideOffset;
                const alignAxis = typeof alignOffset === 'function' ? alignOffset(data) : alignOffset;
                return { mainAxis: sideAxis, crossAxis: alignAxis, alignmentAxis: alignAxis };
            })
        ];

        const shiftDisabled = collisionAvoidanceAlign === 'none' && collisionAvoidanceSide !== 'shift';
        const crossAxisShiftEnabled = !shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === 'shift');

        const flipMiddleware =
            collisionAvoidanceSide === 'none'
                ? null
                : flip({
                      ...commonCollisionProps,
                      // Ensure the popup flips if it's been limited by its --available-height and it resizes.
                      // Since the size() padding is smaller than the flip() padding, flip() will take precedence.
                      padding: {
                          top: collisionPadding.top + bias,
                          right: collisionPadding.right + bias,
                          bottom: collisionPadding.bottom + bias,
                          left: collisionPadding.left + bias
                      },
                      mainAxis: !shiftCrossAxis && collisionAvoidanceSide === 'flip',
                      crossAxis: collisionAvoidanceAlign === 'flip' ? 'alignment' : false,
                      fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide
                  });

        const shiftMiddleware = shiftDisabled
            ? null
            : shift((data) => {
                  const html = ownerDocument(data.elements.floating).documentElement;
                  return {
                      ...commonCollisionProps,
                      // Use the Layout Viewport to avoid shifting around when pinch-zooming for context menus.
                      rootBoundary: shiftCrossAxis ? { x: 0, y: 0, width: html.clientWidth, height: html.clientHeight } : undefined,
                      mainAxis: collisionAvoidanceAlign !== 'none',
                      crossAxis: crossAxisShiftEnabled,
                      limiter:
                          sticky || shiftCrossAxis
                              ? undefined
                              : limitShift((limitData) => {
                                    if (!this.arrowElement) {
                                        return {};
                                    }
                                    const { width, height } = this.arrowElement.getBoundingClientRect();
                                    const sideAxis = getSideAxis(getSide(limitData.placement));
                                    const arrowSize = sideAxis === 'y' ? width : height;
                                    const offsetAmount =
                                        sideAxis === 'y'
                                            ? collisionPadding.left + collisionPadding.right
                                            : collisionPadding.top + collisionPadding.bottom;
                                    return { offset: arrowSize / 2 + offsetAmount / 2 };
                                })
                  };
              });

        // https://floating-ui.com/docs/flip#combining-with-shift
        if (collisionAvoidanceSide === 'shift' || collisionAvoidanceAlign === 'shift' || align === 'center') {
            middleware.push(shiftMiddleware, flipMiddleware);
        } else {
            middleware.push(flipMiddleware, shiftMiddleware);
        }

        middleware.push(
            size({
                ...commonCollisionProps,
                apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
                    const floatingStyle = floating.style;
                    floatingStyle.setProperty('--available-width', `${availableWidth}px`);
                    floatingStyle.setProperty('--available-height', `${availableHeight}px`);

                    // Snap anchor dimensions to device pixels to ensure the popup's visual width matches the anchor's one.
                    const dpr = ownerWindow(floating).devicePixelRatio || 1;
                    const { x, y, width, height } = rects.reference;
                    const anchorWidth = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
                    const anchorHeight = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;

                    floatingStyle.setProperty('--anchor-width', `${anchorWidth}px`);
                    floatingStyle.setProperty('--anchor-height', `${anchorHeight}px`);
                }
            }),
            arrow(() => ({
                // `transform-origin` calculations rely on an element existing. If the arrow hasn't been set,
                // we'll create a fake element.
                element: this.arrowElement || ownerDocument(this.root.select('floatingElement')).createElement('div'),
                padding: arrowPadding,
                offsetParent: 'floating'
            })),
            {
                name: 'transformOrigin',
                fn: (state) => {
                    const { elements, middlewareData, placement: renderedPlacement, rects, y } = state;

                    const currentRenderedSide = getSide(renderedPlacement);
                    const currentRenderedAxis = getSideAxis(currentRenderedSide);
                    const arrowEl = this.arrowElement;
                    const arrowX = middlewareData.arrow?.x || 0;
                    const arrowY = middlewareData.arrow?.y || 0;
                    const arrowWidth = arrowEl?.clientWidth || 0;
                    const arrowHeight = arrowEl?.clientHeight || 0;
                    const transformX = arrowX + arrowWidth / 2;
                    const transformY = arrowY + arrowHeight / 2;
                    const shiftY = Math.abs(middlewareData.shift?.y || 0);
                    const halfAnchorHeight = rects.reference.height / 2;
                    const sideOffsetValue =
                        typeof sideOffset === 'function' ? sideOffset(getOffsetData(state, sideParam, isRtl)) : sideOffset;
                    const isOverlappingAnchor = shiftY > sideOffsetValue;

                    const adjacentTransformOrigin = {
                        top: `${transformX}px calc(100% + ${sideOffsetValue}px)`,
                        bottom: `${transformX}px ${-sideOffsetValue}px`,
                        left: `calc(100% + ${sideOffsetValue}px) ${transformY}px`,
                        right: `${-sideOffsetValue}px ${transformY}px`
                    }[currentRenderedSide];
                    const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y}px`;

                    elements.floating.style.setProperty(
                        '--transform-origin',
                        crossAxisShiftEnabled && currentRenderedAxis === 'y' && isOverlappingAnchor
                            ? overlapTransformOrigin
                            : adjacentTransformOrigin
                    );

                    return {};
                }
            },
            hide,
            adaptiveOrigin
        );

        return middleware.filter((item): item is Middleware => Boolean(item));
    }
}

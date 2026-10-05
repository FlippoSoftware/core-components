import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { runOnceAnimationsFinish } from '~@dom/animations';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { warn } from '~@lib/warn';
import { Effect } from '~@packages/floating-ui/utils/Effect';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';
import { AnimationFrame } from '~@timers/AnimationFrame';

import type { ButtonMachine } from '~@components/button/root/ButtonMachine';
import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { Style, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import { CollapsiblePanelCssVars } from '../panel/CollapsiblePanelCssVars';
import { CollapsiblePanelDataAttributes } from '../panel/CollapsiblePanelDataAttributes';
import { collapsibleTriggerStateAttributesMapping } from '../trigger/collapsibleTriggerStateAttributesMapping';

import { collapsibleStateAttributesMapping } from './collapsibleStateAttributesMapping';

export type CollapsibleAnimationType = 'css-transition' | 'css-animation' | 'none' | null;

export type CollapsibleChangeEventReason = typeof REASONS.triggerPress | typeof REASONS.none;

export type CollapsibleChangeEventDetails = ChangeEventDetails<CollapsibleChangeEventReason>;

export type CollapsibleState = {
    open: boolean;
    disabled: boolean;
    transitionStatus: TransitionStatus;
};

export type CollapsibleOptions = {
    open?: boolean | undefined;
    /**
     * @default false
     */
    defaultOpen?: boolean | undefined;
    onOpenChange?: ((open: boolean, eventDetails: CollapsibleChangeEventDetails) => void) | undefined;
    /**
     * @default false
     */
    disabled?: boolean | undefined;
    /**
     * Generated id of the panel.
     */
    defaultPanelId: string;
};

export type CollapsiblePanelOptions = {
    id?: string | undefined;
    /**
     * @default false
     */
    hiddenUntilFound?: boolean | undefined;
    /**
     * @default false
     */
    keepMounted?: boolean | undefined;
};

type CollapsibleInternalState = {
    open: boolean;
    visible: boolean;
    height: number | undefined;
    width: number | undefined;
    panelIdState: string | undefined;
    hiddenUntilFound: boolean;
    keepMounted: boolean;
};

const ACCORDION_ORIENTATION_ATTRIBUTE = 'data-orientation';

/**
 * State machine of a collapsible (also each Accordion item): open state, mount/transition status
 * and the panel's measured dimensions for height/width animations.
 * Replacement for `useCollapsibleRoot` + `useCollapsiblePanel`.
 */
export class CollapsibleMachine {
    readonly store: Store<CollapsibleInternalState>;

    readonly transitions: TransitionStatusController;

    private options: CollapsibleOptions;

    private panel: HTMLElement | null = null;

    private animationType: CollapsibleAnimationType = null;

    private transitionDimension: 'width' | 'height' | null = null;

    private abortController: AbortController | null = null;

    private isBeforeMatch = false;

    private latestAnimationName: string | null = null;

    private shouldCancelInitialOpenAnimation: boolean;

    private shouldCancelInitialOpenTransition: boolean;

    private readonly animationFrame = new AnimationFrame();

    private readonly transitionEffect: Effect;

    private readonly animationEffect: Effect;

    private readonly hiddenUntilFoundEffect: Effect;

    private readonly beforeMatchEffect: Effect;

    private readonly openCompleteEffect: Effect;

    private readonly controlledUnmountEffect: Effect;

    private panelRefCleanup: (() => void) | null = null;

    private readonly mountFrame: number;

    private readonly unsubscribers: (() => void)[] = [];

    constructor(options: CollapsibleOptions) {
        this.options = options;
        const open = options.open ?? Boolean(options.defaultOpen);
        this.store = new Store<CollapsibleInternalState>({
            open: Boolean(options.defaultOpen),
            visible: open,
            height: undefined,
            width: undefined,
            panelIdState: undefined,
            hiddenUntilFound: false,
            keepMounted: false
        });
        this.transitions = new TransitionStatusController(open, { enableIdleState: true, deferEndingState: true });
        this.shouldCancelInitialOpenAnimation = open;
        this.shouldCancelInitialOpenTransition = open;

        this.transitionEffect = new Effect(() => this.cssTransitionEffect());
        this.animationEffect = new Effect(() => this.cssAnimationEffect());
        this.hiddenUntilFoundEffect = new Effect(() => this.beforeMatchOpenEffect());
        this.beforeMatchEffect = new Effect(() => this.attachBeforeMatch());
        this.openCompleteEffect = new Effect(() => this.openChangeCompleteEffect());
        this.controlledUnmountEffect = new Effect(() => {
            if (this.isControlled && this.animationType === 'none' && !this.store.state.keepMounted && !this.open) {
                this.transitions.setMounted(false);
            }
        });

        this.mountFrame = AnimationFrame.request(() => {
            this.shouldCancelInitialOpenAnimation = false;
        });

        this.unsubscribers.push(this.store.subscribe(() => this.sync()));
        this.unsubscribers.push(this.transitions.store.subscribe(() => this.sync()));
        this.sync();
    }

    setOptions(options: CollapsibleOptions) {
        this.options = options;
        this.transitions.setOpen(this.open);
        this.sync();
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        AnimationFrame.cancel(this.mountFrame);
        this.transitions.destroy();
        this.transitionEffect.destroy();
        this.animationEffect.destroy();
        this.hiddenUntilFoundEffect.destroy();
        this.beforeMatchEffect.destroy();
        this.openCompleteEffect.destroy();
        this.controlledUnmountEffect.destroy();
        this.panelRefCleanup?.();
        this.animationFrame.cancel();
    }

    // ---- state ------------------------------------------------------------------------

    get isControlled() {
        return this.options.open !== undefined;
    }

    get open() {
        return this.options.open ?? this.store.state.open;
    }

    get disabled() {
        return this.options.disabled ?? false;
    }

    get mounted() {
        return this.transitions.state.mounted;
    }

    get transitionStatus() {
        return this.transitions.state.transitionStatus;
    }

    get panelId() {
        return this.store.state.panelIdState ?? this.options.defaultPanelId;
    }

    getState(): CollapsibleState {
        return { open: this.open, disabled: this.disabled, transitionStatus: this.transitionStatus };
    }

    static attrs(state: CollapsibleState): Record<string, string> {
        return getStyleHookProps(state, collapsibleStateAttributesMapping);
    }

    static triggerAttrs(state: CollapsibleState): Record<string, string> {
        return getStyleHookProps(state, collapsibleTriggerStateAttributesMapping);
    }

    /**
     * Sets the open state without calling `onOpenChange` (used by Accordion).
     */
    setOpen = (open: boolean) => {
        if (!this.isControlled) {
            this.store.set('open', open);
        }
        this.transitions.setOpen(this.open);
    };

    private setDimensions(dimensions: { height: number | undefined; width: number | undefined }) {
        this.store.update(dimensions);
    }

    private setMounted(mounted: boolean) {
        this.transitions.setMounted(mounted);
    }

    // ---- trigger ----------------------------------------------------------------------

    /**
     * Toggles the collapsible (trigger click handler).
     */
    handleTrigger = (event: Event) => {
        const nextOpen = !this.open;
        const eventDetails = createChangeEventDetails(REASONS.triggerPress, getNativeEvent(event) as MouseEvent);

        this.options.onOpenChange?.(nextOpen, eventDetails);

        if (eventDetails.isCanceled) {
            return;
        }

        const panel = this.panel;
        const { hiddenUntilFound, keepMounted, visible } = this.store.state;

        if (this.animationType === 'css-animation' && panel != null) {
            panel.style.removeProperty('animation-name');
        }

        if (!hiddenUntilFound && !keepMounted) {
            if (this.animationType != null && this.animationType !== 'css-animation' && !this.mounted && nextOpen) {
                this.setMounted(true);
            }

            if (this.animationType === 'css-animation') {
                if (!visible && nextOpen) {
                    this.store.set('visible', true);
                }
                if (!this.mounted && nextOpen) {
                    this.setMounted(true);
                }
            }
        }

        this.setOpen(nextOpen);

        if (this.animationType === 'none' && this.mounted && !nextOpen) {
            this.setMounted(false);
        }
    };

    /**
     * Props of a trigger (merged with a button machine and the user's props).
     */
    getTriggerProps(button: ButtonMachine, elementProps: Props = {}, disabled = this.disabled): Props {
        const open = this.open;
        return button.getButtonProps(
            mergeProps(
                {
                    'aria-controls': open ? this.panelId : undefined,
                    'aria-expanded': open,
                    disabled,
                    onClick: this.handleTrigger
                },
                elementProps
            )
        );
    }

    // ---- panel ------------------------------------------------------------------------

    /**
     * Applies the panel part options (id, `hiddenUntilFound`, `keepMounted`).
     */
    setPanelOptions(options: CollapsiblePanelOptions) {
        const { id, hiddenUntilFound = false, keepMounted = false } = options;

        if (process.env.NODE_ENV !== 'production' && options.hiddenUntilFound && options.keepMounted === false) {
            warn(
                'The `keepMounted={false}` prop on a Collapsible will be ignored when using `hiddenUntilFound` since it requires the Panel to remain mounted even when closed.'
            );
        }

        this.store.update({ panelIdState: id, hiddenUntilFound, keepMounted });
    }

    /**
     * Ref callback of the panel element.
     */
    setPanel = (element: HTMLElement | null) => {
        this.panelRefCleanup?.();
        this.panelRefCleanup = null;
        this.panel = element;
        if (element) {
            this.panelRefCleanup = this.handlePanelRef(element) ?? null;
        }
        this.sync();
    };

    /**
     * Whether the panel element is hidden.
     */
    get hidden() {
        if (this.animationType === 'css-animation') {
            return !this.store.state.visible;
        }
        return !this.open && !this.mounted;
    }

    /**
     * Whether the panel should be rendered.
     */
    shouldRenderPanel() {
        const { keepMounted, hiddenUntilFound } = this.store.state;
        return keepMounted || hiddenUntilFound || this.mounted;
    }

    getPanelProps(): Props {
        const { height, width } = this.store.state;
        return {
            hidden: this.hidden,
            id: this.panelId,
            style: {
                [CollapsiblePanelCssVars.collapsiblePanelHeight]: height === undefined ? 'auto' : `${height}px`,
                [CollapsiblePanelCssVars.collapsiblePanelWidth]: width === undefined ? 'auto' : `${width}px`
            } satisfies Style
        };
    }

    private handlePanelRef(element: HTMLElement): (() => void) | undefined {
        if (this.animationType == null || this.transitionDimension == null) {
            const panelStyles = getComputedStyle(element);
            const hasAnimation = panelStyles.animationName !== 'none' && panelStyles.animationName !== '';
            const hasTransition = panelStyles.transitionDuration !== '0s' && panelStyles.transitionDuration !== '';

            if (hasAnimation && hasTransition) {
                if (process.env.NODE_ENV !== 'production') {
                    warn(
                        'CSS transitions and CSS animations both detected on Collapsible or Accordion panel.',
                        'Only one of either animation type should be used.'
                    );
                }
            } else if (panelStyles.animationName === 'none' && panelStyles.transitionDuration !== '0s') {
                this.animationType = 'css-transition';
            } else if (panelStyles.animationName !== 'none' && panelStyles.transitionDuration === '0s') {
                this.animationType = 'css-animation';
            } else {
                this.animationType = 'none';
            }

            this.transitionDimension =
                element.getAttribute(ACCORDION_ORIENTATION_ATTRIBUTE) === 'horizontal' || panelStyles.transitionProperty.includes('width')
                    ? 'width'
                    : 'height';
        }

        if (this.animationType !== 'css-transition') {
            return undefined;
        }

        const { height, width } = this.store.state;
        if (height === undefined || width === undefined) {
            this.setDimensions({ height: element.scrollHeight, width: element.scrollWidth });
            if (this.shouldCancelInitialOpenTransition) {
                element.style.setProperty('transition-duration', '0s');
            }
        }

        let nextFrame = -1;
        const frame = AnimationFrame.request(() => {
            this.shouldCancelInitialOpenTransition = false;
            nextFrame = AnimationFrame.request(() => {
                setTimeout(() => {
                    element.style.removeProperty('transition-duration');
                });
            });
        });

        return () => {
            AnimationFrame.cancel(frame);
            AnimationFrame.cancel(nextFrame);
        };
    }

    private sync() {
        const { keepMounted, hiddenUntilFound, visible } = this.store.state;
        const open = this.open;
        const mounted = this.mounted;

        this.controlledUnmountEffect.sync([this.isControlled, keepMounted, open]);
        this.transitionEffect.sync([this.panel, hiddenUntilFound, keepMounted, mounted, open]);
        this.animationEffect.sync([this.panel, open, visible]);
        this.hiddenUntilFoundEffect.sync([this.panel, hiddenUntilFound, open]);
        this.applyHiddenUntilFound();
        this.beforeMatchEffect.sync([this.panel]);
        this.openCompleteEffect.sync([this.panel, open && this.transitionStatus === 'idle', open]);
    }

    private cssTransitionEffect() {
        if (this.animationType !== 'css-transition') {
            return;
        }

        const panel = this.panel;
        if (!panel) {
            return;
        }

        let resizeFrame = -1;

        if (this.abortController != null) {
            this.abortController.abort();
            this.abortController = null;
        }

        if (this.open) {
            const originalLayoutStyles = {
                'justify-content': panel.style.justifyContent,
                'align-items': panel.style.alignItems,
                'align-content': panel.style.alignContent,
                'justify-items': panel.style.justifyItems
            };

            /* opening */
            for (const key of Object.keys(originalLayoutStyles)) {
                panel.style.setProperty(key, 'initial', 'important');
            }

            if (!this.shouldCancelInitialOpenTransition && !this.store.state.keepMounted) {
                panel.setAttribute(CollapsiblePanelDataAttributes.startingStyle, '');
            }

            this.setDimensions({ height: panel.scrollHeight, width: panel.scrollWidth });

            resizeFrame = AnimationFrame.request(() => {
                for (const [key, value] of Object.entries(originalLayoutStyles)) {
                    if (value === '') {
                        panel.style.removeProperty(key);
                    } else {
                        panel.style.setProperty(key, value);
                    }
                }
            });

            return () => {
                AnimationFrame.cancel(resizeFrame);
            };
        }

        if (panel.scrollHeight === 0 && panel.scrollWidth === 0) {
            return;
        }

        /* closing */
        this.setDimensions({ height: panel.scrollHeight, width: panel.scrollWidth });

        const abortController = new AbortController();
        this.abortController = abortController;
        const signal = abortController.signal;

        const endingStyleAttribute = CollapsiblePanelDataAttributes.endingStyle;

        // Wait for `[data-ending-style]` to be applied.
        let attributeObserver: MutationObserver | null = new MutationObserver((mutationList) => {
            const hasEndingStyle = mutationList.some(
                (mutation) => mutation.type === 'attributes' && mutation.attributeName === endingStyleAttribute
            );

            if (hasEndingStyle) {
                attributeObserver?.disconnect();
                attributeObserver = null;
                runOnceAnimationsFinish(
                    panel,
                    () => {
                        this.setDimensions({ height: 0, width: 0 });
                        panel.style.removeProperty('content-visibility');
                        this.setMounted(false);
                        if (this.abortController === abortController) {
                            this.abortController = null;
                        }
                    },
                    { signal, frame: this.animationFrame }
                );
            }
        });

        attributeObserver.observe(panel, { attributes: true, attributeFilter: [endingStyleAttribute] });

        return () => {
            attributeObserver?.disconnect();
            if (this.abortController === abortController) {
                abortController.abort();
                this.abortController = null;
            }
        };
    }

    private cssAnimationEffect() {
        if (this.animationType !== 'css-animation') {
            return;
        }

        const panel = this.panel;
        if (!panel) {
            return;
        }

        this.latestAnimationName = panel.style.animationName || this.latestAnimationName;

        panel.style.setProperty('animation-name', 'none');

        this.setDimensions({ height: panel.scrollHeight, width: panel.scrollWidth });

        if (!this.shouldCancelInitialOpenAnimation && !this.isBeforeMatch) {
            panel.style.removeProperty('animation-name');
        }

        if (this.open) {
            if (this.abortController != null) {
                this.abortController.abort();
                this.abortController = null;
            }
            this.setMounted(true);
            this.store.set('visible', true);
        } else {
            const abortController = new AbortController();
            this.abortController = abortController;
            runOnceAnimationsFinish(
                panel,
                () => {
                    this.setMounted(false);
                    this.store.set('visible', false);
                    this.abortController = null;
                },
                { signal: abortController.signal, frame: this.animationFrame }
            );
        }
    }

    private beforeMatchOpenEffect() {
        const panel = this.panel;
        if (!this.store.state.hiddenUntilFound || !panel) {
            return;
        }

        let frame = -1;
        let nextFrame = -1;

        if (this.open && this.isBeforeMatch) {
            panel.style.transitionDuration = '0s';
            this.setDimensions({ height: panel.scrollHeight, width: panel.scrollWidth });
            frame = AnimationFrame.request(() => {
                this.isBeforeMatch = false;
                nextFrame = AnimationFrame.request(() => {
                    setTimeout(() => {
                        panel.style.removeProperty('transition-duration');
                    });
                });
            });
        }

        return () => {
            AnimationFrame.cancel(frame);
            AnimationFrame.cancel(nextFrame);
        };
    }

    private applyHiddenUntilFound() {
        const panel = this.panel;
        if (panel && this.store.state.hiddenUntilFound && this.hidden) {
            panel.setAttribute('hidden', 'until-found');
            if (this.animationType === 'css-transition') {
                panel.setAttribute(CollapsiblePanelDataAttributes.startingStyle, '');
            }
        }
    }

    private attachBeforeMatch() {
        const panel = this.panel;
        if (!panel) {
            return;
        }

        const handleBeforeMatch = (event: Event) => {
            this.isBeforeMatch = true;
            this.setOpen(true);
            this.options.onOpenChange?.(true, createChangeEventDetails(REASONS.none, event));
        };

        panel.addEventListener('beforematch', handleBeforeMatch);

        return () => {
            panel.removeEventListener('beforematch', handleBeforeMatch);
        };
    }

    // After the open transition completes, reset the dimensions to `auto`.
    private openChangeCompleteEffect() {
        const panel = this.panel;
        const open = this.open;
        if (!panel) {
            return;
        }

        const abortController = new AbortController();
        runOnceAnimationsFinish(
            panel,
            () => {
                if (open) {
                    this.setDimensions({ height: undefined, width: undefined });
                }
            },
            { signal: abortController.signal, waitForNextTick: open && this.transitionStatus === 'idle', treatAbortedAsFinished: false }
        );

        return () => {
            abortController.abort();
        };
    }
}

import type { Dimensions } from '@floating-ui/utils';

import { runOnceAnimationsFinish } from '~@dom/animations';
import { Store } from '~@store/Store';
import { AnimationFrame } from '~@timers/AnimationFrame';

import type { CustomStyleHookMapping } from '~@attributes/getStyleHookProps';
import type { Style } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';

import type { PopupStoreState } from './popupStoreState';
import type { AnyPopupStore } from './popupTriggers';

export enum PopupViewportCssVars {
    popupWidth = '--popup-width',
    popupHeight = '--popup-height'
}

export type PopupViewportState = {
    activationDirection: string | undefined;
    transitioning: boolean;
};

type Offset = {
    horizontal: number;
    vertical: number;
};

type ViewportInternalState = {
    previousContentNode: HTMLElement | null;
    previousContentDimensions: Dimensions | null;
    showStartingStyleAttribute: boolean;
    newTriggerOffset: Offset | null;
};

export const popupViewportStateAttributesMapping: CustomStyleHookMapping<PopupViewportState> = {
    activationDirection: (value) => (value ? { 'data-activation-direction': value } : null)
};

function getValueWithTolerance(value: number, tolerance: number, positiveLabel: string, negativeLabel: string) {
    if (value > tolerance) {
        return positiveLabel;
    }
    if (value < -tolerance) {
        return negativeLabel;
    }
    return '';
}

/**
 * Direction the popup moves in when switching triggers (e.g. `"right down"`).
 */
export function getActivationDirection(offset: Offset | null): string | undefined {
    if (!offset) {
        return undefined;
    }
    return `${getValueWithTolerance(offset.horizontal, 5, 'right', 'left')} ${getValueWithTolerance(offset.vertical, 5, 'down', 'up')}`;
}

function calculateRelativePosition(from: Element, to: Element): Offset {
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    return {
        horizontal: toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2),
        vertical: toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)
    };
}

/**
 * Content transitions of a popup viewport when the active trigger changes: the previous content is
 * captured as a DOM clone and rendered next to the new one while they animate.
 *
 * The adapter renders a "current" container (always) and a "previous" container (while
 * {@link PopupViewportController.getState} says `transitioning`), and calls
 * {@link PopupViewportController.captureContent} after every render.
 */
export class PopupViewportController<State extends PopupStoreState<unknown>> {
    readonly store = new Store<ViewportInternalState>({
        previousContentNode: null,
        previousContentDimensions: null,
        showStartingStyleAttribute: false,
        newTriggerOffset: null
    });

    private readonly popupStore: AnyPopupStore<State>;

    private currentContainer: HTMLElement | null = null;

    private previousContainer: HTMLElement | null = null;

    private capturedNode: HTMLElement | null = null;

    private previousActiveTrigger: Element | null = null;

    private lastHandledTrigger: Element | null = null;

    private floatingRoot: FloatingRootStore | null = null;

    private abortController: AbortController | null = null;

    private readonly cleanupFrame = new AnimationFrame();

    private readonly animationFrame = new AnimationFrame();

    private readonly unsubscribe: () => void;

    constructor(popupStore: AnyPopupStore<State>) {
        this.popupStore = popupStore;
        this.unsubscribe = popupStore.subscribe(() => this.sync());
        this.sync();
    }

    setCurrentContainer = (element: HTMLElement | null) => {
        this.currentContainer = element;
    };

    setPreviousContainer = (element: HTMLElement | null) => {
        this.previousContainer = element;
        this.populatePreviousContainer();
    };

    /**
     * Captures a clone of the current content. Call after every render of the viewport.
     * When a transition is in progress, the latest content is captured for the next previous snapshot.
     */
    captureContent() {
        const source = this.currentContainer;
        if (!source) {
            return;
        }
        const wrapper = source.ownerDocument.createElement('div');
        for (const child of Array.from(source.childNodes)) {
            wrapper.appendChild(child.cloneNode(true));
        }
        this.capturedNode = wrapper;
    }

    getState(): PopupViewportState {
        const { newTriggerOffset, previousContentNode } = this.store.state;
        return {
            activationDirection: getActivationDirection(newTriggerOffset),
            transitioning: previousContentNode != null
        };
    }

    getCurrentContainerProps() {
        const { previousContentNode, showStartingStyleAttribute } = this.store.state;
        return {
            'data-current': '',
            'data-starting-style': previousContentNode && showStartingStyleAttribute ? '' : undefined
        };
    }

    getPreviousContainerProps() {
        const { previousContentDimensions, showStartingStyleAttribute } = this.store.state;
        const style: Style = {
            [PopupViewportCssVars.popupWidth]: `${previousContentDimensions?.width}px`,
            [PopupViewportCssVars.popupHeight]: `${previousContentDimensions?.height}px`,
            position: 'absolute'
        };
        return {
            'data-previous': '',
            inert: true,
            style,
            'data-ending-style': showStartingStyleAttribute ? undefined : ''
        };
    }

    destroy() {
        this.unsubscribe();
        this.detachEvents();
        this.cleanupFrame.cancel();
        this.animationFrame.cancel();
        this.abortController?.abort();
    }

    private sync() {
        const floatingRoot = this.popupStore.select('floatingRootContext');
        if (floatingRoot !== this.floatingRoot) {
            this.detachEvents();
            this.floatingRoot = floatingRoot;
            floatingRoot.context.events.on('measure-layout', this.handleMeasureLayout);
            floatingRoot.context.events.on('measure-layout-complete', this.handleMeasureLayoutComplete);
        }

        const open = this.popupStore.select('open');
        const activeTrigger = open ? this.popupStore.select('activeTriggerElement') : null;
        const previousActiveTrigger = this.previousActiveTrigger;
        if (activeTrigger === previousActiveTrigger) {
            return;
        }
        this.previousActiveTrigger = activeTrigger;

        // When a trigger changes, keep the captured content so both the new and old content are rendered.
        if (activeTrigger && previousActiveTrigger && this.lastHandledTrigger !== activeTrigger && this.capturedNode) {
            this.store.update({
                previousContentNode: this.capturedNode,
                showStartingStyleAttribute: true,
                newTriggerOffset: calculateRelativePosition(previousActiveTrigger, activeTrigger)
            });
            this.populatePreviousContainer();

            this.cleanupFrame.request(() => {
                this.store.set('showStartingStyleAttribute', false);
                this.abortController?.abort();
                const abortController = new AbortController();
                this.abortController = abortController;
                runOnceAnimationsFinish(
                    this.currentContainer,
                    () => {
                        this.store.update({ previousContentNode: null, previousContentDimensions: null });
                        this.capturedNode = null;
                    },
                    { signal: abortController.signal, waitForNextTick: true, treatAbortedAsFinished: false, frame: this.animationFrame }
                );
            });
            this.lastHandledTrigger = activeTrigger;
        }
    }

    private populatePreviousContainer() {
        const container = this.previousContainer;
        const previousContentNode = this.store.state.previousContentNode;
        if (container && previousContentNode) {
            container.replaceChildren(...Array.from(previousContentNode.childNodes));
        }
    }

    private readonly handleMeasureLayout = () => {
        this.currentContainer?.style.setProperty('animation', 'none');
        this.currentContainer?.style.setProperty('transition', 'none');
        this.previousContainer?.style.setProperty('display', 'none');
    };

    private readonly handleMeasureLayoutComplete = (data: { previousDimensions: Dimensions | null }) => {
        this.currentContainer?.style.removeProperty('animation');
        this.currentContainer?.style.removeProperty('transition');
        this.previousContainer?.style.removeProperty('display');
        if (!this.store.state.previousContentDimensions) {
            this.store.set('previousContentDimensions', data.previousDimensions);
        }
    };

    private detachEvents() {
        this.floatingRoot?.context.events.off('measure-layout', this.handleMeasureLayout);
        this.floatingRoot?.context.events.off('measure-layout-complete', this.handleMeasureLayoutComplete);
    }
}

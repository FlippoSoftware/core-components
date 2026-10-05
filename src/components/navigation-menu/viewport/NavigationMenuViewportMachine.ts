import { contains } from '~@packages/floating-ui/utils/element';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { getNextTabbable, getPreviousTabbable, isOutsideEvent } from '~@packages/floating-ui/utils/tabbable';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import type { NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

type FocusLikeEvent = FocusEvent | { nativeEvent: FocusEvent; currentTarget: EventTarget | null; relatedTarget: EventTarget | null };

/**
 * State machine of `NavigationMenu.Viewport`: hosts the active content and the inside focus guards.
 */
export class NavigationMenuViewportMachine {
    private readonly root: NavigationMenuRootMachine;

    private readonly hasPositioner: boolean;

    private readonly unsubscribe: () => void;

    constructor(root: NavigationMenuRootMachine, hasPositioner: boolean) {
        this.root = root;
        this.hasPositioner = hasPositioner;
        this.unsubscribe = root.store.subscribe(() => this.sync());
        this.sync();
    }

    setElement = (element: HTMLElement | null) => {
        this.root.store.set('viewportElement', element);
    };

    /**
     * Ref callback of the inner target element (used when there is no positioner).
     */
    setTargetElement = (element: HTMLElement | null) => {
        this.root.store.set('viewportTargetElement', element);
    };

    /**
     * Whether the adapter renders the inside focus guards.
     */
    shouldRenderGuards(): boolean {
        return Boolean(this.root.store.state.floatingRootContext) || this.hasPositioner;
    }

    setBeforeInsideGuard = (element: HTMLElement | null) => {
        this.root.beforeInsideRef.current = element;
    };

    setAfterInsideGuard = (element: HTMLElement | null) => {
        this.root.afterInsideRef.current = element;
    };

    onBeforeInsideGuardFocus = (event: FocusLikeEvent) => {
        const reference = this.referenceElement;
        if (reference && isOutsideEvent(getNativeEvent(event as FocusEvent), reference)) {
            getNextTabbable(reference)?.focus();
        } else {
            this.root.beforeOutsideRef.current?.focus();
        }
    };

    onAfterInsideGuardFocus = (event: FocusLikeEvent) => {
        const reference = this.referenceElement;
        if (reference && isOutsideEvent(getNativeEvent(event as FocusEvent), reference)) {
            getPreviousTabbable(reference)?.focus();
        } else {
            this.root.afterOutsideRef.current?.focus();
        }
    };

    getViewportProps(id: string, elementProps: Props = {}): Props {
        const { root } = this;
        const domReference = root.store.state.floatingRootContext?.select('domReferenceElement') ?? null;
        return mergeProps(
            {
                id,
                onBlur: (event: FocusEvent) => {
                    const relatedTarget = event.relatedTarget as Element | null;
                    // Focus leaving the viewport (not to the trigger) makes it inert to avoid a focus loop.
                    if (relatedTarget && !contains(event.currentTarget as Element, relatedTarget) && relatedTarget !== domReference) {
                        root.store.set('viewportInert', true);
                    }
                },
                ...(!this.hasPositioner && root.store.state.viewportInert && { inert: true })
            },
            elementProps
        );
    }

    destroy() {
        this.unsubscribe();
    }

    private get referenceElement() {
        const { positionerElement, viewportElement } = this.root.store.state;
        return positionerElement || viewportElement;
    }

    private sync() {
        const domReference = this.root.store.state.floatingRootContext?.select('domReferenceElement');
        if (domReference) {
            this.root.prevTriggerElementRef.current = domReference;
        }
    }
}

import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { CompositeRootMachine } from '~@components/composite/root/CompositeRootMachine';
import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { FloatingNodeRegistration } from '~@packages/floating-ui/FloatingNodeRegistration';
import { contains, getTarget } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { TextDirection, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { NavigationMenuActivationDirection, NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

import { navigationMenuContentStateAttributesMapping } from './navigationMenuContentStateAttributesMapping';

export type NavigationMenuContentState = {
    open: boolean;
    transitionStatus: TransitionStatus;
    activationDirection: NavigationMenuActivationDirection;
};

/**
 * State machine of `NavigationMenu.Content`: rendered into the viewport while its item is active (or exiting).
 */
export class NavigationMenuContentMachine {
    readonly transitions: TransitionStatusController;

    readonly composite: CompositeRootMachine;

    readonly focusInside = new Store<{ focusInside: boolean }>({ focusInside: false });

    private readonly root: NavigationMenuRootMachine;

    private readonly itemValue: unknown;

    private element: HTMLElement | null = null;

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly node: FloatingNodeRegistration;

    private readonly unsubscribers: (() => void)[];

    constructor(root: NavigationMenuRootMachine, itemValue: unknown, direction: TextDirection = 'ltr') {
        this.root = root;
        this.itemValue = itemValue;
        this.transitions = new TransitionStatusController(this.open);
        this.composite = new CompositeRootMachine({ direction });
        const self = this;
        this.openChangeComplete = new OpenChangeComplete(
            {
                get current() {
                    return self.element;
                },
                set current(_element: HTMLElement | null) {}
            },
            () => {
                if (!this.open) {
                    this.transitions.setMounted(false);
                }
            }
        );
        this.node = new FloatingNodeRegistration(root.tree, `${root.nodeId}-content`, root.nodeId);
        this.unsubscribers = [root.store.subscribe(() => this.sync()), root.transitions.store.subscribe(() => this.sync())];
        this.sync();
    }

    get open(): boolean {
        return this.root.transitions.state.mounted && this.root.store.state.value === this.itemValue;
    }

    /**
     * The element the adapter portals the content into (`null`: don't render).
     */
    getPortalContainer(): HTMLElement | null {
        const { viewportTargetElement, viewportElement } = this.root.store.state;
        const container = viewportTargetElement || viewportElement;
        return container && this.transitions.state.mounted ? container : null;
    }

    setElement = (element: HTMLElement | null) => {
        this.element = element;
        this.composite.setRoot(element);
        if (element) {
            this.root.currentContentRef.current = element;
        }
    };

    getState(): NavigationMenuContentState {
        return {
            open: this.open,
            transitionStatus: this.transitions.state.transitionStatus,
            activationDirection: this.root.store.state.activationDirection
        };
    }

    static attrs(state: NavigationMenuContentState) {
        return getStyleHookProps(state, navigationMenuContentStateAttributesMapping);
    }

    getContentProps(elementProps: Props = {}): Props {
        const commonProps = {
            onFocus: (event: FocusEvent) => {
                const target = getTarget(event) as Element | null;
                if (!target?.hasAttribute('data-base-ui-focus-guard')) {
                    this.focusInside.set('focusInside', true);
                }
            },
            onBlur: (event: FocusEvent) => {
                if (!contains(event.currentTarget as Element | null, event.relatedTarget as Element | null)) {
                    this.focusInside.set('focusInside', false);
                }
            }
        };
        const exiting = !this.open && this.transitions.state.mounted;
        return mergeProps(
            this.composite.getRootProps(),
            exiting
                ? { style: { position: 'absolute', top: 0, left: 0 }, inert: !this.focusInside.state.focusInside, ...commonProps }
                : commonProps,
            elementProps
        );
    }

    destroy() {
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe();
        }
        this.openChangeComplete.destroy();
        this.transitions.destroy();
        this.composite.destroy();
        this.node.destroy();
    }

    private sync() {
        const open = this.open;
        this.transitions.setOpen(open);
        this.openChangeComplete.sync(open);
    }
}

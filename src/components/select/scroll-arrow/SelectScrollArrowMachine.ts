import { OpenChangeComplete } from '~@dom/OpenChangeComplete';
import { TransitionStatusController } from '~@dom/TransitionStatusController';
import { mergeProps } from '~@props/mergeProps';
import { Timeout } from '~@timers/Timeout';

import type { MutableRef, Side, TransitionStatus } from '~@lib/types';
import type { Props } from '~@props/mergeProps';

import type { SelectPositionerMachine } from '../positioner/SelectPositionerMachine';
import type { SelectRootMachine } from '../root/SelectRootMachine';

export type SelectScrollArrowState = {
    direction: 'up' | 'down';
    visible: boolean;
    side: Side | 'none';
    transitionStatus: TransitionStatus;
};

/**
 * State machine of `Select.ScrollUpArrow` / `Select.ScrollDownArrow`: scrolls item by item while hovered.
 */
export class SelectScrollArrowMachine {
    readonly transitions: TransitionStatusController;

    private readonly root: SelectRootMachine;

    private readonly positioner: SelectPositionerMachine;

    private readonly direction: 'up' | 'down';

    private readonly timeout = new Timeout();

    private readonly openChangeComplete: OpenChangeComplete;

    private readonly unsubscribe: () => void;

    constructor(root: SelectRootMachine, positioner: SelectPositionerMachine, direction: 'up' | 'down') {
        this.root = root;
        this.positioner = positioner;
        this.direction = direction;
        this.transitions = new TransitionStatusController(this.visible);
        this.openChangeComplete = new OpenChangeComplete(this.ref, () => {
            if (!this.visible) {
                this.transitions.setMounted(false);
            }
        });

        const { store, refs } = root;
        refs.scrollArrowsMountedCountRef.current += 1;
        if (!store.state.hasScrollArrows) {
            store.set('hasScrollArrows', true);
        }

        this.unsubscribe = store.subscribe(() => this.sync());
        this.sync();
    }

    private get ref(): MutableRef<HTMLElement | null> {
        return this.direction === 'up' ? this.positioner.scrollUpArrowRef : this.positioner.scrollDownArrowRef;
    }

    /**
     * Visible when scrollable in that direction (never for touch input).
     */
    get visible(): boolean {
        const { state } = this.root.store;
        const stateVisible = this.direction === 'up' ? state.scrollUpArrowVisible : state.scrollDownArrowVisible;
        return stateVisible && state.openMethod !== 'touch';
    }

    setElement = (element: HTMLElement | null) => {
        this.ref.current = element;
    };

    shouldRender(keepMounted = false): boolean {
        return this.visible || keepMounted;
    }

    getState(): SelectScrollArrowState {
        return {
            direction: this.direction,
            visible: this.visible,
            side: this.positioner.getSide(),
            transitionStatus: this.transitions.state.transitionStatus
        };
    }

    getProps(elementProps: Props = {}): Props {
        return mergeProps(
            {
                'aria-hidden': true,
                style: { position: 'absolute' },
                onMouseMove: (event: MouseEvent) => {
                    if ((event.movementX === 0 && event.movementY === 0) || this.timeout.isStarted()) {
                        return;
                    }
                    this.root.store.set('activeIndex', null);
                    this.timeout.start(40, this.scrollNextItem);
                },
                onMouseLeave: () => {
                    this.timeout.clear();
                }
            },
            elementProps
        );
    }

    destroy() {
        this.unsubscribe();
        this.timeout.clear();
        this.openChangeComplete.destroy();
        this.transitions.destroy();
        const { store, refs } = this.root;
        refs.scrollArrowsMountedCountRef.current = Math.max(0, refs.scrollArrowsMountedCountRef.current - 1);
        if (refs.scrollArrowsMountedCountRef.current === 0 && store.state.hasScrollArrows) {
            store.set('hasScrollArrows', false);
        }
    }

    private sync() {
        const visible = this.visible;
        this.transitions.setOpen(visible);
        this.openChangeComplete.sync(visible);
    }

    private readonly scrollNextItem = () => {
        const { store, refs } = this.root;
        const scroller = store.state.listElement ?? refs.popupRef.current;
        if (!scroller) {
            return;
        }

        store.set('activeIndex', null);
        this.root.handleScrollArrowVisibility();

        const isScrolledToTop = scroller.scrollTop === 0;
        const isScrolledToBottom = Math.round(scroller.scrollTop + scroller.clientHeight) >= scroller.scrollHeight;
        const items = refs.listRef.current;

        // Fallback when there are no items registered yet.
        if (items.length === 0) {
            if (this.direction === 'up') {
                store.set('scrollUpArrowVisible', !isScrolledToTop);
            } else {
                store.set('scrollDownArrowVisible', !isScrolledToBottom);
            }
        }

        if ((this.direction === 'up' && isScrolledToTop) || (this.direction === 'down' && isScrolledToBottom)) {
            this.timeout.clear();
            return;
        }

        if (items.length > 0) {
            const scrollArrowHeight = this.ref.current?.offsetHeight || 0;
            if (this.direction === 'up') {
                this.scrollUp(scroller, items, scrollArrowHeight);
            } else {
                this.scrollDown(scroller, items, scrollArrowHeight);
            }
        }

        this.timeout.start(40, this.scrollNextItem);
    };

    private scrollUp(scroller: HTMLElement, items: (HTMLElement | null)[], scrollArrowHeight: number) {
        const scrollTop = scroller.scrollTop + scrollArrowHeight;
        let firstVisibleIndex = 0;
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item && item.offsetTop >= scrollTop) {
                firstVisibleIndex = i;
                break;
            }
        }
        const targetIndex = Math.max(0, firstVisibleIndex - 1);
        const targetItem = items[targetIndex];
        if (targetIndex < firstVisibleIndex && targetItem) {
            scroller.scrollTop = Math.max(0, targetItem.offsetTop - scrollArrowHeight);
        } else if (targetIndex >= firstVisibleIndex) {
            // Already at the first item: reach the absolute top to account for group labels.
            scroller.scrollTop = 0;
        }
    }

    private scrollDown(scroller: HTMLElement, items: (HTMLElement | null)[], scrollArrowHeight: number) {
        const scrollBottom = scroller.scrollTop + scroller.clientHeight - scrollArrowHeight;
        let lastVisibleIndex = items.length - 1;
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item && item.offsetTop + item.offsetHeight > scrollBottom) {
                lastVisibleIndex = Math.max(0, i - 1);
                break;
            }
        }
        const targetIndex = Math.min(items.length - 1, lastVisibleIndex + 1);
        const targetItem = items[targetIndex];
        if (targetIndex > lastVisibleIndex && targetItem) {
            scroller.scrollTop = targetItem.offsetTop + targetItem.offsetHeight - scroller.clientHeight + scrollArrowHeight;
        } else if (targetIndex <= lastVisibleIndex) {
            // Already at the last item: reach the true bottom.
            scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
        }
    }
}

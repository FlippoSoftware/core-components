import { CompositeRootMachine } from '~@components/composite/root/CompositeRootMachine';
import { DismissInteraction } from '~@packages/floating-ui/interactions/DismissInteraction';
import { getTarget } from '~@packages/floating-ui/utils/element';
import { mergeProps } from '~@props/mergeProps';

import type { TextDirection } from '~@lib/types';
import type { FloatingRootStore } from '~@packages/floating-ui/FloatingRootStore';
import type { InteractionProps } from '~@packages/floating-ui/types';
import type { Props } from '~@props/mergeProps';

import { EMPTY_ROOT_CONTEXT, NAVIGATION_MENU_TRIGGER_IDENTIFIER } from '../utils/constants';

import type { NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

/**
 * State machine of `NavigationMenu.List`: dismissal of the open item and composite navigation
 * between triggers (`dismissProps.reference` goes on each trigger).
 */
export class NavigationMenuListMachine {
    readonly composite: CompositeRootMachine | null;

    private readonly root: NavigationMenuRootMachine;

    private floatingRoot: FloatingRootStore | undefined;

    private dismiss: DismissInteraction | null = null;

    private readonly unsubscribe: () => void;

    constructor(root: NavigationMenuRootMachine, direction: TextDirection = 'ltr') {
        this.root = root;
        // Nested lists take part in the parent content's composite navigation.
        this.composite = root.nested ? null : new CompositeRootMachine({ orientation: root.orientation, loopFocus: false, direction });
        this.unsubscribe = root.store.subscribe(() => this.sync());
        this.sync();
    }

    getState(): { open: boolean } {
        return { open: this.root.open };
    }

    /**
     * Dismiss props of the active trigger's floating root (`undefined` when nothing is open).
     */
    getDismissProps(): InteractionProps | undefined {
        return this.root.store.state.floatingRootContext ? this.dismiss?.getProps() : undefined;
    }

    getListProps(elementProps: Props = {}): Props {
        const { root } = this;
        const dismissProps = this.getDismissProps();
        const keyDownProps = root.nested
            ? {}
            : {
                  onKeyDown: (event: KeyboardEvent) => {
                      // Block propagation at the ends of the list too.
                      const orientation = root.orientation;
                      const shouldStop =
                          (orientation === 'horizontal' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) ||
                          (orientation === 'vertical' && (event.key === 'ArrowUp' || event.key === 'ArrowDown'));
                      if (shouldStop) {
                          event.stopPropagation();
                      }
                  }
              };
        return mergeProps(this.composite?.getRootProps(), dismissProps?.floating as Props | undefined, keyDownProps, elementProps);
    }

    destroy() {
        this.unsubscribe();
        this.dismiss?.destroy();
        this.composite?.destroy();
    }

    private getDismissOptions() {
        const { positionerElement, value } = this.root.store.state;
        return {
            enabled: positionerElement ? true : !value,
            outsidePressEvent: 'intentional' as const,
            outsidePress: (event: MouseEvent | TouchEvent) => {
                const target = getTarget(event) as HTMLElement | null;
                return target?.closest(`[${NAVIGATION_MENU_TRIGGER_IDENTIFIER}]`) == null;
            }
        };
    }

    private sync() {
        const floatingRoot = this.root.store.state.floatingRootContext;
        if (floatingRoot !== this.floatingRoot) {
            this.dismiss?.destroy();
            this.floatingRoot = floatingRoot;
            this.dismiss = new DismissInteraction(floatingRoot ?? EMPTY_ROOT_CONTEXT, this.getDismissOptions());
        } else {
            this.dismiss?.setOptions(this.getDismissOptions());
        }
    }
}

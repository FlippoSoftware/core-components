import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { getNativeEvent } from '~@packages/floating-ui/utils/event';
import { mergeProps } from '~@props/mergeProps';

import type { Props } from '~@props/mergeProps';

import { isOutsideMenuEvent } from '../utils/isOutsideMenuEvent';

import type { NavigationMenuRootMachine } from '../root/NavigationMenuRootMachine';

/**
 * Props of `NavigationMenu.Link`.
 */
export function getNavigationMenuLinkProps(
    root: NavigationMenuRootMachine,
    options: { active?: boolean | undefined; closeOnClick?: boolean | undefined },
    elementProps: Props = {}
): Props {
    const { active = false, closeOnClick = false } = options;
    return mergeProps(
        {
            'aria-current': active ? 'page' : undefined,
            tabIndex: undefined,
            onClick: (event: MouseEvent) => {
                if (closeOnClick) {
                    root.setValue(null, createChangeEventDetails(REASONS.linkPress, getNativeEvent(event)));
                }
            },
            onBlur: (event: FocusEvent) => {
                const { positionerElement, popupElement } = root.store.state;
                if (
                    positionerElement &&
                    popupElement &&
                    isOutsideMenuEvent(
                        { currentTarget: event.currentTarget as Element | null, relatedTarget: event.relatedTarget as Element | null },
                        { popupElement, rootRef: root.rootRef, tree: root.tree, nodeId: root.nodeId }
                    )
                ) {
                    root.setValue(null, createChangeEventDetails(REASONS.focusOut, getNativeEvent(event)));
                }
            }
        },
        elementProps
    );
}

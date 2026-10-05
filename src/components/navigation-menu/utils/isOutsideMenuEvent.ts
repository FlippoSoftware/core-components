import { contains } from '~@packages/floating-ui/utils/element';
import { getNodeChildren } from '~@packages/floating-ui/utils/nodes';

import type { MutableRef } from '~@lib/types';
import type { FloatingTreeStore } from '~@packages/floating-ui/FloatingTreeStore';

/**
 * Whether a blur moves focus outside the navigation menu (its popup, root and nested menus).
 */
export function isOutsideMenuEvent(
    { currentTarget, relatedTarget }: { currentTarget: Element | null; relatedTarget: Element | null },
    params: {
        popupElement: HTMLElement | null;
        viewportElement?: HTMLElement | null | undefined;
        rootRef: MutableRef<HTMLElement | null>;
        tree: FloatingTreeStore | null;
        nodeId: string | undefined;
    }
) {
    const { popupElement, viewportElement, rootRef, tree, nodeId } = params;
    const nodeChildrenContains = tree
        ? getNodeChildren(tree.nodesRef.current, nodeId).some((node) => contains(node.context?.elements.floating, relatedTarget))
        : false;

    // Nested menus without a popup only close when focus leaves the root.
    if (!popupElement) {
        return !contains(rootRef.current, relatedTarget) && !nodeChildrenContains;
    }

    const floatingElement = popupElement || viewportElement;
    return (
        !contains(floatingElement, currentTarget) &&
        !contains(floatingElement, relatedTarget) &&
        !contains(rootRef.current, relatedTarget) &&
        !nodeChildrenContains &&
        !(contains(floatingElement, relatedTarget) && relatedTarget?.hasAttribute('data-base-ui-focus-guard'))
    );
}

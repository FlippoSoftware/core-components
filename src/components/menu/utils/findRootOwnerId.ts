import { getParentNode, isHTMLElement, isLastTraversableNode } from '@floating-ui/utils/dom';

/**
 * Finds the `data-rootownerid` of the closest menu popup containing `node`.
 */
export function findRootOwnerId(node: Node): string | undefined {
    if (isHTMLElement(node) && node.hasAttribute('data-rootownerid')) {
        return node.getAttribute('data-rootownerid') ?? undefined;
    }

    if (isLastTraversableNode(node)) {
        return undefined;
    }

    return findRootOwnerId(getParentNode(node));
}

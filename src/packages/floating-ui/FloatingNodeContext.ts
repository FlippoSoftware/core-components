import type { Placement } from '@floating-ui/dom';

import type { FloatingRootStore } from './FloatingRootStore';
import type { FloatingTreeStore } from './FloatingTreeStore';
import type { FloatingNodeContext } from './types';

/**
 * Creates a live node context backed by a floating root store and registers it:
 * - as `dataRef.current.floatingContext`, so interactions can read the node id;
 * - as the `context` of the tree node with `nodeId`, so other nodes can inspect this one.
 *
 * Framework-agnostic replacement for the context assembly in `useFloating`.
 */
export function createFloatingNodeContext(
    store: FloatingRootStore,
    nodeId: string | undefined,
    getPlacement: () => Placement = () => 'bottom'
): FloatingNodeContext {
    return {
        get open() {
            return store.select('open');
        },
        nodeId,
        get floatingId() {
            return store.select('floatingId');
        },
        get placement() {
            return getPlacement();
        },
        dataRef: store.context.dataRef,
        events: store.context.events,
        get elements() {
            return {
                reference: store.select('referenceElement'),
                domReference: store.select('domReferenceElement'),
                floating: store.select('floatingElement')
            };
        }
    };
}

/**
 * Publishes the node context to the data ref and to the tree node.
 */
export function attachFloatingNodeContext(
    store: FloatingRootStore,
    context: FloatingNodeContext,
    tree: FloatingTreeStore | null | undefined
) {
    store.context.dataRef.current.floatingContext = context;
    const node = tree?.nodesRef.current.find((n) => n.id === context.nodeId);
    if (node) {
        node.context = context;
    }
}

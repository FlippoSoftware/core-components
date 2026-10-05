import { createEventEmitter } from '~@events/EventEmitter';

import type { FloatingEvents } from '~@events/EventEmitter';
import type { MutableRef } from '~@lib/types';

import type { FloatingNodeType } from './types';

/**
 * Stores and manages floating elements in a tree structure (nested popups, submenus).
 */
export class FloatingTreeStore {
    public readonly nodesRef: MutableRef<FloatingNodeType[]> = { current: [] };

    public readonly events: FloatingEvents = createEventEmitter();

    public addNode(node: FloatingNodeType) {
        this.nodesRef.current.push(node);
    }

    public removeNode(node: FloatingNodeType) {
        const index = this.nodesRef.current.indexOf(node);
        if (index !== -1) {
            this.nodesRef.current.splice(index, 1);
        }
    }
}

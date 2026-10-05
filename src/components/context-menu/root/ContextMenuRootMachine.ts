import { MenuRootMachine } from '~@components/menu/root/MenuRootMachine';

import type { MenuRootOptions, MenuRootSetup } from '~@components/menu/root/MenuRootMachine';
import type { ContextMenuParentContext } from '~@components/menu/store/MenuStore';
import type { MutableRef } from '~@lib/types';

import { createAnchor } from '../utils/createAnchor';

import type { ContextMenuAnchor } from '../utils/ContextMenuAnchor';

/**
 * State machine of `ContextMenu.Root`: a menu anchored at the cursor, opened by the trigger.
 */
export class ContextMenuRootMachine<Payload = unknown> {
    readonly context: ContextMenuParentContext & {
        anchor: ContextMenuAnchor;
        backdropRef: MutableRef<HTMLDivElement | null>;
        internalBackdropRef: MutableRef<HTMLDivElement | null>;
        positionerRef: MutableRef<HTMLElement | null>;
        initialCursorPointRef: MutableRef<{ x: number; y: number } | null>;
        actionsRef: MutableRef<{ setOpen: (open: boolean, eventDetails: never) => void } | null>;
    };

    readonly menu: MenuRootMachine<Payload>;

    constructor(options: MenuRootOptions, setup: Omit<MenuRootSetup<Payload>, 'parent'>) {
        this.context = {
            anchor: createAnchor(0, 0, 0),
            backdropRef: { current: null },
            internalBackdropRef: { current: null },
            actionsRef: { current: null },
            positionerRef: { current: null },
            allowMouseUpTriggerRef: { current: true },
            initialCursorPointRef: { current: null },
            rootId: setup.rootId
        };
        this.menu = new MenuRootMachine<Payload>(options, { ...setup, parent: { type: 'context-menu', context: this.context } });
    }

    get store() {
        return this.menu.store;
    }

    setOptions(options: MenuRootOptions) {
        this.menu.setOptions(options);
    }

    /**
     * Moves the anchor (the positioner follows it on the next update).
     */
    setAnchor(anchor: ContextMenuAnchor) {
        this.context.anchor = anchor;
        // Re-run positioning with the new anchor.
        this.menu.store.notifyAll();
    }

    destroy() {
        this.menu.destroy();
    }
}

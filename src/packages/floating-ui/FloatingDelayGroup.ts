import { createChangeEventDetails } from '~@events/changeEventDetails';
import { REASONS } from '~@events/reasons';
import { Store } from '~@store/Store';
import { Timeout } from '~@timers/Timeout';

import type { ChangeEventDetails } from '~@events/changeEventDetails';
import type { MutableRef } from '~@lib/types';

import { getDelay } from './interactions/hover/HoverInteractionState';

import type { FloatingRootStore } from './FloatingRootStore';
import type { Delay } from './types';

type GroupMemberContext = {
    onOpenChange: (open: boolean, eventDetails: ChangeEventDetails<string>) => void;
    setIsInstantPhase: (value: boolean) => void;
};

export type FloatingDelayGroupOptions = {
    /**
     * The delay to use for the group when it's not in the instant phase.
     */
    delay: Delay;
    /**
     * When grouping logic stops after the close delay completes.
     * @default 0
     */
    timeoutMs?: number | undefined;
};

/**
 * A group of floating elements that share a delay: once one is open, the next one opens instantly.
 * Replacement for the `FloatingDelayGroup` provider; adapters pass it down through their context.
 */
export class FloatingDelayGroup {
    readonly hasProvider: boolean;

    timeoutMs: number;

    readonly delayRef: MutableRef<Delay>;

    readonly initialDelayRef: MutableRef<Delay>;

    readonly timeout = new Timeout();

    readonly currentIdRef: MutableRef<string | null> = { current: null };

    readonly currentContextRef: MutableRef<GroupMemberContext | null> = { current: null };

    constructor(options: FloatingDelayGroupOptions, hasProvider = true) {
        this.hasProvider = hasProvider;
        this.timeoutMs = options.timeoutMs ?? 0;
        this.delayRef = { current: options.delay };
        this.initialDelayRef = { current: options.delay };
    }

    setOptions(options: FloatingDelayGroupOptions) {
        this.timeoutMs = options.timeoutMs ?? 0;
    }

    destroy() {
        this.timeout.clear();
    }
}

/**
 * The group used when no provider is present (same defaults as the React context default value).
 */
export function createDefaultDelayGroup() {
    return new FloatingDelayGroup({ delay: 0 }, false);
}

export type DelayGroupMemberOptions = {
    /**
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * Whether the trigger this member belongs to has opened the floating element.
     */
    open: boolean;
};

/**
 * Membership of one floating element in a {@link FloatingDelayGroup}.
 * Replacement for `useDelayGroup`; `state.isInstantPhase` tells whether animations should be removed.
 */
export class DelayGroupMember {
    readonly state = new Store({ isInstantPhase: false });

    private options: DelayGroupMemberOptions;

    private readonly store: FloatingRootStore;

    private readonly group: FloatingDelayGroup;

    private previous: unknown[] | null = null;

    private cleanupClose: (() => void) | null = null;

    private readonly memberContext: GroupMemberContext;

    constructor(store: FloatingRootStore, group: FloatingDelayGroup, options: DelayGroupMemberOptions) {
        this.store = store;
        this.group = group;
        this.options = options;
        this.memberContext = {
            onOpenChange: (open, details) => store.setOpen(open, details),
            setIsInstantPhase: (value) => this.state.set('isInstantPhase', value)
        };
        this.sync();
    }

    get delayRef() {
        return this.group.delayRef;
    }

    get hasProvider() {
        return this.group.hasProvider;
    }

    setOptions(options: DelayGroupMemberOptions) {
        this.options = options;
        this.sync();
    }

    /**
     * Re-evaluates the membership (call when the floating id changes).
     */
    sync() {
        const { enabled = true, open } = this.options;
        const floatingId = this.store.select('floatingId');
        const deps = [enabled, open, floatingId, this.group.timeoutMs];

        if (this.previous && deps.every((dep, index) => Object.is(dep, this.previous?.[index]))) {
            return;
        }
        this.previous = deps;

        this.cleanupClose?.();
        this.cleanupClose = this.handleClose(enabled, open, floatingId);
        this.handleOpen(enabled, open, floatingId);
    }

    destroy() {
        this.cleanupClose?.();
        this.cleanupClose = null;
        this.group.currentContextRef.current = null;
    }

    private setIsInstantPhase(value: boolean) {
        this.state.set('isInstantPhase', value);
    }

    private handleClose(enabled: boolean, open: boolean, floatingId: string | undefined) {
        const group = this.group;

        const unset = () => {
            this.setIsInstantPhase(false);
            group.currentContextRef.current?.setIsInstantPhase(false);
            group.currentIdRef.current = null;
            group.currentContextRef.current = null;
            group.delayRef.current = group.initialDelayRef.current;
        };

        if (!enabled || !group.currentIdRef.current) {
            return null;
        }

        if (!open && group.currentIdRef.current === floatingId) {
            this.setIsInstantPhase(false);

            if (group.timeoutMs) {
                group.timeout.start(group.timeoutMs, unset);
                return () => {
                    group.timeout.clear();
                };
            }

            unset();
        }
        return null;
    }

    private handleOpen(enabled: boolean, open: boolean, floatingId: string | undefined) {
        const group = this.group;
        if (!enabled || !open) {
            return;
        }

        const prevContext = group.currentContextRef.current;
        const prevId = group.currentIdRef.current;

        group.currentContextRef.current = this.memberContext;
        group.currentIdRef.current = floatingId ?? null;
        group.delayRef.current = {
            open: 0,
            close: getDelay(group.initialDelayRef.current, 'close')
        };

        if (prevId !== null && prevId !== floatingId) {
            group.timeout.clear();
            this.setIsInstantPhase(true);
            prevContext?.setIsInstantPhase(true);
            prevContext?.onOpenChange(false, createChangeEventDetails(REASONS.none));
        } else {
            this.setIsInstantPhase(false);
            prevContext?.setIsInstantPhase(false);
        }
    }
}

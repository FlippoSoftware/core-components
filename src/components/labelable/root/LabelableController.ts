import { isElement } from '@floating-ui/utils/dom';

import { mergeProps } from '~@props/mergeProps';
import { Store } from '~@store/Store';

import type { Props } from '~@props/mergeProps';

export type LabelableState = {
    /**
     * The `id` of the labelable element. `null` means the association is implicit.
     */
    controlId: string | null | undefined;
    /**
     * The `id` of the label.
     */
    labelId: string | undefined;
    /**
     * `id`s of elements that provide an accessible description.
     */
    messageIds: string[];
};

/**
 * Associates a labelable control with its label and descriptions.
 * Replacement for `LabelableProvider` + `LabelableContext` + `useLabelableId`.
 */
export class LabelableController {
    readonly store: Store<LabelableState>;

    readonly defaultId: string;

    private readonly parent: LabelableController | null;

    /**
     * @param defaultId Generated id used for the control when none is given.
     * @param parent The enclosing controller (its descriptions are inherited).
     * @param initialControlId Initial control id; `null` for implicit labelling.
     */
    constructor(defaultId: string, parent: LabelableController | null = null, initialControlId?: string | null) {
        this.defaultId = defaultId;
        this.parent = parent;
        this.store = new Store<LabelableState>({
            controlId: initialControlId === undefined ? defaultId : initialControlId,
            labelId: undefined,
            messageIds: []
        });
    }

    get controlId() {
        return this.store.state.controlId;
    }

    get labelId() {
        return this.store.state.labelId;
    }

    get messageIds(): string[] {
        return this.store.state.messageIds;
    }

    setControlId = (controlId: string | null | undefined) => {
        this.store.set('controlId', controlId);
    };

    setLabelId = (labelId: string | undefined) => {
        this.store.set('labelId', labelId);
    };

    setMessageIds = (update: string[] | ((previous: string[]) => string[])) => {
        this.store.set('messageIds', typeof update === 'function' ? update(this.store.state.messageIds) : update);
    };

    /**
     * Adds a description id and returns a function that removes it.
     */
    addMessageId(id: string) {
        this.setMessageIds((ids) => ids.concat(id));
        return () => {
            this.setMessageIds((ids) => ids.filter((item) => item !== id));
        };
    }

    /**
     * Merges `aria-describedby` (own and inherited descriptions) into the props.
     */
    getDescriptionProps = (externalProps: Props) => {
        const parentMessageIds = this.parent?.messageIds ?? [];
        return mergeProps({ 'aria-describedby': parentMessageIds.concat(this.messageIds).join(' ') || undefined }, externalProps);
    };

    /**
     * Registers a control id (replacement for the effect of `useLabelableId`).
     *
     * @returns A cleanup function.
     */
    registerControl(params: {
        id?: string | undefined;
        implicit?: boolean | undefined;
        controlElement?: Element | null | undefined;
        defaultId: string;
    }): () => void {
        const { id, implicit = false, controlElement, defaultId } = params;

        if (!implicit && !id) {
            return () => {};
        }

        if (implicit) {
            if (isElement(controlElement) && controlElement.closest('label') != null) {
                this.setControlId(id ?? null);
            } else {
                this.setControlId(this.controlId ?? defaultId);
            }
        } else if (id) {
            this.setControlId(id);
        }

        return () => {
            if (id) {
                this.setControlId(undefined);
            }
        };
    }

    /**
     * The id a control should render with.
     */
    resolveControlId(defaultId: string) {
        return this.controlId ?? defaultId;
    }
}

import { EMPTY_OBJECT } from '~@lib/constants';

import { getFloatingFocusElement } from '../utils/element';

import type { FloatingRootState } from '../FloatingRootStore';
import type { InteractionElementProps, InteractionProps, ItemUserProps } from '../types';

export type AriaRole = 'tooltip' | 'dialog' | 'alertdialog' | 'menu' | 'listbox' | 'grid' | 'tree';
export type ComponentRole = 'select' | 'label' | 'combobox';

export type RoleOptions = {
    /**
     * Whether the interaction is enabled.
     * @default true
     */
    enabled?: boolean | undefined;
    /**
     * The role of the floating element.
     * @default 'dialog'
     */
    role?: AriaRole | ComponentRole | undefined;
    /**
     * ID used for the reference when the element has none (adapters pass a generated id).
     */
    fallbackReferenceId: string;
    /**
     * Whether the floating element is nested in another floating element (has a parent tree node).
     */
    nested: boolean;
};

const componentRoleToAriaRoleMap = new Map<AriaRole | ComponentRole, AriaRole | false>([
    ['select', 'listbox'],
    ['combobox', 'listbox'],
    ['label', false]
]);

/**
 * Base screen reader props for the reference and floating elements of a given floating `role`.
 * Pure replacement for `useRole`.
 */
export function getRoleProps(
    state: Pick<FloatingRootState, 'open' | 'floatingId' | 'domReferenceElement' | 'floatingElement'>,
    options: RoleOptions
): InteractionProps {
    const { enabled = true, role = 'dialog', fallbackReferenceId, nested } = options;

    if (!enabled) {
        return {};
    }

    const { open } = state;
    const referenceId = state.domReferenceElement?.id || fallbackReferenceId;
    const floatingId = getFloatingFocusElement(state.floatingElement)?.id || state.floatingId;
    const ariaRole = (componentRoleToAriaRoleMap.get(role) ?? role) as AriaRole | false | undefined;
    const isTooltipLike = ariaRole === 'tooltip' || role === 'label';

    const trigger: InteractionElementProps = isTooltipLike
        ? EMPTY_OBJECT
        : {
              'aria-haspopup': ariaRole === 'alertdialog' ? 'dialog' : ariaRole,
              'aria-expanded': 'false',
              ...(ariaRole === 'listbox' && { role: 'combobox' }),
              ...(ariaRole === 'menu' && nested && { role: 'menuitem' }),
              ...(role === 'select' && { 'aria-autocomplete': 'none' }),
              ...(role === 'combobox' && { 'aria-autocomplete': 'list' })
          };

    const reference: InteractionElementProps = isTooltipLike
        ? { [`aria-${role === 'label' ? 'labelledby' : 'describedby'}`]: open ? floatingId : undefined }
        : {
              ...trigger,
              'aria-expanded': open ? 'true' : 'false',
              'aria-controls': open ? floatingId : undefined,
              ...(ariaRole === 'menu' && { id: referenceId })
          };

    const floatingProps = {
        id: floatingId,
        ...(ariaRole && { role: ariaRole })
    };

    const floating: InteractionElementProps = isTooltipLike
        ? floatingProps
        : { ...floatingProps, ...(ariaRole === 'menu' && { 'aria-labelledby': referenceId }) };

    const item = ({ active, selected }: ItemUserProps): InteractionElementProps => {
        const commonProps = {
            role: 'option',
            ...(active && { id: `${floatingId}-fui-option` })
        };

        // For `menu`, we are unable to tell if the item is a `menuitemradio`
        // or `menuitemcheckbox`. For backwards-compatibility reasons, also
        // avoid defaulting to `menuitem` as it may overwrite custom role props.
        if (role === 'select' || role === 'combobox') {
            return { ...commonProps, 'aria-selected': selected };
        }

        return {};
    };

    return { reference, floating, item, trigger };
}

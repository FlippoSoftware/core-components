import { collapsibleOpenStateMapping } from '~@attributes/collapsibleOpenStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

import { AccordionItemDataAttributes } from '../item/AccordionItemDataAttributes';

export const accordionStateAttributesMapping = {
    ...collapsibleOpenStateMapping,
    index: (value: number) => (Number.isInteger(value) ? { [AccordionItemDataAttributes.index]: String(value) } : null),
    ...transitionStatusMapping,
    value: () => null
};

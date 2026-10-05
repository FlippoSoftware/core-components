import { collapsibleOpenStateMapping } from '~@attributes/collapsibleOpenStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

export const collapsibleStateAttributesMapping = {
    ...collapsibleOpenStateMapping,
    ...transitionStatusMapping
};

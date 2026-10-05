import { collapsibleTriggerOpenStateMapping } from '~@attributes/collapsibleOpenStateMapping';
import { transitionStatusMapping } from '~@attributes/styleHookMapping';

export const collapsibleTriggerStateAttributesMapping = {
    ...collapsibleTriggerOpenStateMapping,
    ...transitionStatusMapping
};

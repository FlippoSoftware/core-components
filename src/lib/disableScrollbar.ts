const DISABLE_SCROLLBAR_CLASS_NAME = 'headless-ui-disable-scrollbar';

/**
 * Class name and CSS that hide native scrollbars (adapters render the style element).
 */
export const styleDisableScrollbar = {
    className: DISABLE_SCROLLBAR_CLASS_NAME,
    css: `.${DISABLE_SCROLLBAR_CLASS_NAME}{scrollbar-width:none}.${DISABLE_SCROLLBAR_CLASS_NAME}::-webkit-scrollbar{display:none}`
};

export const menubarStateAttributesMapping = {
    hasSubmenuOpen(value: boolean) {
        return { 'data-has-submenu-open': value ? 'true' : 'false' };
    }
};

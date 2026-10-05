/**
 * Bundlers replace `process.env.NODE_ENV` at build time. Declared here so that the core
 * package does not depend on Node.js typings.
 */
declare const process: {
    env: {
        NODE_ENV?: string;
    };
};

/**
 * Global switch used by tests and consumers to skip waiting for CSS animations.
 */
declare var FLIPPO_UI_ANIMATIONS_DISABLED: boolean | undefined;

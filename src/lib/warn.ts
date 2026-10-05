const warnedMessages = new Set<string>();

/**
 * Logs a development-only warning once per unique message.
 */
export function warn(...messages: string[]) {
    if (process.env.NODE_ENV !== 'production') {
        const messageKey = messages.join(' ');
        if (!warnedMessages.has(messageKey)) {
            warnedMessages.add(messageKey);
            // biome-ignore lint/suspicious/noConsole: development-only warning.
            console.warn(`Flippo UI: ${messageKey}`);
        }
    }
}

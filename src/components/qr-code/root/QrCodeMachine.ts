import { getStyleHookProps } from '~@attributes/getStyleHookProps';
import { Store } from '~@store/Store';

import type { TransitionStatus } from '~@lib/types';

import { qrCodeOverlayStateAttributesMapping } from '../overlay/qrCodeOverlayStateAttributesMapping';

import { qrCodeStateAttributesMapping } from './qrCodeStateAttributesMapping';

export type QrCodeStatus = 'idle' | 'loading' | 'generated' | 'error';

export type QrCodeFileExtension = 'svg' | 'png' | 'jpeg' | 'webp';

/**
 * The QR code generator (e.g. a `qr-code-styling` instance).
 */
export type QrCodeRenderer = {
    append(container: HTMLElement): void;
    getRawData(extension?: QrCodeFileExtension): Promise<Blob | ArrayBuffer | Uint8Array | null>;
    download(options: { name?: string; extension?: QrCodeFileExtension }): Promise<void>;
};

/**
 * Generation options passed to the renderer factory (shape of `qr-code-styling` options).
 */
export type QrCodeGenerationOptions = {
    width?: number;
    height?: number;
    margin?: number;
    image?: string;
    qrOptions?: { errorCorrectionLevel?: string; [key: string]: unknown };
    dotsOptions?: { color?: string; type?: string; [key: string]: unknown };
    backgroundOptions?: { color?: string; [key: string]: unknown };
    cornersSquareOptions?: { color?: string; type?: string; [key: string]: unknown };
    cornersDotOptions?: { color?: string; type?: string; [key: string]: unknown };
    imageOptions?: { hideBackgroundDots?: boolean; imageSize?: number; margin?: number; [key: string]: unknown };
    [key: string]: unknown;
};

export type QrCodeState = {
    value: string;
    status: QrCodeStatus;
};

export type QrCodeOverlayState = QrCodeState & {
    transitionStatus: TransitionStatus;
};

export type QrCodeOptions<Renderer extends QrCodeRenderer = QrCodeRenderer> = {
    value: string;
    /**
     * @default 200
     */
    size?: number | undefined;
    options?: QrCodeGenerationOptions | undefined;
    /**
     * @default true
     */
    generateOnMount?: boolean | undefined;
    onGenerate?: ((renderer: Renderer) => void | Promise<void>) | undefined;
    onError?: ((error: unknown) => void) | undefined;
    /**
     * Creates the renderer from the resolved generation options.
     */
    createRenderer: (options: QrCodeGenerationOptions & { data: string; width: number; height: number }) => Renderer;
};

type QrCodeInternalState<Renderer> = {
    status: QrCodeStatus;
    error: unknown;
    renderer: Renderer | null;
};

/**
 * State machine of a QR code: generation status, the generated renderer and its errors.
 */
export class QrCodeMachine<Renderer extends QrCodeRenderer = QrCodeRenderer> {
    readonly store = new Store<QrCodeInternalState<Renderer>>({ status: 'idle', error: null, renderer: null });

    private options: QrCodeOptions<Renderer>;

    private lastGeneratedKey: unknown[] | null = null;

    constructor(options: QrCodeOptions<Renderer>) {
        this.options = options;
    }

    setOptions(options: QrCodeOptions<Renderer>) {
        this.options = options;
        this.autoGenerate();
    }

    get size() {
        const { options = {}, size = 200 } = this.options;
        return { width: options.width || size, height: options.height || size };
    }

    get renderer() {
        return this.store.state.renderer;
    }

    getState(): QrCodeState {
        return { value: this.options.value, status: this.store.state.status };
    }

    static attrs(state: QrCodeState): Record<string, string> {
        return getStyleHookProps(state, qrCodeStateAttributesMapping);
    }

    static overlayAttrs(state: QrCodeOverlayState): Record<string, string> {
        return getStyleHookProps(state, qrCodeOverlayStateAttributesMapping);
    }

    /**
     * Whether the overlay is shown (while loading or on error).
     */
    isOverlayRendered() {
        const status = this.store.state.status;
        return status !== 'idle' && status !== 'generated';
    }

    /**
     * Applies the size CSS variables to the root element.
     */
    setRootElement = (element: HTMLElement | null) => {
        if (!element) {
            return;
        }
        const { width, height } = this.size;
        element.style.setProperty('--qr-code-width', `${width}px`);
        element.style.setProperty('--qr-code-height', `${height}px`);
    };

    /**
     * Ref callback of the frame: appends the generated code.
     */
    setFrameElement = (element: HTMLElement | null) => {
        if (element && this.renderer) {
            this.renderer.append(element);
        }
    };

    /**
     * Generates when mounted and when the value or options change (if `generateOnMount`).
     */
    autoGenerate() {
        const { generateOnMount = true, value, options, size } = this.options;
        const key = [generateOnMount, value, options, size];
        if (this.lastGeneratedKey && key.every((dep, index) => Object.is(dep, this.lastGeneratedKey?.[index]))) {
            return;
        }
        this.lastGeneratedKey = key;
        if (generateOnMount) {
            this.generate();
        }
    }

    generate = async () => {
        const { options: optionsProp = {}, value, onGenerate, onError, createRenderer } = this.options;
        const { width, height } = this.size;
        try {
            this.store.update({ status: 'loading', error: null });

            const renderer = createRenderer({
                ...optionsProp,
                width,
                height,
                data: value,
                margin: optionsProp.margin || 10,
                qrOptions: { errorCorrectionLevel: optionsProp.qrOptions?.errorCorrectionLevel || 'M', ...optionsProp.qrOptions },
                dotsOptions: {
                    color: optionsProp.dotsOptions?.color || '#000000',
                    type: optionsProp.dotsOptions?.type || 'square',
                    ...optionsProp.dotsOptions
                },
                backgroundOptions: { color: optionsProp.backgroundOptions?.color || '#ffffff', ...optionsProp.backgroundOptions },
                cornersSquareOptions: {
                    color: optionsProp.cornersSquareOptions?.color || '#000000',
                    type: optionsProp.cornersSquareOptions?.type || 'square',
                    ...optionsProp.cornersSquareOptions
                },
                cornersDotOptions: {
                    color: optionsProp.cornersDotOptions?.color || '#000000',
                    type: optionsProp.cornersDotOptions?.type || 'square',
                    ...optionsProp.cornersDotOptions
                },
                image: optionsProp.image,
                imageOptions: {
                    hideBackgroundDots: optionsProp.imageOptions?.hideBackgroundDots || true,
                    imageSize: optionsProp.imageOptions?.imageSize || 0.4,
                    margin: optionsProp.imageOptions?.margin || 10,
                    ...optionsProp.imageOptions
                }
            });

            await onGenerate?.(renderer);
            this.store.update({ renderer, status: 'generated' });
        } catch (err: unknown) {
            this.store.update({ status: 'error', error: err });
            onError?.(err);
        }
    };
}

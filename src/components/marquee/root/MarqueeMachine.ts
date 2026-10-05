import { Store } from '~@store/Store';

import type { Orientation, Style } from '~@lib/types';

import { MarqueeRootCssVars } from './MarqueeRootCssVars';

export type MarqueeDirection = 'normal' | 'reverse';

export type MarqueeState = {
    playing: boolean;
    orientation: Orientation;
    direction: MarqueeDirection;
};

export type MarqueeOptions = {
    /**
     * @default true
     */
    autoFill?: boolean | undefined;
    /**
     * @default true
     */
    play?: boolean | undefined;
    /**
     * @default true
     */
    pauseOnHover?: boolean | undefined;
    /**
     * @default false
     */
    pauseOnClick?: boolean | undefined;
    /**
     * @default 'horizontal'
     */
    orientation?: Orientation | undefined;
    /**
     * @default 'normal'
     */
    direction?: MarqueeDirection | undefined;
    /**
     * Pixels per second.
     * @default 50
     */
    speed?: number | undefined;
    /**
     * @default 0
     */
    delay?: number | undefined;
    /**
     * Number of iterations; `0` means infinite.
     * @default 0
     */
    loop?: number | undefined;
};

type MarqueeSizes = {
    containerSize: number;
    marqueeSize: number;
    multiplier: number;
};

/**
 * Measures a marquee and computes how many copies of the content are needed and the animation duration.
 */
export class MarqueeMachine {
    readonly store = new Store<MarqueeSizes>({ containerSize: 0, marqueeSize: 0, multiplier: 1 });

    private options: MarqueeOptions;

    private root: HTMLElement | null = null;

    private content: HTMLElement | null = null;

    private observer: ResizeObserver | null = null;

    constructor(options: MarqueeOptions = {}) {
        this.options = options;
    }

    setOptions(options: MarqueeOptions) {
        this.options = options;
        this.calculateSize();
    }

    private get vertical() {
        return this.options.orientation === 'vertical';
    }

    setRoot = (element: HTMLElement | null) => {
        this.root = element;
        this.observe();
    };

    /**
     * Ref callback of the hidden measurement container.
     */
    setContent = (element: HTMLElement | null) => {
        this.content = element;
        this.observe();
    };

    /**
     * Measures the container and the content.
     */
    calculateSize = () => {
        if (!this.content || !this.root) {
            return;
        }

        const { autoFill = true } = this.options;
        const containerRect = this.root.getBoundingClientRect();
        const contentRect = this.content.getBoundingClientRect();
        const containerSize = this.vertical ? containerRect.height : containerRect.width;
        const marqueeSize = this.vertical ? contentRect.height : contentRect.width;

        const multiplier =
            autoFill && containerSize && marqueeSize && marqueeSize < containerSize ? Math.ceil(containerSize / marqueeSize) : 1;

        this.store.update({ containerSize, marqueeSize, multiplier });
    };

    getState(): MarqueeState {
        const { play = true, orientation = 'horizontal', direction = 'normal' } = this.options;
        return { playing: play, orientation, direction };
    }

    get duration() {
        const { autoFill = true, speed = 50 } = this.options;
        const { containerSize, marqueeSize, multiplier } = this.store.state;
        if (autoFill) {
            return (marqueeSize * multiplier) / speed;
        }
        return marqueeSize < containerSize ? containerSize / speed : marqueeSize / speed;
    }

    /**
     * Functional styles and CSS variables of the root.
     */
    getRootStyle(): Style {
        const {
            play = true,
            pauseOnHover = true,
            pauseOnClick = false,
            direction = 'normal',
            orientation = 'horizontal',
            delay = 0,
            loop = 0,
            autoFill = true
        } = this.options;
        const vertical = this.vertical;
        return {
            overflow: 'hidden',
            display: 'flex',
            flexDirection: vertical ? 'column' : 'row',
            position: 'relative',
            [MarqueeRootCssVars.PauseOnHover]: !play || pauseOnHover ? 'paused' : 'running',
            [MarqueeRootCssVars.PauseOnClick]: !play || (pauseOnHover && !pauseOnClick) || pauseOnClick ? 'paused' : 'running',
            [MarqueeRootCssVars.Play]: play ? 'running' : 'paused',
            [MarqueeRootCssVars.Direction]: direction,
            [MarqueeRootCssVars.Orientation]: orientation,
            [MarqueeRootCssVars.Duration]: `${this.duration}s`,
            [MarqueeRootCssVars.Delay]: `${delay}s`,
            [MarqueeRootCssVars.IterationCount]: loop ? `${loop}` : 'infinite',
            [MarqueeRootCssVars.MinWidth]: vertical ? undefined : autoFill ? 'auto' : '100%'
        };
    }

    getTrackStyle(): Style {
        const vertical = this.vertical;
        return {
            display: 'flex',
            flexDirection: vertical ? 'column' : 'row',
            alignItems: vertical ? undefined : 'center',
            flex: '0 0 auto'
        };
    }

    /**
     * Styles of the hidden container used to measure the content.
     */
    getMeasureStyle(): Style {
        return { ...this.getTrackStyle(), position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: 0, left: 0 };
    }

    destroy() {
        this.observer?.disconnect();
        this.observer = null;
    }

    private observe() {
        this.observer?.disconnect();
        this.observer = null;

        if (!this.root || !this.content) {
            return;
        }

        this.calculateSize();

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        this.observer = new ResizeObserver(this.calculateSize);
        this.observer.observe(this.root);
        this.observer.observe(this.content);
    }
}

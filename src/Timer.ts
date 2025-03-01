// import { performance } from 'perf_hooks';

// const perf = globalThis?.performance ?? performance;

export class Timer {
    private _startTimeHR: number;
    // private startTime: number;

    start() {
        this._startTimeHR = performance.now();
        // this.startTime = Date.now();
        return this;
    }

    getDurationS() {
        return this.getDurationMs() / 1e3;
    }

    getDurationMs() {
        return (performance.now() - this._startTimeHR);
    }

    getDurationUs() {
        return this.getDurationMs() * 1e3;
    }

    getDurationNs() {
        return this.getDurationMs() * 1e6;
    }
}

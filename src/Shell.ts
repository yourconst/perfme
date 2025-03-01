import { Helpers } from "./helpers";
import { Measurement } from "./Measurement";
import { MemoryMeasurer } from "./MemoryMeasurer";
import { Timer } from "./Timer";

let gcOrStub = () => {};

if (typeof gc === 'undefined') {
    if (typeof process !== 'undefined') {
        console.warn(
            'perfme: Garbage Collector is not available.\n' +
            'If you want to measure memory consumption, use node --expose-gc flag'
        );
    }
} else {
    gcOrStub = gc;
}

export type TMeasureShellOptions<T extends any[] = any> = ((...params: T) => any) | {
    label: string,
    f: (...params: T) => any,
    getParams?: () => T,
    gc?: typeof gcOrStub,
}

export class MeasureShell<T extends any[] = any> {
    readonly duration: Measurement;
    readonly memory: Measurement;

    readonly label: string;
    readonly f: (...params: T) => any;
    readonly getParams: () => T;
    readonly gc: typeof gcOrStub;

    constructor(options: TMeasureShellOptions<T>) {
        this.duration = new Measurement();
        this.memory = new Measurement();

        if (typeof options === 'function') {
            this.label = options.name;
            this.f = options;
            this.getParams = (() => ([])) as any;
            this.gc = gcOrStub;
        } else {
            this.label = options.label;
            this.f = options.f;
            this.getParams = options.getParams ?? (() => ([])) as any;
            this.gc = options.gc ?? gcOrStub;
        }
    }

    get cnt() {
        return this.duration.cnt;
    }

    reset() {
        this.duration.reset();
        this.memory.reset();

        return this;
    }

    warmup(count: number = 10000) {
        this.gc();

        for (let i=0; i<count; ++i) {
            this.f(...this.getParams());
        }

        return this;
    }

    async warmupAsync(count: number = 10000) {
        this.gc();

        for (let i=0; i<count; ++i) {
            await this.f(...this.getParams());
        }

        return this;
    }

    measure(count: number) {
        this.gc();
        const mm = new MemoryMeasurer().start();
        const t = new Timer().start();

        for (let i=0; i<count; ++i) {
            this.f(...this.getParams());
        }

        this.duration.update(t.getDurationMs(), count);
        this.memory.update(mm.getValue(), count);

        return this;
    }

    async measureAsync(count: number) {
        this.gc?.();
        const mm = new MemoryMeasurer().start();
        const t = new Timer().start();

        for (let i=0; i<count; ++i) {
            await this.f(...this.getParams());
        }

        this.duration.update(t.getDurationMs(), count);
        this.memory.update(mm.getValue(), count);

        return this;
    }

    toJSON() {
        return {
            label: this.label,
            // duration: this.duration.toJSON(),
            // memory: this.memory.toJSON(),
            ...Helpers.setKeysPrefix(this.duration.toJSON(), 'duration_'),
            ...Helpers.setKeysPrefix(this.memory.toJSON(), 'memory_'),
        };
    }

    static printOrdered(ms: MeasureShell[], orderBy: 'avg' | 'min' | 'max' = 'avg', order: 'ASC' | 'DESC' = 'DESC') {
        const mult = order === 'ASC' ? 1 : -1;
        ms.sort((a, b) => mult * (a.duration[orderBy] - b.duration[orderBy]));

        const table = Object.fromEntries(ms.map(m => ([m.label, m.duration])));

        console.table(table, ['avg', 'min', 'max', 'count']);
    }
}

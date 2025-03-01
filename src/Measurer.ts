import printab from 'printab';
import { sortByOrder, OrderBy } from 'printab/dist/helpers/common';
import { Helpers } from "./helpers";
import { TMeasureShellOptions, MeasureShell } from "./Shell";
import { Measurement } from './Measurement';
import { Timer } from './Timer';

export class Measurer {
    static readonly Timer = Timer;
    static readonly Measurement = Measurement;
    static readonly MeasureShell = MeasureShell;
    static readonly Helpers = Helpers;

    readonly label?: string;
    readonly shells: MeasureShell[] = [];

    constructor(label: string, shells: (MeasureShell | TMeasureShellOptions)[])
    constructor(shells: (MeasureShell | TMeasureShellOptions)[], label?: string)
    constructor(arg1: any, arg2: any) {
        let shells: (MeasureShell | TMeasureShellOptions)[];

        if (typeof arg1 === 'string') {
            this.label = arg1;
            shells = arg2;
        } else {
            this.label = arg2;
            shells = arg1;
        }

        for (const shell of shells) {
            if (shell instanceof MeasureShell) {
                this.shells.push(shell);
            } else {
                this.shells.push(new MeasureShell(shell));
            }
        }
    }

    reset() {
        for (const shell of this.shells) {
            shell.reset();
        }

        return this;
    }

    private parseMeasuringOptions(options: number | {
        seriesCount: number;
        seriesLength: number;
        delay?: number;
    }) {
        if (typeof options === 'number') {
            const log10 = Math.log10(options);
            let seriesLength = Math.max(1, Math.trunc(10 ** (log10 * 0.75)));
            let seriesCount = Math.max(1, Math.trunc(10 ** (log10 * 0.25)));

            return {
                seriesLength,
                seriesCount,
                delay: 100,
            };
        }

        return {
            delay: 100,
            ...options,
        };
    }

    warmup(options: number | {
        seriesCount: number;
        seriesLength: number;
    }) {
        options = this.parseMeasuringOptions(options);

        for (let i=0; i<options.seriesCount; ++i) {
            for (const shell of this.shells) {
                shell.warmup(options.seriesLength);
            }
        }

        return this;
    }

    async warmupAsync(options: number | {
        seriesCount: number;
        seriesLength: number;
        delay?: number;
    }) {
        options = this.parseMeasuringOptions(options);

        for (let i=0; i<options.seriesCount; ++i) {
            for (const shell of this.shells) {
                await shell.warmupAsync(options.seriesLength);
            }

            await Helpers.sleep(options.delay ?? 0);
        }

        return this;
    }

    measure(options: number | {
        seriesCount: number;
        seriesLength: number;
    }) {
        options = this.parseMeasuringOptions(options);

        for (let i=0; i<options.seriesCount; ++i) {
            for (const shell of this.shells) {
                shell.measure(options.seriesLength);
            }
        }

        return this;
    }

    printResult({
        timeResolution = 'us',
        memoryResolution = 'B',
        decimals = 3,
        order,
    }: {
        timeResolution?: 's' | 'ms' | 'us' | 'ns';
        memoryResolution?: 'B' | 'KB' | 'MB' | 'GB';
        decimals?: number;
        order?: OrderBy<keyof ReturnType<MeasureShell['toJSON']>>[];
    } = {}) {
        order ??= [];

        if (order.length === 0) {
            order.push(
                { field: 'duration_avg' },
                { field: 'duration_max' },
                { field: 'duration_min' },
            );
        }

        order[0] ??= { field: 'duration_avg', order: 'asc' };
        const shells = this.shells.map(shell => shell.toJSON());

        sortByOrder(shells, order, true);
        
        const timeMult = { s: 1e-3, ms: 1, us: 1e3, ns: 1e6 }[timeResolution];
        const memMult = 1 / ({ B: 1, KB: 1e3, MB: 1e6, GB: 1e9 }[memoryResolution]);

        const base = shells[0];

        for (const shell of shells) {
            base.duration_avg = Math.min(base.duration_avg, shell.duration_avg);
            base.duration_min = Math.min(base.duration_min, shell.duration_min);
            base.duration_max = Math.min(base.duration_max, shell.duration_max);
        }

        printab(shells, {
            header: {
                name: `${this.label}. Time resolution: ${timeResolution}. Memory resolution: ${memoryResolution}. Per unit count: ${this.shells[0].cnt}`,
                color: 'yellow',
            },
            number: { decimals },
            columns: [
                'label',
                { header: 'Duration:', transform: () => '', align: 'left' },
                { header: 'avg', field: 'duration_avg', align: 'number', number: { multiplier: timeMult } },
                { header: 'avg%', transform: (r) => `x ${r.duration_avg/base.duration_avg}`, color:'green', align: 'number' },
                { header: 'min', field: 'duration_min', align: 'number', number: { multiplier: timeMult } },
                { header: 'min%', transform: (r) => `x ${r.duration_min/base.duration_min}`, color:'green', align: 'number' },
                { header: 'max', field: 'duration_max', align: 'number', number: { multiplier: timeMult } },
                { header: 'max%', transform: (r) => `x ${r.duration_max/base.duration_max}`, color:'green', align: 'number' },
                { header: 'Memory:', transform: () => '', align: 'left' },
                { header: 'avg', field:'memory_avg', color:'yellow', align:'number', number: { multiplier: memMult } },
                { header: 'min', field:'memory_min', color:'yellow', align:'number', number: { multiplier: memMult } },
                { header: 'max', field:'memory_max', color:'yellow', align:'number', number: { multiplier: memMult } },
            ],
        });

        return this;
    }
}

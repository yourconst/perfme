export class Measurement {
    min: number;
    max: number;
    sum: number;
    cnt: number;

    constructor(public label?: string) {
        this.reset();
    }

    get avg() {
        return this.sum / this.cnt;
    }

    reset() {
        this.min = Infinity;
        this.max = 0;
        this.sum = 0;
        this.cnt = 0;

        return this;
    }

    update(v: number, cnt = 1) {
        this.max = Math.max(this.max, v / cnt);
        this.min = Math.min(this.min, v / cnt);
        this.sum += v;
        this.cnt += cnt;

        return this;
    }

    concat(m: Measurement) {
        this.max = Math.max(this.max, m.max);
        this.min = Math.min(this.min, m.min);
        this.sum += m.sum;
        this.cnt += m.cnt;

        return this;
    }

    toJSON() {
        return {
            label: this.label,
            avg: this.avg,
            min: this.min,
            max: this.max,
            sum: this.sum,
            cnt: this.cnt,
        };
    }
}

function getHeapUsedSize() {
    return console?.['memory']?.usedJSHeapSize ?? process?.memoryUsage?.()?.heapUsed ?? 0;
}

export class MemoryMeasurer {
    private _startValue: number;

    start() {
        this._startValue = getHeapUsedSize();
        return this;
    }

    getValue() {
        return getHeapUsedSize() - this._startValue;
    }
}

// node -r ts-node/register --expose-gc  --max-old-space-size=5000 --max-semi-space-size=1000 --noconcurrent_sweeping ./tests/number/float64.ts BB trc=100 tc=1000

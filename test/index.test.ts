import Measurer from '../src';

let num = Measurer.Helpers.randUInt();

new Measurer('TEST', [
    function first() {
        for (let i=0; i<Measurer.Helpers.randUInt(10000); ++i) {
            num = num ** 2;
            num %= Measurer.Helpers.randUInt();
        }
    },
    function second() {
        for (let i=0; i<Measurer.Helpers.randUInt(10000); ++i) {
            num = num ** 2;
            num %= Measurer.Helpers.randUInt();
        }
    },
    function fourth() {
        for (let i=0; i<Measurer.Helpers.randUInt(10000); ++i) {
            num = num ** 2;
            num %= Measurer.Helpers.randUInt();
        }
    },
]).warmup(1000).measure(10000).printResult({ timeResolution: 'us', memoryResolution: 'KB' });

console.log(num);

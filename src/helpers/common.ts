export const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

export const randUInt = (max: number = Number.MAX_SAFE_INTEGER) => Math.trunc(max * Math.random());

export const generateArray = <T>(count: number, generator: (index?: number) => T) => {
    return new Array(count).fill(1).map((_, index) => generator(index));
};

export const createCycleIndexRunner = (length: number) => {
    let i = 0;
    return () => (i++) % length;
};

export const createRandomIndexRunner = (length: number) => {
    return () => randUInt(length);
};

export const createCycleArrayRunner = <T>(array: T[]) => {
    let i = 0;
    return () => array[(i++) % array.length];
};

export const createRandomArrayRunner = <T>(array: T[]) => {
    return () => array[randUInt(array.length)];
};

export function setKeysPrefix<O extends {[key:string]:any}, P extends string>(o: O, prefix: P): {
    [key in keyof O as key extends string | number ? `${P}${key}` : key]: O[key];
} {
    return <any>Object.fromEntries(Object.entries(o).map(([key, value]) => ([prefix+key, value])));
}

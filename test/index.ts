import { describe, measure, measureSettings } from '../dist';

measureSettings({
  seriesSize: 10000,
});

describe('Reducing', () => {
  describe('Objects', () => {
    const dataGen = (size: number) => new Array(size).fill(1).map(() => ({ value: Math.random() }));

    type A = ReturnType<typeof dataGen>;
  
    measure('reduce', (array: A) => {
      return array.reduce((acc, value) => acc + value.value, 0);
    }, dataGen);
  
    measure('reduceRight', (array: A) => {
      return array.reduceRight((acc, value) => acc + value.value, 0);
    }, dataGen);
  
    measure('for of', (array: A) => {
      let result = 0;

      for (const value of array) {
        result += value.value;
      }

      return result;
    }, dataGen);
  
    measure('for', (array: A) => {
      let result = 0;

      for (let i=0; i<array.length; ++i) {
        result += array[i].value;
      }

      return result;
    }, dataGen);
  });

  describe('Numbers', () => {
    const dataGen = (size: number) => new Array(size).fill(1).map(() => Math.random());

    type A = ReturnType<typeof dataGen>;
  
    measure('reduce', (array: A) => {
      return array.reduce((acc, value) => acc + value, 0);
    }, dataGen);
  
    measure('reduceRight', (array: A) => {
      return array.reduceRight((acc, value) => acc + value, 0);
    }, dataGen);
  
    measure('for of', (array: A) => {
      let result = 0;

      for (const value of array) {
        result += value;
      }

      return result;
    }, dataGen);
  
    measure('for', (array: A) => {
      let result = 0;

      for (let i=0; i<array.length; ++i) {
        result += array[i];
      }

      return result;
    }, dataGen);
  });
});

describe('New Array filling', () => {
describe('New Array filling', () => {
describe('New Array filling', () => {
describe('Objects', () => {
  const dataGen = (size: number) => size;
  const elemGen = () => ({ hello: Math.random() });

  measure('Array.from', (size: number) => {
    return Array.from({ length: size }, () => elemGen());
  }, dataGen);

  measure('new Array with size and fill 1 map', (size: number) => {
    return new Array(size).fill(1).map(() => elemGen());
  }, dataGen);

  measure('new Array with size', (size: number) => {
    const array = new Array(size);

    for (let i=0; i<size; ++i) {
      array[i] = elemGen();
    }
    
    return array;
  }, dataGen);

  measure('new Array', (size: number) => {
    const array = new Array();

    for (let i=0; i<size; ++i) {
      array[i] = elemGen();
    }
    
    return array;
  }, dataGen);

  measure('braces', (size: number) => {
    const array: any[] = [];

    for (let i=0; i<size; ++i) {
      array[i] = elemGen();
    }
    
    return array;
  }, dataGen);
});
describe('Numbers', () => {
  const dataGen = (size: number) => size;
  const elemGen = () => Math.random();

  measure('Array.from', (size: number) => {
    return Array.from({ length: size }, () => elemGen());
  }, dataGen);

  measure('new Array with size and fill 1 map', (size: number) => {
    return new Array(size).fill(1).map(() => elemGen());
  }, dataGen);

  measure('new Array with size', (size: number) => {
    const array = new Array(size);

    for (let i=0; i<size; ++i) {
      array[i] = elemGen();
    }
    
    return array;
  }, dataGen);

  measure('new Array', (size: number) => {
    const array = new Array();

    for (let i=0; i<size; ++i) {
      array[i] = elemGen();
    }
    
    return array;
  }, dataGen);

  measure('braces', (size: number) => {
    const array: any[] = [];

    for (let i=0; i<size; ++i) {
      array[i] = elemGen();
    }
    
    return array;
  }, dataGen);
});
});
});
});

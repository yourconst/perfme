# perfme

Library for measuring and comparing function performance with interactive web interface.

## Installation

```bash
npm install perfme
```

## Web interface

![Screenshot](https://raw.githubusercontent.com/yourconst/perfme/main/images/page.screenshot.png)

## Usage

### 1. Create a test file

Create a file (e.g., `tests/perfs/index.ts`) that registers functions to measure:

```typescript
import { describe, measure, measureAsync } from 'perfme';

describe('Encoding', () => {
  describe('JSON', () => {
    measure('stringify', (datum) => JSON.stringify(datum), (size) => Array.from({ length: size }, () => Math.random()));
    measure('stringifyFast', (datum) => String(datum), (size) => Array.from({ length: size }, () => Math.random()));
  });
  
  describe('Binary', () => {
    measure('protobuf', (datum) => encodeProtobuf(datum), (size) => generateData(size));
    measureAsync('asyncEncoder', async (datum) => await encodeAsync(datum), (size) => generateData(size));
  });
});
```

### 2. Run the measurement tool

```bash
npx perfme ./tests/perfs/index.ts
```

Or use glob patterns to run multiple test files:

```bash
npx perfme ./tests/perfs/**/*.ts
npx perfme ./tests/perfs/*.perf.ts
```

**Note:** Garbage collection (GC) is automatically enabled. The "Force GC before each series" option in the UI will work when enabled.

**Options:**
- `-jf, --join-files` - Join files without wrapping each in a `describe` block
- `--port, -p <number>` - Server port (default: 3000 or find free port)
- `--data-unit-sizes <numbers>` - Comma-separated data unit sizes (e.g., "1,2,3,10,100")
- `--data-units-count <number>` - Number of data units (default: 100)
- `--series-size <number>` - Series size (default: 1000)
- `--series-count <number>` - Series count (default: 10)
- `--delay <number>` - Delay between series in ms (default: 1)

**Examples:**
```bash
npx perfme ./tests/perfs/index.ts
npx perfme ./tests/perfs/**/*.ts
npx perfme ./tests/perfs/*.perf.ts -jf
npx perfme ./tests/perfs/index.ts --port 8080
npx perfme ./tests/perfs/index.ts --data-unit-sizes "10,100,1000" --series-count 20
```

### 3. Use the web interface

- Select which functions to measure
- Configure measurement settings (data sizes, iterations, etc.)
- Choose execution mode (Frontend Worker or Backend Server)
- Enable memory measurement (backend only)
- Start measurements and view real-time graphs
- View aggregate statistics across multiple measurements

## API

### `describe(title: string, runner: () => void)`

Create a hierarchical test structure (similar to Jest).

- `title`: Group or subgroup name
- `runner`: Function containing nested `describe`, `measure`, or `evaluate` calls

**Rules:**
- All titles at the same level must be unique
- Cannot mix `measure` and `evaluate` in the same `describe` block
- Can nest `describe` blocks at any level

### `measure(title: string, fn: (datum: any) => any, dataGenerator: (size: number) => any)`

Register a synchronous function for measurement.

- `title`: Function title/name
- `fn`: Function to measure `(datum: any) => any`
- `dataGenerator`: Data generator `(size: number) => any`

### `measureAsync(title: string, fn: (datum: any) => Promise<any>, dataGenerator: (size: number) => any)`

Register an asynchronous function for measurement.

- Same parameters as `measure`, but `fn` returns `Promise<any>`

### `createCustomChart(options: CustomChartOptions): CustomChart`

Create a custom chart configuration for custom evaluations.

```typescript
const chart = createCustomChart({
  metrics: ['avg', 'min', 'max'],
  view: ['relative', 'absolute'],
  xAxis: ['category', 'linear'],
  yAxisTitle: 'Size (bytes)'
});
```

### `evaluate(customChart: CustomChart, title: string, fn: (data: any) => number, dataGenerator: (size: number) => any)`

Register a custom evaluation function that returns a numeric value.

- `customChart`: Chart configuration from `createCustomChart`
- `title`: Evaluation title/name
- `fn`: Function that returns a number `(data: any) => number`
- `dataGenerator`: Data generator `(size: number) => any`

**Note:** Cannot be mixed with `measure` in the same `describe` block.

### `aggregateMeasure(title: string, path: (undefined | string | string[])[], options?: AggregateChartOptions)`

Create an aggregate chart that combines data from multiple `measure` functions.

```typescript
aggregateMeasure('All Encoders', [undefined, ['JSON', 'Binary']], {
  metrics: ['avg', 'min', 'max'],
  xAxis: ['category', 'linear'],
  mode: ['ops', 'duration', 'memory']
});
```

- `title`: Chart title
- `path`: Pattern to match measurements. Use `undefined` to match any, `string` for exact match, `string[]` for multiple options
- `options`: Chart options (metrics, xAxis, mode)

**Note:** Aggregate charts always use relative view (percentages).

### `aggregateEvaluate(customChart: CustomChart, title: string, path: (undefined | string | string[])[], options?: AggregateChartOptions)`

Create an aggregate chart that combines data from multiple `evaluate` functions.

```typescript
aggregateEvaluate(chart, 'All Evaluations', [undefined, 'Size'], {
  metrics: ['avg', 'min', 'max'],
  xAxis: ['category', 'linear']
});
```

**Note:** Aggregate charts always use relative view (percentages).

### `setStyles(options: StyleOptions)`

Configure styles for chart lines.

```typescript
setStyles({
  defaultLine: {
    color: '#3498db',
    width: 2
  },
  lines: {
    'myFunc1': {
      color: '#e74c3c',
      width: 3
    },
    'myFunc2': {
      color: '#2ecc71'
    }
  }
});
```

Styles are deeply merged, with later calls taking precedence.

### `measureSettings(options: MeasureSettings)`

Configure default measurement settings.

```typescript
measureSettings({
  port: 3000,
  dataUnitSizes: [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 1000],
  dataUnitsCount: 100,
  seriesSize: 1000,
  seriesCount: 10,
  delay: 1
});
```

## Features

### Measurement Modes

- **Frontend Worker**: Run measurements in a Web Worker (browser only)
- **Backend Server**: Run measurements on Node.js server (supports memory measurement)

### Visualization Options

- **Metrics**: Average, minimum, or maximum values
- **View**: Absolute or relative values (relative shows percentages)
- **Mode**: Operations per second, duration, or memory usage
- **X-axis**: Category (discrete) or linear (continuous)

### Memory Measurement

- Available only in backend mode
- Configurable number of memory measurements
- Automatic garbage collection before each measurement
- Shows average, minimum, and maximum memory usage

### Aggregate Statistics

- Combine data from multiple measurements across different `describe` blocks
- Separate aggregate charts for `measure` and `evaluate` functions
- Automatic percentage calculation based on maximum value per data size
- Grouped by function title (last element of path)

### Interactive Charts

- Real-time progress tracking
- Zoom and pan functionality
- Multiple visualization modes
- Dark/light theme support
- Customizable line styles

### Additional Features

- Hierarchical test structure with `describe` blocks
- Support for multiple test files via glob patterns
- Automatic garbage collection support
- Settings persistence in localStorage
- Skip and repeat measurements for specific groups
- High-resolution timing (hrtime on Node.js, performance.now in browser)

## Examples

### Basic Example

```typescript
import { describe, measure } from 'perfme';

describe('String Operations', () => {
  measure('concat', (str) => str + 'suffix', (size) => 'a'.repeat(size));
  measure('template', (str) => `${str}suffix`, (size) => 'a'.repeat(size));
});
```

### Custom Evaluation

```typescript
import { describe, createCustomChart, evaluate } from 'perfme';

const sizeChart = createCustomChart({
  yAxisTitle: 'Size (bytes)'
});

describe('Serialization', () => {
  evaluate(sizeChart, 'JSON Size', (data) => JSON.stringify(data).length, (size) => ({ value: size }));
  evaluate(sizeChart, 'Protobuf Size', (data) => encodeProtobuf(data).length, (size) => ({ value: size }));
});
```

### Aggregate Charts

```typescript
import { describe, measure, aggregateMeasure } from 'perfme';

describe('Encoding', () => {
  describe('JSON', () => {
    measure('stringify', ...);
  });
  describe('Binary', () => {
    measure('protobuf', ...);
  });
});

// Aggregate all encoding functions
aggregateMeasure('All Encoders', [undefined, ['JSON', 'Binary']]);
```

## License

MIT

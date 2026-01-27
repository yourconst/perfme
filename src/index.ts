import { MeasureSettings, RegisteredFunction, MeasurementConfig, ProgressCallback, CustomChart, CustomChartOptions, CustomEvaluation, StyleOptions, StyleSettings, DescribeNode, MeasureNode, EvaluateNode, TestNode, AggregateMeasureChart, AggregateEvaluateChart, AggregateChartOptions } from './types';

// Global registry
const registeredFunctions: RegisteredFunction[] = [];
const customCharts: CustomChart[] = [];
const customEvaluations: CustomEvaluation[] = [];
const aggregateMeasureCharts: AggregateMeasureChart[] = [];
const aggregateEvaluateCharts: AggregateEvaluateChart[] = [];
let customChartIdCounter = 0;
let aggregateChartOrderCounter = 0;
let globalSettings: MeasureSettings = {
  port: 3000,
  dataUnitSizes: [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 1000],
  dataUnitsCount: 100,
  seriesSize: 1000,
  seriesCount: 10,
  delay: 1,
};

// Global style settings
let globalStyles: StyleSettings = {
  lines: {},
};

// Hierarchical test structure
const rootNode: DescribeNode = {
  type: 'describe',
  title: '__root__',
  path: [],
  children: [],
};

// Context stack for describe blocks
let describeContextStack: DescribeNode[] = [rootNode];

/**
 * Configure measurement settings
 */
export function measureSettings(options: MeasureSettings): void {
  globalSettings = { ...globalSettings, ...options };
}

/**
 * Create a describe block (similar to jest)
 */
export function describe(title: string, runner: () => void): void {
  if (!title || typeof title !== 'string') {
    throw new Error('describe: title must be a non-empty string');
  }
  if (typeof runner !== 'function') {
    throw new Error('describe: runner must be a function');
  }

  const currentContext = describeContextStack[describeContextStack.length - 1];
  const path = [...currentContext.path, title];

  // Check for duplicate title at this level
  const duplicate = currentContext.children.find(
    child => child.title === title
  );
  if (duplicate) {
    throw new Error(
      `Duplicate title "${title}" at path ${path.slice(0, -1).join(' > ') || 'root'}. All titles at the same level must be unique.`
    );
  }

  // Check if current context has mixed measure and evaluate
  const hasMeasure = currentContext.children.some(c => c.type === 'measure');
  const hasEvaluate = currentContext.children.some(c => c.type === 'evaluate');
  if (hasMeasure && hasEvaluate) {
    throw new Error(
      `Cannot mix measure and evaluate in the same describe block at path ${path.slice(0, -1).join(' > ') || 'root'}.`
    );
  }

  const describeNode: DescribeNode = {
    type: 'describe',
    title,
    path,
    children: [],
  };

  currentContext.children.push(describeNode);
  describeContextStack.push(describeNode);

  try {
    runner();
  } finally {
    describeContextStack.pop();
  }
}

/**
 * Register a synchronous function for measurement
 */
export function measure(
  title: string,
  fn: (datum: any) => any,
  dataGenerator: (size: number) => any
): void {
  if (!title || typeof title !== 'string') {
    throw new Error('measure: title must be a non-empty string');
  }
  if (typeof fn !== 'function') {
    throw new Error('measure: fn must be a function');
  }
  if (typeof dataGenerator !== 'function') {
    throw new Error('measure: dataGenerator must be a function');
  }

  const currentContext = describeContextStack[describeContextStack.length - 1];
  const path = [...currentContext.path, title];

  // Check for duplicate title at this level
  const duplicate = currentContext.children.find(
    child => child.title === title
  );
  if (duplicate) {
    throw new Error(
      `Duplicate title "${title}" at path ${path.slice(0, -1).join(' > ') || 'root'}. All titles at the same level must be unique.`
    );
  }

  // Check if current context has evaluate (cannot mix)
  const hasEvaluate = currentContext.children.some(c => c.type === 'evaluate');
  if (hasEvaluate) {
    throw new Error(
      `Cannot mix measure and evaluate in the same describe block at path ${path.slice(0, -1).join(' > ') || 'root'}.`
    );
  }

  const measureNode: MeasureNode = {
    type: 'measure',
    title,
    path,
    fn,
    dataGenerator,
    isAsync: false,
  };

  currentContext.children.push(measureNode);

  // Also register in legacy format for backward compatibility
  // Convert path to group/subGroup/title format
  // group = first level (first describe)
  // subGroup = last describe before measure (second-to-last element), or first describe if measure is directly in it
  // title = measure name (last element)
  const group = path.length > 0 ? path[0] : 'default';
  const subGroup = path.length > 1 ? path[path.length - 2] : path[0] || 'default';
  const fullTitle = title;

  registeredFunctions.push({
    group,
    subGroup,
    title: fullTitle,
    fn,
    dataGenerator,
    isAsync: false,
    path,
  });
}

/**
 * Register an asynchronous function for measurement
 */
export function measureAsync(
  title: string,
  fn: (datum: any) => Promise<any>,
  dataGenerator: (size: number) => any
): void {
  if (!title || typeof title !== 'string') {
    throw new Error('measureAsync: title must be a non-empty string');
  }
  if (typeof fn !== 'function') {
    throw new Error('measureAsync: fn must be a function');
  }
  if (typeof dataGenerator !== 'function') {
    throw new Error('measureAsync: dataGenerator must be a function');
  }

  const currentContext = describeContextStack[describeContextStack.length - 1];
  const path = [...currentContext.path, title];

  // Check for duplicate title at this level
  const duplicate = currentContext.children.find(
    child => child.title === title
  );
  if (duplicate) {
    throw new Error(
      `Duplicate title "${title}" at path ${path.slice(0, -1).join(' > ') || 'root'}. All titles at the same level must be unique.`
    );
  }

  // Check if current context has evaluate (cannot mix)
  const hasEvaluate = currentContext.children.some(c => c.type === 'evaluate');
  if (hasEvaluate) {
    throw new Error(
      `Cannot mix measure and evaluate in the same describe block at path ${path.slice(0, -1).join(' > ') || 'root'}.`
    );
  }

  const measureNode: MeasureNode = {
    type: 'measure',
    title,
    path,
    fn: fn as any,
    dataGenerator,
    isAsync: true,
  };

  currentContext.children.push(measureNode);

  // Also register in legacy format
  // group = first level (first describe)
  // subGroup = last describe before measure (second-to-last element), or first describe if measure is directly in it
  // title = measure name (last element)
  const group = path.length > 0 ? path[0] : 'default';
  const subGroup = path.length > 1 ? path[path.length - 2] : path[0] || 'default';
  const fullTitle = title;

  registeredFunctions.push({
    group,
    subGroup,
    title: fullTitle,
    fn: fn as any,
    dataGenerator,
    isAsync: true,
    path,
  });
}

/**
 * Get all registered functions
 */
export function getRegisteredFunctions(): RegisteredFunction[] {
  return [...registeredFunctions];
}

/**
 * Get hierarchical test structure
 */
export function getTestHierarchy(): DescribeNode {
  return rootNode;
}

/**
 * Get current settings
 */
export function getSettings(): MeasureSettings {
  return { ...globalSettings };
}

/**
 * Create a custom chart configuration
 */
export function createCustomChart(options: CustomChartOptions): CustomChart {
  const chart: CustomChart = {
    id: `custom_${customChartIdCounter++}`,
    options: {
      metrics: options.metrics || ['avg', 'min', 'max'],
      view: options.view || ['relative', 'absolute'],
      xAxis: options.xAxis || ['category', 'linear'],
      yAxisTitle: options.yAxisTitle,
    },
  };
  customCharts.push(chart);
  return chart;
}

/**
 * Register a custom evaluation function
 */
export function evaluate(
  customChart: CustomChart,
  title: string,
  fn: (data: any) => number,
  dataGenerator: (size: number) => any
): void {
  if (!title || typeof title !== 'string') {
    throw new Error('evaluate: title must be a non-empty string');
  }
  if (typeof fn !== 'function') {
    throw new Error('evaluate: fn must be a function');
  }
  if (typeof dataGenerator !== 'function') {
    throw new Error('evaluate: dataGenerator must be a function');
  }

  const currentContext = describeContextStack[describeContextStack.length - 1];
  const path = [...currentContext.path, title];

  // Check for duplicate title at this level
  const duplicate = currentContext.children.find(
    child => child.title === title
  );
  if (duplicate) {
    throw new Error(
      `Duplicate title "${title}" at path ${path.slice(0, -1).join(' > ') || 'root'}. All titles at the same level must be unique.`
    );
  }

  // Check if current context has measure (cannot mix)
  const hasMeasure = currentContext.children.some(c => c.type === 'measure');
  if (hasMeasure) {
    throw new Error(
      `Cannot mix measure and evaluate in the same describe block at path ${path.slice(0, -1).join(' > ') || 'root'}.`
    );
  }

  const evaluateNode: EvaluateNode = {
    type: 'evaluate',
    title,
    path,
    customChart,
    fn,
    dataGenerator,
  };

  currentContext.children.push(evaluateNode);

  // Also register in legacy format
  // group = first level (first describe)
  // subGroup = last describe before evaluate (second-to-last element), or first describe if evaluate is directly in it
  // title = evaluate name (last element)
  const group = path.length > 0 ? path[0] : 'default';
  const subGroup = path.length > 1 ? path[path.length - 2] : path[0] || 'default';
  const fullTitle = title;

  customEvaluations.push({
    customChart,
    group,
    subGroup,
    title: fullTitle,
    fn,
    dataGenerator,
    path,
  });
}

/**
 * Get all custom charts
 */
export function getCustomCharts(): CustomChart[] {
  return [...customCharts];
}

/**
 * Get all custom evaluations
 */
export function getCustomEvaluations(): CustomEvaluation[] {
  return [...customEvaluations];
}

/**
 * Deep merge utility function
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {} as any, source[key] as any);
    } else if (source[key] !== undefined) {
      result[key] = source[key] as any;
    }
  }
  return result;
}

/**
 * Set styles for chart lines
 * Can be called multiple times - styles are deeply merged, with later calls taking precedence
 */
export function setStyles(options: StyleOptions): void {
  // Deep merge defaultLine
  if (options.defaultLine) {
    globalStyles.defaultLine = deepMerge(
      globalStyles.defaultLine || {},
      options.defaultLine
    );
  }

  // Deep merge lines
  if (options.lines) {
    for (const title in options.lines) {
      if (options.lines[title]) {
        globalStyles.lines[title] = deepMerge(
          globalStyles.lines[title] || {},
          options.lines[title]
        );
      }
    }
  }
}

/**
 * Get current style settings
 */
export function getStyles(): StyleSettings {
  return {
    defaultLine: globalStyles.defaultLine ? { ...globalStyles.defaultLine } : undefined,
    lines: { ...globalStyles.lines },
  };
}

/**
 * Create an aggregate chart for measures
 * Aggregates data from all measurements that match the path pattern
 */
export function aggregateMeasure(
  title: string,
  path: (undefined | string | string[])[],
  options?: AggregateChartOptions
): void {
  if (!title || typeof title !== 'string') {
    throw new Error('aggregateMeasure: title must be a non-empty string');
  }
  if (!Array.isArray(path)) {
    throw new Error('aggregateMeasure: path must be an array');
  }

  const chart: AggregateMeasureChart = {
    id: `aggregate_measure_${aggregateChartOrderCounter++}`,
    title,
    path,
    options: {
      metrics: options?.metrics || ['avg', 'min', 'max'],
      xAxis: options?.xAxis || ['category', 'linear'],
      mode: options?.mode || ['ops', 'duration', 'memory'],
    },
    order: aggregateChartOrderCounter - 1,
  };

  aggregateMeasureCharts.push(chart);
}

/**
 * Create an aggregate chart for evaluations
 * Aggregates data from all evaluations that match the path pattern
 */
export function aggregateEvaluate(
  customChart: CustomChart,
  title: string,
  path: (undefined | string | string[])[],
  options?: AggregateChartOptions
): void {
  if (!customChart || typeof customChart !== 'object') {
    throw new Error('aggregateEvaluate: customChart must be a CustomChart object');
  }
  if (!title || typeof title !== 'string') {
    throw new Error('aggregateEvaluate: title must be a non-empty string');
  }
  if (!Array.isArray(path)) {
    throw new Error('aggregateEvaluate: path must be an array');
  }

  const chart: AggregateEvaluateChart = {
    id: `aggregate_evaluate_${aggregateChartOrderCounter++}`,
    customChart,
    title,
    path,
    options: {
      metrics: options?.metrics || ['avg', 'min', 'max'],
      xAxis: options?.xAxis || ['category', 'linear'],
    },
    order: aggregateChartOrderCounter - 1,
  };

  aggregateEvaluateCharts.push(chart);
}

/**
 * Get all aggregate measure charts
 */
export function getAggregateMeasureCharts(): AggregateMeasureChart[] {
  return [...aggregateMeasureCharts];
}

/**
 * Get all aggregate evaluate charts
 */
export function getAggregateEvaluateCharts(): AggregateEvaluateChart[] {
  return [...aggregateEvaluateCharts];
}

// Export types
export * from './types';

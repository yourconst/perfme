export interface MeasureSettings {
  port?: number;
  dataUnitSizes?: number[];
  dataUnitsCount?: number;
  seriesSize?: number;
  seriesCount?: number;
  delay?: number;
  forceGC?: boolean; // Force garbage collection before each measurement series (backend only)
  memoryMeasurementsCount?: number; // Number of memory measurements to perform (backend only, optional)
}

// Hierarchical structure for describe/measure/evaluate
export interface DescribeNode {
  type: 'describe';
  title: string;
  path: string[]; // Full path from root: ['level1', 'level2', ...]
  children: TestNode[];
}

export interface MeasureNode {
  type: 'measure';
  title: string;
  path: string[]; // Full path from root
  fn: (datum: any) => any;
  dataGenerator: (size: number) => any;
  isAsync: boolean;
}

export interface EvaluateNode {
  type: 'evaluate';
  title: string;
  path: string[]; // Full path from root
  customChart: CustomChart;
  fn: (data: any) => number;
  dataGenerator: (size: number) => any;
}

export type TestNode = DescribeNode | MeasureNode | EvaluateNode;

// Legacy structure for backward compatibility (will be converted from hierarchy)
export interface RegisteredFunction {
  group: string;
  subGroup: string;
  title: string;
  fn: (datum: any) => any;
  dataGenerator: (size: number) => any;
  isAsync?: boolean;
  path?: string[]; // New: hierarchical path
}

export interface MeasurementConfig {
  // Path patterns for filtering measurements
  // Each pattern is an array where each element can be:
  // - undefined: matches any value at this level
  // - string: exact match at this level
  // - string[]: matches any value from the array (OR)
  selectedPaths?: (undefined | string | string[])[][];
  dataUnitSizes?: number[];
  dataUnitsCount?: number;
  seriesSize?: number;
  seriesCount?: number;
  delay?: number;
  forceGC?: boolean; // Force garbage collection before each measurement series (backend only)
  memoryMeasurementsCount?: number; // Number of memory measurements to perform (backend only, optional)
}

export interface MeasurementResult {
  path: string[]; // Full path to the measure/evaluate: ['level1', 'level2', ..., 'measureTitle']
  title: string; // Last element of path (measure/evaluate title)
  dataSize: number;
  series: number[];
  avg: number;
  min: number;
  max: number;
  opsPerSecond: number;
  duration: number; // milliseconds
  durationMin?: number; // milliseconds
  durationMax?: number; // milliseconds
  memory?: number[]; // Memory usage in bytes for each series
  memoryAvg?: number; // Average memory usage in bytes
  memoryMin?: number; // Minimum memory usage in bytes
  memoryMax?: number; // Maximum memory usage in bytes
}

export interface MeasurementProgress {
  path: string[]; // Full path to the measure/evaluate
  title: string; // Last element of path
  dataSize: number;
  progress: number; // 0-100
  result?: MeasurementResult;
}

export type ProgressCallback = (progress: MeasurementProgress) => void;

// Hierarchical info structure
export interface HierarchicalNode {
  type: 'describe' | 'measure' | 'evaluate';
  title: string;
  path: string[];
  children?: HierarchicalNode[];
  customChartId?: string; // For evaluate nodes
}

// Legacy structure (for backward compatibility)
export interface GroupInfo {
  name: string;
  subGroups: SubGroupInfo[];
}

export interface SubGroupInfo {
  name: string;
  titles: string[];
}

export interface CustomChartOptions {
  metrics?: ('avg' | 'min' | 'max')[];
  view?: ('absolute' | 'relative')[];
  xAxis?: ('category' | 'linear')[];
  yAxisTitle: string;
}

export interface CustomChart {
  id: string;
  options: CustomChartOptions;
}

export interface CustomEvaluation {
  customChart: CustomChart;
  group: string;
  subGroup: string;
  title: string;
  fn: (data: any) => number;
  dataGenerator: (size: number) => any;
  path?: string[]; // New: hierarchical path
}

export interface CustomMeasurementResult {
  path: string[]; // Full path to the evaluate: ['level1', 'level2', ..., 'evaluateTitle']
  title: string; // Last element of path (evaluate title)
  dataSize: number;
  values: number[];
  avg: number;
  min: number;
  max: number;
  customChartId: string;
}

export interface LineStyle {
  color?: string;
  width?: number;
}

export interface StyleOptions {
  defaultLine?: LineStyle;
  lines?: {
    [title: string]: LineStyle;
  };
}

export interface StyleSettings {
  defaultLine?: LineStyle;
  lines: {
    [title: string]: LineStyle;
  };
}

export interface AggregateChartOptions {
  metrics?: ('avg' | 'min' | 'max')[];
  xAxis?: ('category' | 'linear')[];
  mode?: ('ops' | 'duration' | 'memory')[]; // For aggregateMeasure only
  // Note: view is always 'relative' for aggregate charts
}

export interface AggregateMeasureChart {
  id: string;
  title: string;
  path: (undefined | string | string[])[];
  options: AggregateChartOptions;
  order: number; // Order of creation (for display order)
}

export interface AggregateEvaluateChart {
  id: string;
  customChart: CustomChart;
  title: string;
  path: (undefined | string | string[])[];
  options: AggregateChartOptions;
  order: number; // Order of creation (for display order)
}

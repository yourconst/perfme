import {
  RegisteredFunction,
  MeasurementConfig,
  MeasurementResult,
  MeasurementProgress,
  ProgressCallback,
  GroupInfo,
  SubGroupInfo,
  CustomEvaluation,
  CustomMeasurementResult,
  HierarchicalNode,
  DescribeNode,
  MeasureNode,
  EvaluateNode,
  TestNode,
} from './types';
import { getRegisteredFunctions, getSettings, getCustomEvaluations, getTestHierarchy } from './index';

// Time measurement utilities
// Prefer hrtime for Node.js (more precise), fallback to performance.now() for browser
// Function is created once at initialization to avoid checks on every call

/**
 * Get current time in milliseconds
 * Uses hrtime in Node.js for better precision, falls back to performance.now() in browser
 */
const getTime: () => number = (() => {
  // Check for Node.js hrtime first (most precise)
  if (typeof process !== 'undefined' && process.hrtime && typeof process.hrtime.bigint === 'function') {
    const hrtime = process.hrtime.bigint;
    // Return function that uses hrtime (nanoseconds to milliseconds)
    return () => Number(hrtime()) / 1_000_000;
  }

  // Fallback to performance API
  let performance: { now: () => number };
  if (typeof globalThis !== 'undefined') {
    // Check for browser window
    if ((globalThis as any).window && (globalThis as any).window.performance) {
      performance = (globalThis as any).window.performance;
    }
    // Check for Web Worker (self)
    else if ((globalThis as any).self && (globalThis as any).self.performance) {
      performance = (globalThis as any).self.performance;
    }
    // Check for global performance (Web API)
    else if ((globalThis as any).performance) {
      performance = (globalThis as any).performance;
    }
    // Fallback to Node.js perf_hooks
    else if (typeof require !== 'undefined') {
      try {
        const perfHooks = require('perf_hooks');
        performance = perfHooks.performance;
      } catch (e) {
        // If require fails, use Date.now() as fallback
        return Date.now;
      }
    } else {
      // Last resort: use Date.now()
      return Date.now;
    }
  } else {
    // Fallback to Date.now()
    return Date.now;
  }

  // Return function that uses performance.now() with proper context
  return () => performance.now();
})();

/**
 * Get current memory usage in bytes
 * Returns heapUsed in Node.js, or browser memory if available
 * 
 * Note: performance.memory API is only available in the main browser thread,
 * not in Web Workers. In Web Workers, this function will return 0.
 * For accurate memory measurements, use backend mode (Node.js).
 */
const getMemoryUsage: () => number = (() => {
  // Check for Node.js memory usage (works in Node.js backend)
  if (typeof process !== 'undefined' && process.memoryUsage && typeof process.memoryUsage === 'function') {
    const memoryUsage = process.memoryUsage;
    return () => {
      const usage = memoryUsage.call(process);
      return usage.heapUsed;
    };
  }
  
  // Check for browser performance.memory (Chrome/Edge, main thread only)
  // This API is NOT available in Web Workers due to browser security restrictions
  if (typeof globalThis !== 'undefined') {
    // Try window.performance first (main thread only)
    if ((globalThis as any).window && (globalThis as any).window.performance && (globalThis as any).window.performance.memory) {
      const perf = (globalThis as any).window.performance;
      return () => perf.memory.usedJSHeapSize;
    }
    // Try self.performance (Web Worker - memory is NOT available here)
    // This check will typically fail in Web Workers
    if ((globalThis as any).self && (globalThis as any).self.performance && (globalThis as any).self.performance.memory) {
      const perf = (globalThis as any).self.performance;
      return () => perf.memory.usedJSHeapSize;
    }
    // Try global performance (main thread only)
    const perf = (globalThis as any).performance;
    if (perf && perf.memory && perf.memory.usedJSHeapSize !== undefined) {
      return () => perf.memory.usedJSHeapSize;
    }
  }
  
  // Fallback: return 0 if memory API is not available
  // This will be the case in Web Workers where performance.memory is not accessible
  return () => 0;
})();

// console.log(globalThis.gc);

/**
 * Force garbage collection if available
 * In Node.js: requires --expose-gc flag
 * In browser: not available (security restriction)
 */
function runGC(): void {
  // Node.js: global.gc() if available (requires --expose-gc flag)
  if (typeof global !== 'undefined' && (global as any).gc && typeof (global as any).gc === 'function') {
    try {
      (global as any).gc();
    } catch (e) {
      // Ignore errors
    }
  }
  // Browser: gc() if available (Chrome DevTools, requires specific flags)
  else if (typeof globalThis !== 'undefined' && (globalThis as any).gc && typeof (globalThis as any).gc === 'function') {
    try {
      (globalThis as any).gc();
    } catch (e) {
      // Ignore errors
    }
  }
  // Web Worker: self.gc() if available
  else if (typeof globalThis !== 'undefined' && (globalThis as any).self && (globalThis as any).self.gc && typeof (globalThis as any).self.gc === 'function') {
    try {
      (globalThis as any).self.gc();
    } catch (e) {
      // Ignore errors
    }
  }
  // If GC is not available, do nothing (silent fail)
}

interface SeriesMeasurement {
  duration: number; // milliseconds
  memory: number; // bytes
}

function measureSeries(seriesSize: number, data: any[], fn: (...params: any[]) => any): number {
  const count = data.length>>>0;

  const startTime = getTime();

  for (let i = 0; i < seriesSize>>>0; ++i) {
    fn(data[i % count]);
  }

  const endTime = getTime();

  return endTime - startTime;
}

async function measureSeriesAsync(seriesSize: number, data: any[], fn: (...params: any[]) => any): Promise<number> {
  const count = data.length>>>0;

  const startTime = getTime();

  for (let i = 0; i < seriesSize>>>0; ++i) {
    await fn(data[i % count]);
  }

  const endTime = getTime();

  return endTime - startTime;
}

function measureSeriesMemory(memoryMeasurementsCount: number, data: any[], fn: (...params: any[]) => any): number[] {
  const count = data.length>>>0;
  const memories: number[] = [];

  for (let i = 0; i < memoryMeasurementsCount>>>0; ++i) {
    runGC();
    const startMemory = getMemoryUsage();
    fn(data[i % count]);
    const endMemory = getMemoryUsage();
    memories.push(Math.max(0, endMemory - startMemory));
  }
  
  return memories;
}

async function measureSeriesMemoryAsync(memoryMeasurementsCount: number, data: any[], fn: (...params: any[]) => any): Promise<number[]> {
  const count = data.length>>>0;
  const memories: number[] = [];

  for (let i = 0; i < memoryMeasurementsCount>>>0; ++i) {
    runGC();
    const startMemory = getMemoryUsage();
    await fn(data[i % count]);
    const endMemory = getMemoryUsage();
    memories.push(Math.max(0, endMemory - startMemory));
  }

  return memories;
}

export class MeasurementEngine {
  private stopRequested: boolean = false;
  private skippedSubGroups: Set<string> = new Set();

  /**
   * Check if a path matches a pattern
   * Pattern format: (undefined | string | string[])[]
   * - undefined: matches any value at this level
   * - string: exact match
   * - string[]: matches any value from array (OR)
   * 
   * Pattern can be shorter than path - we only check the levels specified in pattern.
   * If pattern is longer than path, it doesn't match (path must have at least as many levels).
   */
  private matchesPathPattern(path: string[], pattern: (undefined | string | string[])[]): boolean {
    // Pattern can be shorter than path (we only check specified levels)
    // But if pattern is longer than path, it doesn't match
    if (pattern.length > path.length) return false;
    
    // Check each level in pattern
    for (let i = 0; i < pattern.length; i++) {
      const pathSegment = path[i];
      const patternSegment = pattern[i];
      
      if (patternSegment === undefined) {
        // undefined matches any value
        continue;
      } else if (typeof patternSegment === 'string') {
        // Exact match required
        if (pathSegment !== patternSegment) return false;
      } else if (Array.isArray(patternSegment)) {
        // Must match one of the values in array
        if (!patternSegment.includes(pathSegment)) return false;
      }
    }
    
    return true;
  }

  /**
   * Get hierarchical test structure
   */
  getHierarchy(): HierarchicalNode {
    const root = getTestHierarchy();
    return this.convertNodeToHierarchicalInfo(root);
  }

  /**
   * Convert TestNode to HierarchicalNode
   */
  private convertNodeToHierarchicalInfo(node: any): HierarchicalNode {
    if (node.type === 'describe') {
      return {
        type: 'describe',
        title: node.title,
        path: node.path,
        children: node.children.map((child: any) => this.convertNodeToHierarchicalInfo(child)),
      };
    } else if (node.type === 'measure') {
      return {
        type: 'measure',
        title: node.title,
        path: node.path,
      };
    } else if (node.type === 'evaluate') {
      return {
        type: 'evaluate',
        title: node.title,
        path: node.path,
        customChartId: node.customChart.id,
      };
    }
    throw new Error(`Unknown node type: ${(node as any).type}`);
  }

  /**
   * Get all registered groups, subgroups, and titles (legacy format for backward compatibility)
   */
  getGroups(): GroupInfo[] {
    const functions = getRegisteredFunctions();
    const customEvals = getCustomEvaluations();
    const groupsMap = new Map<string, Map<string, Set<string>>>();
    
    // Add standard functions
    for (const func of functions) {
      if (!groupsMap.has(func.group)) {
        groupsMap.set(func.group, new Map());
      }
      const group = groupsMap.get(func.group)!;

      if (!group.has(func.subGroup)) {
        group.set(func.subGroup, new Set());
      }
      const subGroup = group.get(func.subGroup)!;

      subGroup.add(func.title);
    }

    // Add custom evaluations (they should be shown first in their groups)
    for (const customEval of customEvals) {
      if (!groupsMap.has(customEval.group)) {
        groupsMap.set(customEval.group, new Map());
      }
      const group = groupsMap.get(customEval.group)!;

      if (!group.has(customEval.subGroup)) {
        group.set(customEval.subGroup, new Set());
      }
      const subGroup = group.get(customEval.subGroup)!;

      subGroup.add(customEval.title);
    }

    const result: GroupInfo[] = [];
    for (const [groupName, subGroupsMap] of groupsMap) {
      const subGroups: SubGroupInfo[] = [];
      
      // Separate custom and standard subgroups
      const customSubGroups: SubGroupInfo[] = [];
      const standardSubGroups: SubGroupInfo[] = [];
      
      for (const [subGroupName, titlesSet] of subGroupsMap) {
        const subGroupInfo: SubGroupInfo = {
          name: subGroupName,
          titles: Array.from(titlesSet),
        };
        
        // Check if this subgroup has custom evaluations
        const hasCustom = customEvals.some(customEval => customEval.group === groupName && customEval.subGroup === subGroupName);
        if (hasCustom) {
          customSubGroups.push(subGroupInfo);
        } else {
          standardSubGroups.push(subGroupInfo);
        }
      }
      
      // Custom subgroups first, then standard
      subGroups.push(...customSubGroups, ...standardSubGroups);
      
      result.push({
        name: groupName,
        subGroups,
      });
    }

    return result;
  }

  /**
   * Run all measurements (custom and standard) according to the config
   * Order: pathKey -> (items in declaration order) -> dataSize -> item
   */
  async runMeasurements(
    config: MeasurementConfig,
    onProgress: (progress: MeasurementProgress & { result?: MeasurementResult; customResult?: CustomMeasurementResult }) => void
  ): Promise<void> {
    this.stopRequested = false;
    this.skippedSubGroups.clear();
    const functions = getRegisteredFunctions();
    const customEvals = getCustomEvaluations();
    const settings = getSettings();

    // Apply config overrides
    const dataUnitSizes = config.dataUnitSizes ?? settings.dataUnitSizes ?? [];
    const dataUnitsCount = config.dataUnitsCount ?? settings.dataUnitsCount ?? 100;
    const seriesSize = config.seriesSize ?? settings.seriesSize ?? 1000;
    const seriesCount = config.seriesCount ?? settings.seriesCount ?? 10;
    const delay = config.delay ?? settings.delay ?? 1;
    const forceGC = config.forceGC ?? settings.forceGC ?? false;
    const memoryMeasurementsCount = config.memoryMeasurementsCount ?? settings.memoryMeasurementsCount;

    // Filter functions based on config.selectedPaths
    let filteredFunctions = functions;
    let filteredEvals = customEvals;
    
    // Apply config.selectedPaths if provided
    if (config.selectedPaths && config.selectedPaths.length > 0) {
      filteredFunctions = filteredFunctions.filter((f) => {
        if (!f.path) return false;
        return config.selectedPaths!.some((patternPath) => {
          return this.matchesPathPattern(f.path!, patternPath);
        });
      });
      filteredEvals = filteredEvals.filter((e) => {
        if (!e.path) return false;
        return config.selectedPaths!.some((patternPath) => {
          return this.matchesPathPattern(e.path!, patternPath);
        });
      });
    }

    // Use hierarchical structure to determine declaration order
    // Traverse the tree to collect all measure and evaluate nodes in order
    const hierarchy = getTestHierarchy();
    
    // Collect all measure and evaluate nodes in declaration order
    const orderedNodes: Array<{ type: 'measure' | 'evaluate'; path: string[]; title: string }> = [];
    
    function traverseNode(node: DescribeNode | MeasureNode | EvaluateNode) {
      if (node.type === 'measure' || node.type === 'evaluate') {
        orderedNodes.push({
          type: node.type,
          path: node.path,
          title: node.title,
        });
      } else if (node.type === 'describe') {
        for (const child of node.children) {
          traverseNode(child);
        }
      }
    }
    
    traverseNode(hierarchy);

    // Create maps from path to function/evaluation for quick lookup
    const functionByPath = new Map<string, RegisteredFunction>();
    for (const func of filteredFunctions) {
      if (func.path && func.path.length > 0) {
        const pathKey = func.path.join(' > ');
        functionByPath.set(pathKey, func);
      }
    }
    
    const evalByPath = new Map<string, CustomEvaluation>();
    for (const customEval of filteredEvals) {
      if (customEval.path && customEval.path.length > 0) {
        const pathKey = customEval.path.join(' > ');
        evalByPath.set(pathKey, customEval);
      }
    }

    // Create a unified list of all items (measure and evaluate) in declaration order
    type UnifiedItem = {
      type: 'measure' | 'evaluate';
      registrationIndex: number;
      pathKey: string;
      title: string;
      measure?: RegisteredFunction;
      evaluate?: CustomEvaluation;
    };

    const unifiedItems: UnifiedItem[] = [];
    let registrationIndex = 0;

    // Process nodes in declaration order
    for (const node of orderedNodes) {
      const pathKey = node.path.join(' > ');
      
      if (node.type === 'measure') {
        const func = functionByPath.get(pathKey);
        if (func) {
          const keyPath = node.path.length > 1 ? node.path.slice(0, -1).join(' > ') : node.path[0];
          unifiedItems.push({
            type: 'measure',
            registrationIndex: registrationIndex++,
            pathKey: keyPath,
            title: node.title,
            measure: func,
          });
        }
      } else if (node.type === 'evaluate') {
        const customEval = evalByPath.get(pathKey);
        if (customEval) {
          const keyPath = node.path.length > 1 ? node.path.slice(0, -1).join(' > ') : node.path[0];
          unifiedItems.push({
            type: 'evaluate',
            registrationIndex: registrationIndex++,
            pathKey: keyPath,
            title: node.title,
            evaluate: customEval,
          });
        }
      }
    }

    // Group by pathKey while preserving order within each pathKey
    const itemsByPathKey = new Map<string, UnifiedItem[]>();
    for (const item of unifiedItems) {
      if (!itemsByPathKey.has(item.pathKey)) {
        itemsByPathKey.set(item.pathKey, []);
      }
      itemsByPathKey.get(item.pathKey)!.push(item);
    }

    // Sort items within each pathKey by registration index to preserve declaration order
    for (const items of itemsByPathKey.values()) {
      items.sort((a, b) => a.registrationIndex - b.registrationIndex);
    }

    // Collect all pathKeys in order of first appearance
    const allPathKeys: string[] = [];
    const seenPathKeys = new Set<string>();
    for (const item of unifiedItems) {
      if (!seenPathKeys.has(item.pathKey)) {
        seenPathKeys.add(item.pathKey);
        allPathKeys.push(item.pathKey);
      }
    }

    const dataUnitSizesSum = dataUnitSizes.reduce((acc, v) => acc + v, 0);
    // Calculate total steps for progress (both custom and standard)
    let totalSteps = 0;
    for (const pathKey of allPathKeys) {
      const items = itemsByPathKey.get(pathKey) || [];
      totalSteps += dataUnitSizesSum * items.length;
    }

    let currentStep = 0;

    // Measurement order: pathKey -> (items in declaration order) -> dataSize -> item
    for (const pathKey of allPathKeys) {
      if (this.stopRequested) break;

      const items = itemsByPathKey.get(pathKey) || [];
      if (items.length === 0) continue;

      // Check if this pathKey is skipped
      if (this.skippedSubGroups.has(pathKey)) {
        continue; // Skip this pathKey
      }

      // Check if all items in this pathKey use the same dataGenerator
      const firstItem = items[0];
      const firstDataGenerator = firstItem.type === 'measure' 
        ? firstItem.measure!.dataGenerator 
        : firstItem.evaluate!.dataGenerator;
      const allUseSameGenerator = items.every((item) => {
        const dataGenerator = item.type === 'measure' 
          ? item.measure!.dataGenerator 
          : item.evaluate!.dataGenerator;
        return dataGenerator === firstDataGenerator;
      });

      for (const dataSize of dataUnitSizes) {
        if (this.stopRequested) break;
        
        // Check if this pathKey is skipped (check again in case it was skipped during execution)
        if (this.skippedSubGroups.has(pathKey)) {
          break; // Break out of dataSize loop if pathKey is skipped
        }

        // Generate data once if all items use the same generator
        let sharedDataArray: any[] | null = null;
        if (allUseSameGenerator && firstDataGenerator) {
          sharedDataArray = [];
          for (let i = 0; i < dataUnitsCount; i++) {
            sharedDataArray.push(firstDataGenerator(dataSize));
          }
        }

        // Process items in declaration order
        for (const item of items) {
          if (this.stopRequested) break;
          
          // Check if this pathKey is skipped (check again in case it was skipped during execution)
          if (this.skippedSubGroups.has(pathKey)) {
            break; // Break out of item loop if pathKey is skipped
          }

          if (item.type === 'evaluate') {
            const customEval = item.evaluate!;
            
            // Generate data and evaluate
            const values: number[] = [];
            if (allUseSameGenerator && sharedDataArray) {
              // Use shared data array
              for (let i = 0; i < sharedDataArray.length; i++) {
                const value = customEval.fn(sharedDataArray[i]);
                values.push(value);
              }
            } else {
              // Generate data for each function separately
              for (let i = 0; i < dataUnitsCount; i++) {
                const data = customEval.dataGenerator(dataSize);
                const value = customEval.fn(data);
                values.push(value);
              }
            }

            // Calculate statistics
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);

            const customResult: CustomMeasurementResult = {
              path: customEval.path!,
              title: item.title,
              dataSize,
              values,
              avg,
              min,
              max,
              customChartId: customEval.customChart.id,
            };

            currentStep += dataSize;
            const progress = Math.round((currentStep / totalSteps) * 100);

            onProgress({
              path: customEval.path!,
              title: item.title,
              dataSize,
              progress,
              customResult,
            });
          } else {
            const func = item.measure!;
            
            // Use shared data array if available, otherwise generate new one
            const dataArray: any[] = sharedDataArray || [];
            if (!sharedDataArray) {
              for (let i = 0; i < dataUnitsCount; i++) {
                dataArray.push(func.dataGenerator(dataSize));
              }
            }

            // Run measurement series
            const durations: number[] = [];
            for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex++) {
              if (this.stopRequested) break;

              if (forceGC) {
                runGC();
              }

              const duration = func.isAsync
                ? (await measureSeriesAsync(seriesSize, dataArray, func.fn))
                : measureSeries(seriesSize, dataArray, func.fn);
              durations.push(duration);

              await new Promise((resolve) => setTimeout(resolve, delay));
            }

            // Measure memory only if memoryMeasurementsCount is specified
            let memoryUsages: number[] | undefined;
            let memoryAvg: number | undefined;
            let memoryMin: number | undefined;
            let memoryMax: number | undefined;
            
            if (memoryMeasurementsCount !== undefined && memoryMeasurementsCount > 0) {
              memoryUsages = func.isAsync
                ? (await measureSeriesMemoryAsync(memoryMeasurementsCount, dataArray, func.fn))
                : measureSeriesMemory(memoryMeasurementsCount, dataArray, func.fn);
              
              // Calculate statistics for memory
              memoryAvg = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
              memoryMin = Math.min(...memoryUsages);
              memoryMax = Math.max(...memoryUsages);
            }
            
            // Calculate statistics for duration (per single operation)
            const durationAvg = (durations.reduce((a, b) => a + b, 0) / durations.length) / seriesSize;
            const durationMin = Math.min(...durations) / seriesSize;
            const durationMax = Math.max(...durations) / seriesSize;

            // Calculate statistics for opsPerSecond
            const opsAvg = 1000 / durationAvg;
            const opsMin = 1000 / durationMax;
            const opsMax = 1000 / durationMin;

            const result: MeasurementResult = {
              path: func.path!,
              title: item.title,
              dataSize,
              series: durations.map(duration => 1000 / duration),
              avg: opsAvg,
              min: opsMin,
              max: opsMax,
              opsPerSecond: opsAvg,
              duration: durationAvg,
              durationMin: durationMin,
              durationMax: durationMax,
              memory: memoryUsages,
              memoryAvg: memoryAvg,
              memoryMin: memoryMin,
              memoryMax: memoryMax,
            };

            currentStep += dataSize;
            const progress = Math.round((currentStep / totalSteps) * 100);

            onProgress({
              path: func.path!,
              title: item.title,
              dataSize,
              progress,
              result,
            });
          }
        }
      }
    }
  }

  /**
   * Stop current measurement
   */
  stop(): void {
    this.stopRequested = true;
  }

  /**
   * Skip a pathKey during measurement
   */
  skipPathKey(pathKey: string): void {
    this.skippedSubGroups.add(pathKey);
  }
  
  /**
   * Skip a subgroup during measurement (legacy method, converts to pathKey)
   */
  skipSubGroup(group: string, subGroup: string): void {
    const subgroupKey = `${group}-${subGroup}`;
    this.skippedSubGroups.add(subgroupKey);
  }
}


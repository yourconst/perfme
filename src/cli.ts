#!/usr/bin/env node

import { createServer } from './server';
import { resolve, join, relative } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { measureSettings, describe } from './index';

interface CliOptions {
  port?: number;
  dataUnitSizes?: number[];
  dataUnitsCount?: number;
  seriesSize?: number;
  seriesCount?: number;
  delay?: number;
  joinFiles?: boolean; // -jf flag: join files without wrapping in describe
}

/**
 * Expand glob pattern to array of file paths
 */
function expandGlob(pattern: string): string[] {
  const files: string[] = [];
  
  // Check if it's a direct file path (no wildcards)
  if (!pattern.includes('*') && !pattern.includes('?')) {
    const resolvedPattern = resolve(pattern);
    if (existsSync(resolvedPattern)) {
      const stat = statSync(resolvedPattern);
      if (stat.isFile()) {
        return [resolvedPattern];
      } else if (stat.isDirectory()) {
        // If it's a directory, treat as **/*.ts pattern
        pattern = join(pattern, '**', '*.ts');
      } else {
        return [];
      }
    } else {
      return [];
    }
  }
  
  // Parse pattern: extract base directory and file pattern
  const normalizedPattern = pattern.replace(/\\/g, '/');
  let baseDir: string;
  let filePattern: string;
  
  if (normalizedPattern.includes('**')) {
    // Recursive pattern like tests/**/*.ts
    const lastSlashIndex = normalizedPattern.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      baseDir = '.';
      filePattern = normalizedPattern;
    } else {
      baseDir = normalizedPattern.substring(0, lastSlashIndex);
      filePattern = normalizedPattern.substring(lastSlashIndex + 1);
    }
  } else {
    // Non-recursive pattern like tests/*.ts
    const lastSlashIndex = normalizedPattern.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      baseDir = '.';
      filePattern = normalizedPattern;
    } else {
      baseDir = normalizedPattern.substring(0, lastSlashIndex);
      filePattern = normalizedPattern.substring(lastSlashIndex + 1);
    }
  }
  
  const resolvedBaseDir = resolve(baseDir);
  if (!existsSync(resolvedBaseDir) || !statSync(resolvedBaseDir).isDirectory()) {
    return [];
  }
  
  // Recursive search function
  const isRecursive = normalizedPattern.includes('**');
  function findFiles(dir: string, depth: number = 0, maxDepth: number = 100): void {
    if (depth > maxDepth) return; // Prevent infinite recursion
    
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            // Check if pattern allows recursion
            if (isRecursive) {
              findFiles(fullPath, depth + 1, maxDepth);
            }
          } else if (stat.isFile()) {
            // Match file against pattern
            if (matchesPattern(entry, filePattern)) {
              files.push(resolve(fullPath));
            }
          }
        } catch (e) {
          // Skip entries we can't access
        }
      }
    } catch (e) {
      // Skip directories we can't access
    }
  }
  
  // Start search
  findFiles(resolvedBaseDir);
  
  return files.sort();
}

/**
 * Check if filename matches pattern (supports * and **)
 */
function matchesPattern(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // * matches any characters except /
  // ** matches any characters including /
  // Escape special regex characters
  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*');
  
  const regex = new RegExp('^' + regexPattern + '$');
  return regex.test(filename);
}

function parseArgs(): { testFilePaths: string[]; options: CliOptions } {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: npx perfme <path-to-test-file-or-glob> [options]

Note: Garbage collection (GC) is automatically enabled.
      The "Force GC before each series" option in the UI will work when enabled.

Options:
  --port, -p <number>              Server port (default: 3000 or find free port)
  --data-unit-sizes <numbers>      Comma-separated data unit sizes (e.g., "1,2,3,10,100")
  --data-units-count <number>      Number of data units (default: 100)
  --series-size <number>           Series size (default: 1000)
  --series-count <number>           Series count (default: 10)
  --delay <number>                 Delay between series in ms (default: 1)
  -jf, --join-files                Join files without wrapping each in describe block
  --help, -h                       Show this help message

Examples:
  npx perfme ./tests/perfs/index.ts
  npx perfme ./tests/perfs/**/*.ts
  npx perfme ./tests/perfs/*.perf.ts
  npx perfme ./tests/perfs/**/*.ts -jf
  npx perfme ./tests/perfs/index.ts --port 8080
  npx perfme ./tests/perfs/index.ts --data-unit-sizes "10,100,1000" --series-count 20
`);
    process.exit(0);
  }

  const options: CliOptions = {};
  
  // Collect all file patterns/paths until we hit an option (starts with -- or -)
  // Shell may expand glob patterns, so we need to collect all non-option arguments
  const filePatterns: string[] = [];
  let i = 0;
  
  // Collect all arguments that are not options (don't start with -- or -)
  // Also handle short options like -p, -h, -jf
  // Stop when we hit an option
  while (i < args.length) {
    const arg = args[i];
    // Check if it's an option
    if (arg.startsWith('--') || arg === '-p' || arg === '-h' || arg === '-jf') {
      break;
    }
    // Check if it's a short option that might be followed by a value
    if (arg.startsWith('-') && arg.length > 1 && arg !== '-p' && arg !== '-h' && arg !== '-jf') {
      break;
    }
    filePatterns.push(arg);
    i++;
  }
  
  // If no file patterns found, error
  if (filePatterns.length === 0) {
    console.error('Error: No test file or pattern specified');
    console.error('Use --help to see available options');
    process.exit(1);
  }
  
  // Expand all file patterns
  const testFilePaths: string[] = [];
  for (const pattern of filePatterns) {
    const expanded = expandGlob(pattern);
    testFilePaths.push(...expanded);
  }
  
  // Remove duplicates and sort
  const uniqueFilePaths = Array.from(new Set(testFilePaths)).sort();
  
  if (uniqueFilePaths.length === 0) {
    console.error(`No files found matching pattern(s): ${filePatterns.join(', ')}`);
    process.exit(1);
  }
  
  // Parse flags starting from where we left off
  for (; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      options.port = parseInt(value, 10);
      if (isNaN(options.port)) {
        console.error(`Error: Invalid port value: ${value}`);
        process.exit(1);
      }
    } else if (arg === '--data-unit-sizes') {
      const value = args[++i];
      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      options.dataUnitSizes = value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (options.dataUnitSizes.length === 0) {
        console.error(`Error: Invalid data unit sizes: ${value}`);
        process.exit(1);
      }
    } else if (arg === '--data-units-count') {
      const value = args[++i];
      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      options.dataUnitsCount = parseInt(value, 10);
      if (isNaN(options.dataUnitsCount)) {
        console.error(`Error: Invalid data units count: ${value}`);
        process.exit(1);
      }
    } else if (arg === '--series-size') {
      const value = args[++i];
      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      options.seriesSize = parseInt(value, 10);
      if (isNaN(options.seriesSize)) {
        console.error(`Error: Invalid series size: ${value}`);
        process.exit(1);
      }
    } else if (arg === '--series-count') {
      const value = args[++i];
      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      options.seriesCount = parseInt(value, 10);
      if (isNaN(options.seriesCount)) {
        console.error(`Error: Invalid series count: ${value}`);
        process.exit(1);
      }
    } else if (arg === '--delay') {
      const value = args[++i];
      if (!value) {
        console.error(`Error: ${arg} requires a value`);
        process.exit(1);
      }
      options.delay = parseInt(value, 10);
      if (isNaN(options.delay)) {
        console.error(`Error: Invalid delay: ${value}`);
        process.exit(1);
      }
    } else if (arg === '-jf' || arg === '--join-files') {
      options.joinFiles = true;
    } else {
      console.error(`Error: Unknown option: ${arg}`);
      console.error('Use --help to see available options');
      process.exit(1);
    }
  }

  return { testFilePaths: uniqueFilePaths, options };
}

// Check if we need to restart with --expose-gc flag
const hasExposeGc = process.execArgv.includes('--expose-gc') || 
                    process.argv.includes('--expose-gc') ||
                    typeof (global as any).gc === 'function';

if (!hasExposeGc) {
  // Restart the process with --expose-gc flag
  const { spawn } = require('child_process');
  const nodePath = process.execPath;
  const scriptPath = process.argv[1];
  const args = process.argv.slice(2);
  
  const child = spawn(nodePath, ['--expose-gc', scriptPath, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env
  });
  
  child.on('error', (error: Error) => {
    console.error('Failed to restart with --expose-gc:', error);
    process.exit(1);
  });
  
  child.on('exit', (code: number) => {
    process.exit(code || 0);
  });
  
  // Don't continue with current process - wait for child to exit
  // The child process will handle everything
  process.on('exit', () => {});
} else {
  // GC is available, continue with normal execution
  runCli();
}

function runCli() {
const { testFilePaths, options } = parseArgs();

if (testFilePaths.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

console.log(`Found ${testFilePaths.length} test file(s):`);
testFilePaths.forEach((path, index) => {
  console.log(`  ${index + 1}. ${path}`);
});

// Apply CLI options to settings
if (Object.keys(options).length > 0) {
  const settings: any = {};
  if (options.dataUnitSizes) settings.dataUnitSizes = options.dataUnitSizes;
  if (options.dataUnitsCount) settings.dataUnitsCount = options.dataUnitsCount;
  if (options.seriesSize) settings.seriesSize = options.seriesSize;
  if (options.seriesCount) settings.seriesCount = options.seriesCount;
  if (options.delay !== undefined) settings.delay = options.delay;
  measureSettings(settings);
  console.log('Applied CLI settings:', JSON.stringify(settings, null, 2));
}

// Determine if files are TypeScript
const hasTypeScript = testFilePaths.some(path => path.endsWith('.ts') || path.endsWith('.tsx'));
const projectRoot = join(__dirname, '..');

// Register ts-node if needed (only once)
let tsNodeRegistered = false;
if (hasTypeScript) {
  try {
    require('ts-node').register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
    tsNodeRegistered = true;
  } catch (e) {
    // ts-node might not be available, will try compiled .js files
  }
}

// Load test files
console.log('Loading test files to register functions...');
const shouldWrapInDescribe = testFilePaths.length > 1 && !options.joinFiles;

try {
  for (const testFilePath of testFilePaths) {
    const isTypeScript = testFilePath.endsWith('.ts') || testFilePath.endsWith('.tsx');
    const fileName = relative(process.cwd(), testFilePath);
    
    if (shouldWrapInDescribe) {
      // Wrap each file in a describe block with file name
      describe(fileName, () => {
        loadTestFile(testFilePath, isTypeScript, tsNodeRegistered);
      });
    } else {
      // Load directly without wrapping
      loadTestFile(testFilePath, isTypeScript, tsNodeRegistered);
    }
  }
  console.log('All test files loaded, functions registered');
} catch (error: any) {
  console.error('[CLI Error] Error loading test files:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}

function loadTestFile(testFilePath: string, isTypeScript: boolean, tsNodeRegistered: boolean): void {
  try {
    if (isTypeScript) {
      // Try to find compiled .js file first
      const jsPath = testFilePath.replace(/\.tsx?$/, '.js');
      if (existsSync(jsPath)) {
        require(jsPath);
      } else if (tsNodeRegistered) {
        // Use ts-node to load TypeScript file
        require(testFilePath);
      } else {
        throw new Error('TypeScript file not compiled and ts-node not available. Please either compile the file or install ts-node.');
      }
    } else {
      require(testFilePath);
    }
  } catch (error: any) {
    console.error(`[CLI Error] Error loading test file ${testFilePath}:`, error.message);
    throw error;
  }
}

// Bundle the test files for browser/worker
console.log('Bundling test files for browser...');
bundleTestFiles(testFilePaths, projectRoot, hasTypeScript, shouldWrapInDescribe)
  .then(() => {
    // Start the server
    // Default to 3000 if not specified, or use PORT env var, or find free port
    const port = options.port ?? (parseInt(process.env.PORT || '3000', 10) || 3000);
    createServer(port, testFilePaths[0]); // Pass first file for compatibility
  })
  .catch((error) => {
    console.error('[CLI Error] Error bundling test files:', error);
    if (error.stack) console.error('Stack:', error.stack);
    process.exit(1);
  });

async function bundleTestFiles(
  entryFiles: string[],
  projectRoot: string,
  isTypeScript: boolean,
  wrapInDescribe: boolean
): Promise<void> {
  const outputPath = join(projectRoot, 'dist', 'worker-bundle.js');
  const distDir = join(projectRoot, 'dist');
  
  // Create dist directory if it doesn't exist
  if (!existsSync(distDir)) {
    require('fs').mkdirSync(distDir, { recursive: true });
  }

  // Create worker wrapper for browser
  const workerWrapperPath = join(projectRoot, 'dist', 'worker-wrapper.js');
  
  // Use absolute paths for browserify - it will resolve them correctly
  const entryFilesForBundle = entryFiles.map(entryFile => {
    const normalized = resolve(entryFile).replace(/\\/g, '/');
    
    // For TypeScript files, keep .ts extension (tsify will handle it)
    // For compiled JS, use .js extension
    if (isTypeScript && normalized.endsWith('.ts')) {
      return normalized;
    } else if (normalized.endsWith('.ts')) {
      return normalized.replace(/\.ts$/, '.js');
    }
    return normalized;
  });
  
  const perfmeIndexPath = join(projectRoot, 'dist', 'index.js').replace(/\\/g, '/');
  const measurementEnginePath = join(projectRoot, 'dist', 'MeasurementEngine.js').replace(/\\/g, '/');
  
  // Generate require statements for all files
  const requireStatements = entryFilesForBundle.map((entryFile, index) => {
    const fileName = relative(process.cwd(), entryFiles[index]).replace(/\\/g, '/');
    if (wrapInDescribe && entryFiles.length > 1) {
      return `
    // Load file ${index + 1}: ${fileName}
    perfme.describe('${fileName.replace(/'/g, "\\'")}', function() {
      try {
        require('${entryFile.replace(/'/g, "\\'")}');
      } catch (e) {
        console.error('[Worker Bundle Error] Error loading test file ${fileName}:', e);
        throw e;
      }
    });`;
    } else {
      return `
    // Load file ${index + 1}: ${fileName}
    try {
      require('${entryFile.replace(/'/g, "\\'")}');
    } catch (e) {
      console.error('[Worker Bundle Error] Error loading test file ${fileName}:', e);
      throw e;
    }`;
    }
  }).join('\n');
  
  const workerWrapperCode = `
// Browser Worker wrapper for perfme
(function() {
  // Import perfme library first
  const perfme = require('${perfmeIndexPath}');
  const { MeasurementEngine } = require('${measurementEnginePath}');

  // Import all test files - this will register functions
${requireStatements}

  // Get registered functions metadata (without functions - they can't be cloned)
  const functions = perfme.getRegisteredFunctions();
  const customCharts = perfme.getCustomCharts();
  const customEvaluations = perfme.getCustomEvaluations();
  const aggregateMeasureCharts = perfme.getAggregateMeasureCharts();
  const aggregateEvaluateCharts = perfme.getAggregateEvaluateCharts();
  const settings = perfme.getSettings();
  const styles = perfme.getStyles();
  
  // Get hierarchy
  let hierarchy = null;
  try {
    const { MeasurementEngine } = require('${measurementEnginePath}');
    const engine = new MeasurementEngine();
    hierarchy = engine.getHierarchy();
  } catch (e) {
    console.error('[Worker] Failed to get hierarchy:', e);
  }

  // Extract only metadata (group, subGroup, title) - functions are already in worker
  const functionsMetadata = functions.map(f => ({
    group: f.group,
    subGroup: f.subGroup,
    title: f.title,
    isAsync: f.isAsync,
    path: f.path
  }));

  // Extract custom evaluations metadata
  const customEvaluationsMetadata = customEvaluations.map(e => ({
    customChartId: e.customChart.id,
    group: e.group,
    subGroup: e.subGroup,
    title: e.title,
    path: e.path
  }));

  self.postMessage({
    type: 'registered',
    functions: functionsMetadata,
    customCharts: customCharts,
    customEvaluations: customEvaluationsMetadata,
    aggregateMeasureCharts: aggregateMeasureCharts,
    aggregateEvaluateCharts: aggregateEvaluateCharts,
    settings: settings,
    styles: styles,
    hierarchy: hierarchy
  });

  let currentEngine = null;

  // Listen for measurement commands
  self.onmessage = async function(e) {
    const message = e.data;
    
    if (message.type === 'start') {
      currentEngine = new MeasurementEngine();
      
      try {
        // Run all measurements (custom and standard) in unified order
        await currentEngine.runMeasurements(message.config, (progress) => {
          if (progress.customResult) {
            // Send custom progress
            self.postMessage({
              type: 'customProgress',
              progress: progress
            });
          } else if (progress.result) {
            // Send standard progress
            self.postMessage({
              type: 'progress',
              progress: progress
            });
          }
        });
        
        self.postMessage({
          type: 'complete'
        });
      } catch (error) {
        console.error('[Worker Measurement Error]', error);
        self.postMessage({
          type: 'error',
          error: error.message
        });
      } finally {
        currentEngine = null;
      }
    } else if (message.type === 'stop') {
      if (currentEngine) {
        currentEngine.stop();
      }
    } else if (message.type === 'skip') {
      if (currentEngine && message.pathKey) {
        currentEngine.skipPathKey(message.pathKey);
      }
    }
  };
})();
`;

  require('fs').writeFileSync(workerWrapperPath, workerWrapperCode, 'utf-8');

  // Use browserify to bundle
  // Run browserify from the user's project directory (process.cwd()) so it can resolve test file paths
  const browserifyCmd = `npx browserify ${workerWrapperPath} ${
    isTypeScript ? '-p [ tsify --transpileOnly ]' : ''
  } -o ${outputPath} --ignore express --ignore ws --ignore fs --ignore http --ignore https --ignore net --ignore tls --ignore child_process --ignore worker_threads`;

  try {
    execSync(browserifyCmd, {
      cwd: process.cwd(), // Run from user's project directory, not perfme directory
      stdio: 'inherit',
    });
    console.log('Bundle created successfully');
  } catch (error: any) {
    console.error('[CLI Error] Error bundling test file:', error);
    if (error.stdout) console.error('stdout:', error.stdout.toString());
    if (error.stderr) console.error('stderr:', error.stderr.toString());
    throw error;
  }
}
}


import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createServer as createNetServer } from 'net';
import { MeasurementEngine } from './MeasurementEngine';
import { MeasurementConfig, MeasurementProgress, MeasurementResult, CustomMeasurementResult } from './types';
import { getCustomCharts, getStyles, getSettings, getAggregateMeasureCharts, getAggregateEvaluateCharts } from './index';

let globalEngine: MeasurementEngine | null = null;
const activeConnections = new Map<WebSocket, { stopRequested: boolean }>();

export function createServer(port: number = 0, testFilePath?: string): void {
  const app = express();
  const server = createHttpServer(app);
  const wss = new WebSocketServer({ server });

  // Create global engine (it will read from the global registry)
  globalEngine = new MeasurementEngine();

  // Serve static files
  app.use(express.static(join(__dirname, '../dist')));
  app.use(express.json());

  // Serve worker bundle
  app.get('/worker-bundle.js', (req, res) => {
    const workerBundlePath = join(__dirname, '../dist/worker-bundle.js');
    if (existsSync(workerBundlePath)) {
      res.type('application/javascript');
      res.send(readFileSync(workerBundlePath, 'utf-8'));
    } else {
      res.status(404).send('Worker bundle not found');
    }
  });

  // Main page
  app.get('/', (req, res) => {
    const htmlPath = join(__dirname, '../dist/frontend.html');
    if (existsSync(htmlPath)) {
      const html = readFileSync(htmlPath, 'utf-8');
      res.send(html);
    } else {
      res.status(404).send('Frontend not found. Please build the project first.');
    }
  });

  // API to get registered groups
  app.get('/api/groups', (req, res) => {
    if (globalEngine) {
      res.json(globalEngine.getGroups());
    } else {
      res.json([]);
    }
  });

  // API to get custom charts
  app.get('/api/custom-charts', (req, res) => {
    res.json(getCustomCharts());
  });

  // API to get styles
  app.get('/api/styles', (req, res) => {
    res.json(getStyles());
  });

  // WebSocket handling
  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');
    activeConnections.set(ws, { stopRequested: false });

    // Send groups info, custom charts, styles, and settings
    if (globalEngine) {
      ws.send(
        JSON.stringify({
          type: 'groups',
          groups: globalEngine.getGroups(), // Legacy format for backward compatibility
          hierarchy: globalEngine.getHierarchy(), // New hierarchical format
          customCharts: getCustomCharts(),
          aggregateMeasureCharts: getAggregateMeasureCharts(),
          aggregateEvaluateCharts: getAggregateEvaluateCharts(),
          styles: getStyles(),
          settings: getSettings(),
        })
      );
    }

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'start') {
          const connection = activeConnections.get(ws);
          if (!connection || !globalEngine) return;

          connection.stopRequested = false;
          const config: MeasurementConfig = data.config;

          // Run all measurements (custom and standard) in unified order
          runMeasurementsOnBackend(ws, globalEngine, config);
        } else if (data.type === 'stop') {
          const connection = activeConnections.get(ws);
          if (connection && globalEngine) {
            connection.stopRequested = true;
            globalEngine.stop();
          }
        } else if (data.type === 'skip') {
          if (globalEngine && data.pathKey) {
            globalEngine.skipPathKey(data.pathKey);
          }
        }
      } catch (error: any) {
        console.error('[WebSocket Message Error]', error);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: error.message,
          })
        );
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      activeConnections.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      activeConnections.delete(ws);
    });
  });

  // Helper function to check if port is available
  function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = createNetServer();
      testServer.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      testServer.once('listening', () => {
        testServer.once('close', () => resolve(true));
        testServer.close();
      });
      testServer.listen(port);
    });
  }

  // Helper function to find a free port starting from a given port
  async function findFreePort(startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + 100; port++) {
      if (await isPortAvailable(port)) {
        return port;
      }
    }
    // If no port found in range, let the OS assign one
    return 0;
  }

  // Try to use the specified port, or find a free one if it's not available
  async function startServer() {
    let actualPort = port;
    
    // If port is 0, find a free port starting from 3000
    if (port === 0) {
      actualPort = await findFreePort(3000);
    } else {
      // Check if the specified port is available
      const available = await isPortAvailable(port);
      if (!available) {
        console.log(`Port ${port} is not available, finding a free port...`);
        actualPort = await findFreePort(port + 1);
      }
    }

    server.listen(actualPort === 0 ? 0 : actualPort, () => {
      const finalPort = (server.address() as any)?.port || actualPort;
      console.log(`Server started on http://localhost:${finalPort}`);
      console.log(`WebSocket server on ws://localhost:${finalPort}`);
      console.log(`Open browser and navigate to http://localhost:${finalPort}`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${actualPort} is already in use. Trying to find a free port...`);
        findFreePort(actualPort + 1).then((freePort) => {
          server.listen(freePort === 0 ? 0 : freePort, () => {
            const finalPort = (server.address() as any)?.port || freePort;
            console.log(`Server started on http://localhost:${finalPort}`);
            console.log(`WebSocket server on ws://localhost:${finalPort}`);
            console.log(`Open browser and navigate to http://localhost:${finalPort}`);
          });
        });
      } else {
        console.error('Server error:', err);
      }
    });
  }

  startServer();
}

async function runMeasurementsOnBackend(
  ws: WebSocket,
  engine: MeasurementEngine,
  config: MeasurementConfig
): Promise<void> {
  const connection = activeConnections.get(ws);
  if (!connection) return;

  try {
    await engine.runMeasurements(config, (progress: MeasurementProgress & { result?: MeasurementResult; customResult?: CustomMeasurementResult }) => {
      if (connection.stopRequested) {
        engine.stop();
        return;
      }

      if (progress.customResult) {
        // Send custom progress
        ws.send(
          JSON.stringify({
            type: 'customProgress',
            progress: {
              path: progress.path,
              title: progress.title,
              dataSize: progress.dataSize,
              progress: progress.progress,
              customResult: progress.customResult,
            },
          })
        );
      } else if (progress.result) {
        // Send standard progress
        ws.send(
          JSON.stringify({
            type: 'progress',
            progress,
          })
        );
      }
    });

    // Send complete after all measurements are done
    ws.send(
      JSON.stringify({
        type: 'complete',
      })
    );
  } catch (error: any) {
    console.error('[Backend Measurement Error]', error);
    ws.send(
      JSON.stringify({
        type: 'error',
        error: error.message,
      })
    );
  }
}

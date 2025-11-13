import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketClient, ExtendedEventData, ExecutionBoundary } from '../services/websocketClient';
import { ILogger, Logger } from '../services/logger';

interface ExtendedEventDataPoint {
    timestamp: number;
    eventName: string;
    executionNumber: number;
    duration?: number;
    logicalReads?: number;
    writes?: number;
    cpuTime?: number;
    physicalReads?: number;
    rowCount?: number;
    [key: string]: any; // For extensibility
}

interface ExecutionSummary {
    executionNumber: number;
    startTime: number;
    endTime?: number;
    events: ExtendedEventDataPoint[];
    minDuration?: number;
    maxDuration?: number;
    avgDuration?: number;
    totalReads?: number;
    totalWrites?: number;
    // Average values for all metrics
    avgLogicalReads?: number;
    avgWrites?: number;
    avgCpuTime?: number;
    avgPhysicalReads?: number;
    avgRowCount?: number;
}

export class PerformanceGraph {
    private panel: vscode.WebviewPanel | undefined;
    private extendedEventDataCallback: ((data: ExtendedEventData) => void) | null = null;
    private executionBoundaryCallback: ((boundary: ExecutionBoundary) => void) | null = null;
    private eventDataPoints: ExtendedEventDataPoint[] = [];
    private executionBoundaries: ExecutionBoundary[] = [];
    private executionSummaries: Map<number, ExecutionSummary> = new Map();
    private readonly maxDataPoints = 1000;
    private logger: ILogger;
    private selectedConnectionId: string | undefined;
    private isStressTestActive = false;
    private testStartTime: number | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - Performance Graph');
        this.logger.log('PerformanceGraph initialized');
    }

    show(connectionId?: string): void {
        this.selectedConnectionId = connectionId;
        
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.logger.log('Showing performance graph panel', { connectionId });
        this.panel = vscode.window.createWebviewPanel(
            'performanceGraph',
            'Extended Events Performance Graph',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(() => {
            this.dispose();
        });

        // Register for Extended Events data updates
        this.extendedEventDataCallback = (data: ExtendedEventData) => {
            this.logger.log('ExtendedEventData received in PerformanceGraph', { 
                eventName: data.eventName,
                executionNumber: data.executionNumber,
                isStressTestActive: this.isStressTestActive 
            });
            // Process data regardless of stress test status
            // Data may arrive before startStressTest() is called
            this.logger.log('Processing ExtendedEventData');
            this.addEventDataPoint(data);
            if (this.isStressTestActive) {
                this.updateChart();
            } else {
                this.logger.log('Data processed but chart not updated - stress test not active');
            }
        };

        this.executionBoundaryCallback = (boundary: ExecutionBoundary) => {
            this.logger.log('ExecutionBoundary received in PerformanceGraph', { 
                executionNumber: boundary.executionNumber,
                isStart: boundary.isStart,
                isStressTestActive: this.isStressTestActive 
            });
            this.addExecutionBoundary(boundary);
            this.updateChart();
        };

        this.websocketClient.onExtendedEventData(this.extendedEventDataCallback);
        this.websocketClient.onExecutionBoundary(this.executionBoundaryCallback);
        this.logger.log('Performance graph panel opened and registered for Extended Events updates', { 
            connectionId,
            isStressTestActive: this.isStressTestActive 
        });
    }

    startStressTest(): void {
        this.logger.log('PerformanceGraph.startStressTest() called', { 
            previousState: this.isStressTestActive,
            eventDataPointsCount: this.eventDataPoints.length,
            executionSummariesCount: this.executionSummaries.size
        });
        this.isStressTestActive = true;
        this.testStartTime = Date.now();
        this.eventDataPoints = [];
        this.executionBoundaries = [];
        this.executionSummaries.clear();
        this.logger.log('Stress test started - clearing previous data', { 
            testStartTime: this.testStartTime,
            isStressTestActive: this.isStressTestActive 
        });
        
        // Send clear command to webview to reset chart
        if (this.panel) {
            this.logger.log('Sending clearChart message to webview', { testStartTime: this.testStartTime });
            this.panel.webview.postMessage({
                command: 'clearChart',
                testStartTime: this.testStartTime
            });
            // Update chart with any data that was already processed
            this.updateChart();
        } else {
            this.logger.log('WARNING: Panel not available when startStressTest() called');
        }
    }

    stopStressTest(): void {
        this.logger.log('PerformanceGraph.stopStressTest() called', { 
            previousState: this.isStressTestActive,
            eventDataPointsCount: this.eventDataPoints.length,
            executionSummariesCount: this.executionSummaries.size
        });
        this.isStressTestActive = false;
        this.logger.log('Stress test stopped', { isStressTestActive: this.isStressTestActive });
    }

    private addEventDataPoint(data: ExtendedEventData): void {
        this.logger.log('Adding event data point', { 
            eventName: data.eventName,
            executionNumber: data.executionNumber,
            currentDataPointsCount: this.eventDataPoints.length 
        });
        const timestamp = new Date(data.timestamp).getTime();
        const point: ExtendedEventDataPoint = {
            timestamp,
            eventName: data.eventName,
            executionNumber: data.executionNumber
        };

        // Extract common fields from eventFields
        if (data.eventFields) {
            point.duration = data.eventFields['duration'] || data.eventFields['total_duration'];
            point.logicalReads = data.eventFields['logical_reads'] || data.eventFields['reads'];
            point.writes = data.eventFields['writes'];
            point.cpuTime = data.eventFields['cpu_time'];
            point.physicalReads = data.eventFields['physical_reads'];
            point.rowCount = data.eventFields['row_count'];
            
            this.logger.log('Extracted event fields', { 
                duration: point.duration,
                logicalReads: point.logicalReads,
                writes: point.writes,
                cpuTime: point.cpuTime,
                physicalReads: point.physicalReads,
                rowCount: point.rowCount
            });
            
            // Store all other fields for extensibility
            Object.keys(data.eventFields).forEach(key => {
                if (!point.hasOwnProperty(key)) {
                    point[key] = data.eventFields[key];
                }
            });
        } else {
            this.logger.log('WARNING: No eventFields in ExtendedEventData');
        }

        this.eventDataPoints.push(point);
        if (this.eventDataPoints.length > this.maxDataPoints) {
            this.eventDataPoints.shift();
            this.logger.log('Data points limit reached, removing oldest point');
        }
        this.logger.log('Event data point added', { 
            totalDataPoints: this.eventDataPoints.length,
            pointDuration: point.duration 
        });

        // Update execution summary
        let summary = this.executionSummaries.get(data.executionNumber);
        if (!summary) {
            summary = {
                executionNumber: data.executionNumber,
                startTime: timestamp,
                events: []
            };
            this.executionSummaries.set(data.executionNumber, summary);
        }
        summary.events.push(point);

        // Update summary statistics
        if (point.duration !== undefined) {
            if (summary.minDuration === undefined || point.duration < summary.minDuration) {
                summary.minDuration = point.duration;
            }
            if (summary.maxDuration === undefined || point.duration > summary.maxDuration) {
                summary.maxDuration = point.duration;
            }
            const durations = summary.events.filter(e => e.duration !== undefined).map(e => e.duration!);
            summary.avgDuration = durations.length > 0 
                ? durations.reduce((a, b) => a + b, 0) / durations.length 
                : undefined;
        }

        if (point.logicalReads !== undefined) {
            summary.totalReads = (summary.totalReads || 0) + point.logicalReads;
            const logicalReads = summary.events.filter(e => e.logicalReads !== undefined).map(e => e.logicalReads!);
            summary.avgLogicalReads = logicalReads.length > 0 
                ? logicalReads.reduce((a, b) => a + b, 0) / logicalReads.length 
                : undefined;
        }

        if (point.writes !== undefined) {
            summary.totalWrites = (summary.totalWrites || 0) + point.writes;
            const writes = summary.events.filter(e => e.writes !== undefined).map(e => e.writes!);
            summary.avgWrites = writes.length > 0 
                ? writes.reduce((a, b) => a + b, 0) / writes.length 
                : undefined;
        }

        if (point.cpuTime !== undefined) {
            const cpuTimes = summary.events.filter(e => e.cpuTime !== undefined).map(e => e.cpuTime!);
            summary.avgCpuTime = cpuTimes.length > 0 
                ? cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length 
                : undefined;
        }

        if (point.physicalReads !== undefined) {
            const physicalReads = summary.events.filter(e => e.physicalReads !== undefined).map(e => e.physicalReads!);
            summary.avgPhysicalReads = physicalReads.length > 0 
                ? physicalReads.reduce((a, b) => a + b, 0) / physicalReads.length 
                : undefined;
        }

        if (point.rowCount !== undefined) {
            const rowCounts = summary.events.filter(e => e.rowCount !== undefined).map(e => e.rowCount!);
            summary.avgRowCount = rowCounts.length > 0 
                ? rowCounts.reduce((a, b) => a + b, 0) / rowCounts.length 
                : undefined;
        }
    }

    private addExecutionBoundary(boundary: ExecutionBoundary): void {
        this.logger.log('Adding execution boundary', { 
            executionNumber: boundary.executionNumber,
            isStart: boundary.isStart,
            currentBoundariesCount: this.executionBoundaries.length 
        });
        this.executionBoundaries.push(boundary);
        
        // Update execution summary end time
        if (!boundary.isStart && boundary.endTime) {
            const summary = this.executionSummaries.get(boundary.executionNumber);
            if (summary) {
                summary.endTime = new Date(boundary.endTime).getTime();
                this.logger.log('Updated execution summary end time', { 
                    executionNumber: boundary.executionNumber,
                    endTime: summary.endTime 
                });
            }
        }
    }

    private updateChart(): void {
        if (!this.panel) {
            this.logger.log('Cannot update chart - panel not available');
            return;
        }

        // Filter to sql_batch_completed events for main metrics
        const batchCompletedEvents = this.eventDataPoints.filter(e => e.eventName === 'sql_batch_completed');
        const summaryCount = this.executionSummaries.size;
        const boundaryCount = this.executionBoundaries.length;
        const dataPointCount = this.eventDataPoints.length;

        this.logger.log('Updating chart', { 
            executionSummaries: summaryCount,
            boundaries: boundaryCount,
            eventDataPoints: dataPointCount,
            batchCompletedEvents: batchCompletedEvents.length,
            testStartTime: this.testStartTime 
        });
        
        this.panel.webview.postMessage({
            command: 'updateExtendedEventsData',
            eventData: batchCompletedEvents,
            boundaries: this.executionBoundaries,
            summaries: Array.from(this.executionSummaries.values()),
            testStartTime: this.testStartTime
        });
        
        this.logger.log('Chart update message sent to webview', { 
            eventDataCount: batchCompletedEvents.length,
            boundariesCount: this.executionBoundaries.length,
            summariesCount: this.executionSummaries.size 
        });
    }

    private getPerformanceGraphStyles(): string {
        return `
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 16px;
            overflow-x: auto;
            width: 100%;
            min-width: 100%;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            gap: 16px;
            height: 100vh;
            width: 100%;
            min-width: 100%;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        .stats-panel {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .stat-card {
            padding: 10px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
        }
        
        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        
        .controls-panel {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            align-items: center;
        }
        
        .metric-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            flex: 1;
        }
        
        .metric-checkbox {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
        }
        
        .metric-checkbox:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }
        
        .metric-checkbox input[type="checkbox"] {
            cursor: pointer;
            margin: 0;
        }
        
        .metric-checkbox label {
            cursor: pointer;
            font-size: 12px;
            margin: 0;
        }
        
        .metric-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
            display: inline-block;
        }
        
        .chart-container {
            position: relative;
            flex: 1;
            min-height: 500px;
            width: 100%;
            min-width: 100%;
            background: var(--vscode-editor-background);
            border: none;
            border-radius: 6px;
            padding: 16px;
            overflow: visible;
        }
        
        .chart-container canvas {
            color: var(--vscode-editor-foreground);
        }
        
        #performanceChart {
            width: 100% !important;
            max-width: 100%;
        }
        
        .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        
        .btn {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    `;
    }

    private getPerformanceGraphBody(): string {
        return `
    <div class="container">
        <div class="header">
            <h2>Extended Events Performance Graph</h2>
            <div>
                <button class="btn btn-secondary" id="resetZoomBtn" title="Reset Zoom">Reset Zoom</button>
                <button class="btn btn-secondary" id="exportBtn" title="Export Chart">Export</button>
            </div>
        </div>
        
        <div class="stats-panel" id="statsPanel">
            <div class="stat-card">
                <div class="stat-label">Executions</div>
                <div class="stat-value" id="statExecutions">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Executions/sec</div>
                <div class="stat-value" id="statExecRate">0.0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Duration</div>
                <div class="stat-value" id="statAvgDuration">0 ms</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Time</div>
                <div class="stat-value" id="statTotalTime">0s</div>
            </div>
        </div>
        
        <div class="controls-panel">
            <div class="metric-group">
                <div class="metric-checkbox">
                    <div class="metric-color" style="background: rgb(75, 192, 192);"></div>
                    <input type="checkbox" id="showDuration" checked>
                    <label for="showDuration">Duration</label>
                </div>
                <div class="metric-checkbox">
                    <div class="metric-color" style="background: rgb(255, 99, 132);"></div>
                    <input type="checkbox" id="showReads" checked>
                    <label for="showReads">Logical Reads</label>
                </div>
                <div class="metric-checkbox">
                    <div class="metric-color" style="background: rgb(54, 162, 235);"></div>
                    <input type="checkbox" id="showWrites" checked>
                    <label for="showWrites">Writes</label>
                </div>
                <div class="metric-checkbox">
                    <div class="metric-color" style="background: rgb(255, 206, 86);"></div>
                    <input type="checkbox" id="showCpuTime" checked>
                    <label for="showCpuTime">CPU Time</label>
                </div>
                <div class="metric-checkbox">
                    <div class="metric-color" style="background: rgb(153, 102, 255);"></div>
                    <input type="checkbox" id="showPhysicalReads">
                    <label for="showPhysicalReads">Physical Reads</label>
                </div>
                <div class="metric-checkbox">
                    <div class="metric-color" style="background: rgb(255, 159, 64);"></div>
                    <input type="checkbox" id="showRowCount">
                    <label for="showRowCount">Row Count</label>
                </div>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="performanceChart"></canvas>
        </div>
        
        <div class="status-bar">
            <span id="statusText">Ready</span>
            <span id="timeRangeText">-</span>
        </div>
    </div>
    `;
    }

    private getPerformanceGraphScript(): string {
        const scriptPath = path.join(this.context.extensionPath, 'webviews', 'performanceGraph.js');
        try {
            return fs.readFileSync(scriptPath, 'utf8');
        } catch (error) {
            this.logger.error('Failed to load performanceGraph.js', error);
            return '// Error loading script';
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Extended Events Performance Graph</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>
    <style>${this.getPerformanceGraphStyles()}</style>
</head>
<body>${this.getPerformanceGraphBody()}
    <script>${this.getPerformanceGraphScript()}</script>
</body>
</html>`;
    }

    dispose(): void {
        this.logger.log('Disposing performance graph');
        if (this.extendedEventDataCallback) {
            this.websocketClient.offExtendedEventData(this.extendedEventDataCallback);
        }
        if (this.executionBoundaryCallback) {
            this.websocketClient.offExecutionBoundary(this.executionBoundaryCallback);
        }
        this.panel?.dispose();
        this.panel = undefined;
        this.eventDataPoints = [];
        this.executionBoundaries = [];
        this.executionSummaries.clear();
    }
}

import * as vscode from 'vscode';
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
            if (this.isStressTestActive) {
                this.addEventDataPoint(data);
                this.updateChart();
            }
        };

        this.executionBoundaryCallback = (boundary: ExecutionBoundary) => {
            this.addExecutionBoundary(boundary);
            this.updateChart();
        };

        this.websocketClient.onExtendedEventData(this.extendedEventDataCallback);
        this.websocketClient.onExecutionBoundary(this.executionBoundaryCallback);
        this.logger.log('Performance graph panel opened and registered for Extended Events updates', { connectionId });
    }

    startStressTest(): void {
        this.isStressTestActive = true;
        this.eventDataPoints = [];
        this.executionBoundaries = [];
        this.executionSummaries.clear();
        this.logger.log('Stress test started - clearing previous data');
    }

    stopStressTest(): void {
        this.isStressTestActive = false;
        this.logger.log('Stress test stopped');
    }

    private addEventDataPoint(data: ExtendedEventData): void {
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
            
            // Store all other fields for extensibility
            Object.keys(data.eventFields).forEach(key => {
                if (!point.hasOwnProperty(key)) {
                    point[key] = data.eventFields[key];
                }
            });
        }

        this.eventDataPoints.push(point);
        if (this.eventDataPoints.length > this.maxDataPoints) {
            this.eventDataPoints.shift();
        }

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
        }

        if (point.writes !== undefined) {
            summary.totalWrites = (summary.totalWrites || 0) + point.writes;
        }
    }

    private addExecutionBoundary(boundary: ExecutionBoundary): void {
        this.executionBoundaries.push(boundary);
        
        // Update execution summary end time
        if (!boundary.isStart && boundary.endTime) {
            const summary = this.executionSummaries.get(boundary.executionNumber);
            if (summary) {
                summary.endTime = new Date(boundary.endTime).getTime();
            }
        }
    }

    private updateChart(): void {
        if (!this.panel) {
            return;
        }

        // Filter to sql_batch_completed events for main metrics
        const batchCompletedEvents = this.eventDataPoints.filter(e => e.eventName === 'sql_batch_completed');
        
        this.panel.webview.postMessage({
            command: 'updateExtendedEventsData',
            eventData: batchCompletedEvents,
            boundaries: this.executionBoundaries,
            summaries: Array.from(this.executionSummaries.values())
        });
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
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #chartContainer {
            position: relative;
            height: 600px;
            width: 100%;
        }
        .metric-selector {
            margin-bottom: 10px;
        }
        .metric-selector label {
            margin-right: 10px;
        }
        .metric-selector input[type="checkbox"] {
            margin-right: 5px;
        }
    </style>
</head>
<body>
    <h2>Extended Events Performance</h2>
    <div class="metric-selector">
        <label><input type="checkbox" id="showDuration" checked> Duration (ms)</label>
        <label><input type="checkbox" id="showReads" checked> Logical Reads</label>
        <label><input type="checkbox" id="showWrites" checked> Writes</label>
        <label><input type="checkbox" id="showCpuTime" checked> CPU Time (ms)</label>
        <label><input type="checkbox" id="showPhysicalReads"> Physical Reads</label>
        <label><input type="checkbox" id="showRowCount"> Row Count</label>
    </div>
    <div id="chartContainer">
        <canvas id="performanceChart"></canvas>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        let chart;
        let executionSummaries = [];
        
        const chartConfig = {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const timestamp = context[0].label;
                                const executionNumber = context[0].raw.executionNumber;
                                const summary = executionSummaries.find(s => s.executionNumber === executionNumber);
                                if (summary) {
                                    return \`Execution #\${executionNumber} - \${timestamp}\\n\` +
                                        \`Min Duration: \${summary.minDuration?.toFixed(2) || 'N/A'} ms\\n\` +
                                        \`Max Duration: \${summary.maxDuration?.toFixed(2) || 'N/A'} ms\\n\` +
                                        \`Avg Duration: \${summary.avgDuration?.toFixed(2) || 'N/A'} ms\\n\` +
                                        \`Total Reads: \${summary.totalReads || 0}\\n\` +
                                        \`Total Writes: \${summary.totalWrites || 0}\`;
                                }
                                return \`Execution #\${executionNumber} - \${timestamp}\`;
                            }
                        }
                    },
                    annotation: {
                        annotations: []
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Value'
                        }
                    }
                }
            }
        };
        
        chart = new Chart(ctx, chartConfig);
        
        function updateMetricVisibility() {
            const showDuration = document.getElementById('showDuration').checked;
            const showReads = document.getElementById('showReads').checked;
            const showWrites = document.getElementById('showWrites').checked;
            const showCpuTime = document.getElementById('showCpuTime').checked;
            const showPhysicalReads = document.getElementById('showPhysicalReads').checked;
            const showRowCount = document.getElementById('showRowCount').checked;
            
            chart.data.datasets.forEach(dataset => {
                dataset.hidden = !(
                    (dataset.label.includes('Duration') && showDuration) ||
                    (dataset.label.includes('Reads') && showReads && !dataset.label.includes('Physical')) ||
                    (dataset.label.includes('Writes') && showWrites) ||
                    (dataset.label.includes('CPU') && showCpuTime) ||
                    (dataset.label.includes('Physical') && showPhysicalReads) ||
                    (dataset.label.includes('Row') && showRowCount)
                );
            });
            chart.update();
        }
        
        document.getElementById('showDuration').addEventListener('change', updateMetricVisibility);
        document.getElementById('showReads').addEventListener('change', updateMetricVisibility);
        document.getElementById('showWrites').addEventListener('change', updateMetricVisibility);
        document.getElementById('showCpuTime').addEventListener('change', updateMetricVisibility);
        document.getElementById('showPhysicalReads').addEventListener('change', updateMetricVisibility);
        document.getElementById('showRowCount').addEventListener('change', updateMetricVisibility);

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateExtendedEventsData') {
                const eventData = message.eventData || [];
                const boundaries = message.boundaries || [];
                executionSummaries = message.summaries || [];
                
                // Group data by timestamp for labels
                const timestamps = [...new Set(eventData.map(e => e.timestamp))].sort((a, b) => a - b);
                const labels = timestamps.map(t => new Date(t).toLocaleTimeString());
                
                // Create datasets for each metric
                const datasets = [];
                
                // Duration dataset
                datasets.push({
                    label: 'Duration (ms)',
                    data: eventData.map(e => ({
                        x: e.timestamp,
                        y: e.duration || 0,
                        executionNumber: e.executionNumber
                    })),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                });
                
                // Logical Reads dataset
                datasets.push({
                    label: 'Logical Reads',
                    data: eventData.map(e => ({
                        x: e.timestamp,
                        y: e.logicalReads || 0,
                        executionNumber: e.executionNumber
                    })),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1
                });
                
                // Writes dataset
                datasets.push({
                    label: 'Writes',
                    data: eventData.map(e => ({
                        x: e.timestamp,
                        y: e.writes || 0,
                        executionNumber: e.executionNumber
                    })),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    tension: 0.1
                });
                
                // CPU Time dataset
                datasets.push({
                    label: 'CPU Time (ms)',
                    data: eventData.map(e => ({
                        x: e.timestamp,
                        y: e.cpuTime || 0,
                        executionNumber: e.executionNumber
                    })),
                    borderColor: 'rgb(255, 206, 86)',
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    tension: 0.1
                });
                
                // Physical Reads dataset
                datasets.push({
                    label: 'Physical Reads',
                    data: eventData.map(e => ({
                        x: e.timestamp,
                        y: e.physicalReads || 0,
                        executionNumber: e.executionNumber
                    })),
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    tension: 0.1,
                    hidden: true
                });
                
                // Row Count dataset
                datasets.push({
                    label: 'Row Count',
                    data: eventData.map(e => ({
                        x: e.timestamp,
                        y: e.rowCount || 0,
                        executionNumber: e.executionNumber
                    })),
                    borderColor: 'rgb(255, 159, 64)',
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    tension: 0.1,
                    hidden: true
                });
                
                chart.data.labels = labels;
                chart.data.datasets = datasets;
                
                // Add execution boundaries as vertical lines
                const annotations = boundaries.map(boundary => ({
                    type: 'line',
                    xMin: boundary.timestampMs,
                    xMax: boundary.timestampMs,
                    borderColor: boundary.isStart ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
                    borderWidth: 2,
                    borderDash: boundary.isStart ? [5, 5] : [],
                    label: {
                        display: true,
                        content: \`Exec #\${boundary.executionNumber} \${boundary.isStart ? 'Start' : 'End'}\`,
                        position: 'start'
                    }
                }));
                
                chart.options.plugins.annotation.annotations = annotations;
                
                chart.update();
            }
        });
    </script>
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

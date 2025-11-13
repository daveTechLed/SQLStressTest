import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketClient, ExtendedEventData, ExecutionBoundary, ExecutionMetrics } from '../services/websocketClient';
import { ILogger, Logger } from '../services/logger';

interface ExecutionSummary {
    executionNumber: number;
    startTime: number;
    endTime?: number;
    duration?: number; // in ms
    rowCount?: number;
    dataSizeBytes?: number;
}

interface HistoricalRun {
    runId: number; // Sequential run number
    startTime: number;
    endTime: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    avgDataSizeBytes?: number;
    minDataSizeBytes?: number;
    maxDataSizeBytes?: number;
    executionCount: number;
}

interface MetricCardData {
    label: string;
    current: number;
    previous?: number;
    trend: 'up' | 'down' | 'stable';
    unit: string;
    min?: number;
    max?: number;
    runId?: number; // Run identifier for display
    // For combined cards
    executionTime?: {
        current: number;
        previous?: number;
        trend: 'up' | 'down' | 'stable';
        unit: string;
        min?: number;
        max?: number;
    };
    dataSize?: {
        current: number;
        previous?: number;
        trend: 'up' | 'down' | 'stable';
        unit: string;
        min?: number;
        max?: number;
    };
}

export class HistoricalMetricsView {
    private panel: vscode.WebviewPanel | undefined;
    private extendedEventDataCallback: ((data: ExtendedEventData) => void) | null = null;
    private executionBoundaryCallback: ((boundary: ExecutionBoundary) => void) | null = null;
    private executionMetricsCallback: ((metrics: ExecutionMetrics) => void) | null = null;
    private executionSummaries: Map<number, ExecutionSummary> = new Map();
    private readonly maxExecutions = 1000;
    private logger: ILogger;
    private selectedConnectionId: string | undefined;
    private isStressTestActive = false;
    private historicalRuns: HistoricalRun[] = [];
    private currentRunId: number = 0;
    private currentRunStartTime: number | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - Historical Metrics');
        this.logger.log('HistoricalMetricsView initialized');
    }

    show(connectionId?: string): void {
        this.selectedConnectionId = connectionId;
        
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.logger.log('Showing historical metrics panel', { connectionId });
        this.panel = vscode.window.createWebviewPanel(
            'historicalMetrics',
            'Historical Metrics',
            vscode.ViewColumn.Three,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(() => {
            this.dispose();
        });

        // Register callbacks
        this.extendedEventDataCallback = (data: ExtendedEventData) => {
            this.logger.log('ExtendedEventData received', { 
                eventName: data.eventName,
                executionNumber: data.executionNumber,
                isStressTestActive: this.isStressTestActive 
            });
            // Process ExtendedEventData regardless of stress test status
            // Data may arrive before startStressTest() is called
            const wasProcessed = this.addEventData(data);
            // Only update view if data was actually processed
            if (wasProcessed) {
                this.updateView();
            }
        };

        this.executionBoundaryCallback = (boundary: ExecutionBoundary) => {
            this.logger.log('ExecutionBoundary received', { 
                executionNumber: boundary.executionNumber,
                isStart: boundary.isStart,
                isStressTestActive: this.isStressTestActive 
            });
            this.addExecutionBoundary(boundary);
            // Always update view for boundaries (they create summaries)
            this.updateView();
        };

        this.executionMetricsCallback = (metrics: ExecutionMetrics) => {
            this.logger.log('ExecutionMetrics received', { 
                executionNumber: metrics.executionNumber,
                dataSizeBytes: metrics.dataSizeBytes,
                isStressTestActive: this.isStressTestActive 
            });
            this.addExecutionMetrics(metrics);
            // Always update view for metrics (they create summaries)
            this.updateView();
        };

        this.websocketClient.onExtendedEventData(this.extendedEventDataCallback);
        this.websocketClient.onExecutionBoundary(this.executionBoundaryCallback);
        this.websocketClient.onExecutionMetrics(this.executionMetricsCallback);

        // Update view immediately to show any existing historical runs
        // This ensures historical runs are displayed when the webview is first shown or refreshed
        this.updateView();
    }

    startStressTest(): void {
        // If a stress test is already active, finalize the previous run first
        if (this.isStressTestActive && this.currentRunStartTime !== undefined) {
            this.logger.log('Starting new stress test while previous one is active - finalizing previous run first', {
                previousRunId: this.currentRunId
            });
            // Finalize the previous run before starting a new one
            this.finalizeCurrentRun();
        }
        
        this.isStressTestActive = true;
        // Start a new run - increment run ID and track start time
        this.currentRunId++;
        this.currentRunStartTime = Date.now();
        // Clear only current run's execution summaries (keep historical runs)
        this.executionSummaries.clear();
        this.logger.log('Stress test started - starting new run', { 
            runId: this.currentRunId,
            historicalRunsCount: this.historicalRuns.length,
            isStressTestActive: this.isStressTestActive
        });
        
        if (this.panel) {
            // Don't clear data - we want to keep historical runs visible
            // Just update to show all runs including the new one
        }
        
        // Update view to show all historical runs + current run (if any data)
        this.updateView();
    }

    stopStressTest(): void {
        this.logger.log('stopStressTest() called', {
            isStressTestActive: this.isStressTestActive,
            currentRunId: this.currentRunId,
            hasCurrentRunStartTime: this.currentRunStartTime !== undefined
        });
        
        // Always set to false first to prevent any race conditions
        this.isStressTestActive = false;
        
        if (this.currentRunStartTime === undefined) {
            this.logger.log('Stress test stopped - no active run to finalize', {
                isStressTestActive: this.isStressTestActive,
                currentRunId: this.currentRunId
            });
            // Ensure state is completely clean
            this.executionSummaries.clear();
            this.currentRunStartTime = undefined; // Explicitly clear even if already undefined
            this.updateView();
            return;
        }
        
        this.finalizeCurrentRun();
    }

    private finalizeCurrentRun(): void {
        if (this.currentRunStartTime === undefined) {
            this.logger.log('finalizeCurrentRun() called but no current run to finalize');
            return;
        }
        
        // Calculate aggregate metrics from current execution summaries
        const summaries = Array.from(this.executionSummaries.values())
            .filter(s => s.startTime && (s.duration !== undefined || s.endTime !== undefined || s.dataSizeBytes !== undefined));
        
        if (summaries.length === 0) {
            this.logger.log('No valid executions to aggregate for current run', {
                runId: this.currentRunId
            });
            this.currentRunStartTime = undefined;
            this.executionSummaries.clear();
            this.updateView();
            return;
        }
        
        const durations = summaries.map(e => e.duration).filter((d): d is number => d !== undefined);
        const dataSizes = summaries.map(e => e.dataSizeBytes).filter((d): d is number => d !== undefined);
        
        const endTime = Date.now();
        const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
        const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
        
        const historicalRun: HistoricalRun = {
            runId: this.currentRunId,
            startTime: this.currentRunStartTime,
            endTime: endTime,
            avgDuration: avgDuration,
            minDuration: minDuration,
            maxDuration: maxDuration,
            executionCount: summaries.length
        };
        
        if (dataSizes.length > 0) {
            historicalRun.avgDataSizeBytes = dataSizes.reduce((a, b) => a + b, 0) / dataSizes.length;
            historicalRun.minDataSizeBytes = Math.min(...dataSizes);
            historicalRun.maxDataSizeBytes = Math.max(...dataSizes);
        }
        
        // Add to historical runs
        this.historicalRuns.push(historicalRun);
        this.logger.log('Run finalized', {
            runId: this.currentRunId,
            executionCount: summaries.length,
            avgDuration: avgDuration,
            totalHistoricalRuns: this.historicalRuns.length,
            isStressTestActive: this.isStressTestActive
        });
        
        // Clear current run data for next run
        this.executionSummaries.clear();
        this.currentRunStartTime = undefined;
        
        // Update view to show all historical runs
        this.updateView();
    }

    private addEventData(data: ExtendedEventData): boolean {
        if (data.eventName !== 'sql_batch_completed') {
            this.logger.log('Ignoring non-sql_batch_completed event', { 
                eventName: data.eventName,
                executionNumber: data.executionNumber 
            });
            return false;
        }

        let summary = this.executionSummaries.get(data.executionNumber);
        if (!summary) {
            summary = {
                executionNumber: data.executionNumber,
                startTime: new Date(data.timestamp).getTime()
            };
            this.executionSummaries.set(data.executionNumber, summary);
            this.logger.log('Created execution summary from event data', { 
                executionNumber: data.executionNumber 
            });
        }

        const duration = data.eventFields['duration'] || data.eventFields['total_duration'];
        const rowCount = data.eventFields['row_count'];

        if (duration !== undefined && duration !== null) {
            summary.duration = typeof duration === 'number' ? duration : parseFloat(String(duration));
            this.logger.log('Updated duration from event', { 
                executionNumber: data.executionNumber,
                duration: summary.duration 
            });
        } else {
            this.logger.log('No duration field found in event', { 
                executionNumber: data.executionNumber,
                eventFields: Object.keys(data.eventFields) 
            });
        }

        if (rowCount !== undefined && rowCount !== null) {
            summary.rowCount = typeof rowCount === 'number' ? rowCount : parseInt(String(rowCount), 10);
            this.logger.log('Updated row count from event', { 
                executionNumber: data.executionNumber,
                rowCount: summary.rowCount 
            });
        }

        // Limit size
        if (this.executionSummaries.size > this.maxExecutions) {
            const firstKey = Math.min(...Array.from(this.executionSummaries.keys()));
            this.executionSummaries.delete(firstKey);
        }
        
        return true;
    }

    private addExecutionBoundary(boundary: ExecutionBoundary): void {
        let summary = this.executionSummaries.get(boundary.executionNumber);
        if (!summary) {
            // Create summary if it doesn't exist (boundary might arrive before ExtendedEventData)
            summary = {
                executionNumber: boundary.executionNumber,
                startTime: boundary.timestampMs
            };
            this.executionSummaries.set(boundary.executionNumber, summary);
            this.logger.log('Created execution summary from boundary', { 
                executionNumber: boundary.executionNumber,
                isStart: boundary.isStart 
            });
        }

        if (boundary.isStart) {
            summary.startTime = boundary.timestampMs;
            this.logger.log('Updated execution start time', { 
                executionNumber: boundary.executionNumber,
                startTime: boundary.timestampMs 
            });
        } else {
            summary.endTime = boundary.timestampMs;
            if (summary.startTime && !summary.duration) {
                summary.duration = boundary.timestampMs - summary.startTime;
                this.logger.log('Calculated duration from boundaries', { 
                    executionNumber: boundary.executionNumber,
                    duration: summary.duration 
                });
            }
        }
    }

    private addExecutionMetrics(metrics: ExecutionMetrics): void {
        let summary = this.executionSummaries.get(metrics.executionNumber);
        if (!summary) {
            summary = {
                executionNumber: metrics.executionNumber,
                startTime: metrics.timestampMs
            };
            this.executionSummaries.set(metrics.executionNumber, summary);
            this.logger.log('Created execution summary from metrics', { 
                executionNumber: metrics.executionNumber 
            });
        }
        summary.dataSizeBytes = metrics.dataSizeBytes;
        this.logger.log('Updated data size from metrics', { 
            executionNumber: metrics.executionNumber,
            dataSizeBytes: metrics.dataSizeBytes 
        });
    }

    private updateView(): void {
        if (!this.panel) {
            this.logger.log('Cannot update view - panel not available');
            return;
        }

        // Build list of runs to display: historical runs + current run (if active and has data)
        const runsToDisplay: HistoricalRun[] = [...this.historicalRuns];
        
        // If stress test is active and has data, create a temporary run from current summaries
        // Double-check isStressTestActive to ensure we don't show a current run if test was stopped
        if (this.isStressTestActive && this.currentRunStartTime !== undefined) {
            const summaries = Array.from(this.executionSummaries.values())
                .filter(s => s.startTime && (s.duration !== undefined || s.endTime !== undefined || s.dataSizeBytes !== undefined));
            
            if (summaries.length > 0) {
                const durations = summaries.map(e => e.duration).filter((d): d is number => d !== undefined);
                const dataSizes = summaries.map(e => e.dataSizeBytes).filter((d): d is number => d !== undefined);
                
                const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
                const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
                const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
                
                const currentRun: HistoricalRun = {
                    runId: this.currentRunId,
                    startTime: this.currentRunStartTime,
                    endTime: Date.now(),
                    avgDuration: avgDuration,
                    minDuration: minDuration,
                    maxDuration: maxDuration,
                    executionCount: summaries.length
                };
                
                if (dataSizes.length > 0) {
                    currentRun.avgDataSizeBytes = dataSizes.reduce((a, b) => a + b, 0) / dataSizes.length;
                    currentRun.minDataSizeBytes = Math.min(...dataSizes);
                    currentRun.maxDataSizeBytes = Math.max(...dataSizes);
                }
                
                runsToDisplay.push(currentRun);
            }
        }

        this.logger.log('Updating view', { 
            historicalRunsCount: this.historicalRuns.length,
            currentRunActive: this.isStressTestActive,
            totalRunsToDisplay: runsToDisplay.length,
            isStressTestActive: this.isStressTestActive,
            currentRunStartTime: this.currentRunStartTime,
            currentRunId: this.currentRunId
        });

        if (runsToDisplay.length === 0) {
            // Only send empty state if there are truly no historical runs
            if (this.historicalRuns.length === 0) {
                this.logger.log('No runs to display - sending empty state');
                this.panel.webview.postMessage({
                    command: 'updateMetrics',
                    cards: []
                });
            } else {
                // There are historical runs but no current run data yet
                // Always send historical runs to ensure they're displayed (especially on webview refresh)
                this.logger.log('No current run data yet, but sending historical runs', {
                    historicalRunsCount: this.historicalRuns.length
                });
                const historicalCards = this.calculateMetricCards(this.historicalRuns);
                this.panel.webview.postMessage({
                    command: 'updateMetrics',
                    cards: historicalCards
                });
            }
            return;
        }

        const cards = this.calculateMetricCards(runsToDisplay);

        this.logger.log('Sending metrics to webview', { 
            runCount: runsToDisplay.length,
            cardCount: cards.length,
            runIds: runsToDisplay.map(r => r.runId),
            cardLabels: cards.map(c => c.label)
        });

        this.panel.webview.postMessage({
            command: 'updateMetrics',
            cards
        });
    }

    private calculateMetricCards(runs: HistoricalRun[]): MetricCardData[] {
        if (runs.length === 0) {
            return [];
        }

        const cards: MetricCardData[] = [];

        // Create one card per run, comparing to previous run
        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const previousRun = i > 0 ? runs[i - 1] : undefined;

            const hasExecutionTime = run.avgDuration > 0;
            const hasDataSize = run.avgDataSizeBytes !== undefined;

            if (hasExecutionTime || hasDataSize) {
                cards.push({
                    label: `Run #${run.runId}`,
                    runId: run.runId,
                    current: hasExecutionTime ? run.avgDuration : run.avgDataSizeBytes!,
                    previous: hasExecutionTime 
                        ? previousRun?.avgDuration 
                        : previousRun?.avgDataSizeBytes,
                    trend: hasExecutionTime
                        ? this.calculateTrend(run.avgDuration, previousRun?.avgDuration)
                        : this.calculateTrend(run.avgDataSizeBytes!, previousRun?.avgDataSizeBytes),
                    unit: hasExecutionTime ? 'ms' : 'bytes',
                    min: hasExecutionTime ? run.minDuration : run.minDataSizeBytes,
                    max: hasExecutionTime ? run.maxDuration : run.maxDataSizeBytes,
                    executionTime: hasExecutionTime ? {
                        current: run.avgDuration,
                        previous: previousRun?.avgDuration,
                        trend: this.calculateTrend(run.avgDuration, previousRun?.avgDuration),
                        unit: 'ms',
                        min: run.minDuration,
                        max: run.maxDuration
                    } : undefined,
                    dataSize: hasDataSize ? {
                        current: run.avgDataSizeBytes!,
                        previous: previousRun?.avgDataSizeBytes,
                        trend: this.calculateTrend(run.avgDataSizeBytes!, previousRun?.avgDataSizeBytes),
                        unit: 'bytes',
                        min: run.minDataSizeBytes,
                        max: run.maxDataSizeBytes
                    } : undefined
                });
            }
        }

        return cards;
    }

    private calculateTrend(current: number, previous?: number): 'up' | 'down' | 'stable' {
        if (previous === undefined) {
            return 'stable';
        }

        const changePercent = Math.abs((current - previous) / previous) * 100;
        if (changePercent < 5) {
            return 'stable';
        }

        return current > previous ? 'up' : 'down';
    }

    private getHistoricalMetricsStyles(): string {
        return `
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .metrics-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            width: 100%;
        }
        .metric-card {
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 15px;
            background-color: var(--vscode-input-background);
            width: 100%;
            box-sizing: border-box;
        }
        .metric-card.combined {
            width: 100%;
        }
        .metric-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .metric-stats {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
        }
        .trend {
            display: inline-block;
            margin-left: 8px;
            font-size: 16px;
        }
        .trend.up { color: var(--vscode-errorForeground); }
        .trend.down { color: var(--vscode-textLink-foreground); }
        .trend.stable { color: var(--vscode-descriptionForeground); }
        .combined-metrics {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 15px;
        }
        .combined-metric-section {
            display: flex;
            flex-direction: column;
        }
        .combined-metric-value {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    `;
    }

    private getHistoricalMetricsBody(): string {
        return `
    <h2>Historical Metrics</h2>
    <div id="metricsContainer" class="metrics-container">
        <div class="empty-state">Waiting for stress test data...</div>
    </div>
    `;
    }

    private getHistoricalMetricsScript(): string {
        const scriptPath = path.join(this.context.extensionPath, 'webviews', 'historicalMetricsView.js');
        try {
            return fs.readFileSync(scriptPath, 'utf8');
        } catch (error) {
            this.logger.error('Failed to load historicalMetricsView.js', error);
            return '// Error loading script';
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Historical Metrics</title>
    <style>${this.getHistoricalMetricsStyles()}</style>
</head>
<body>${this.getHistoricalMetricsBody()}
    <script>${this.getHistoricalMetricsScript()}</script>
</body>
</html>`;
    }

    dispose(): void {
        this.logger.log('Disposing historical metrics view');
        if (this.extendedEventDataCallback) {
            this.websocketClient.offExtendedEventData(this.extendedEventDataCallback);
        }
        if (this.executionBoundaryCallback) {
            this.websocketClient.offExecutionBoundary(this.executionBoundaryCallback);
        }
        if (this.executionMetricsCallback) {
            this.websocketClient.offExecutionMetrics(this.executionMetricsCallback);
        }
        this.panel?.dispose();
        this.panel = undefined;
        this.executionSummaries.clear();
        // Note: We don't clear historicalRuns on dispose - they should persist
    }
}


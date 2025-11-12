import * as vscode from 'vscode';
import { WebSocketClient, PerformanceData } from '../services/websocketClient';
import { ILogger, Logger } from '../services/logger';

export class PerformanceGraph {
    private panel: vscode.WebviewPanel | undefined;
    private performanceDataCallback: ((data: PerformanceData) => void) | null = null;
    private dataPoints: PerformanceData[] = [];
    private readonly maxDataPoints = 100;
    private logger: ILogger;
    private selectedConnectionId: string | undefined;

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
            'Performance Graph',
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

        // Register for performance data updates
        // Note: In the future, this could be filtered by connectionId
        this.performanceDataCallback = (data: PerformanceData) => {
            // TODO: Filter data by connectionId if provided
            this.addDataPoint(data);
            this.updateChart();
        };

        this.websocketClient.onPerformanceData(this.performanceDataCallback);
        this.logger.log('Performance graph panel opened and registered for data updates', { connectionId });
    }

    private addDataPoint(data: PerformanceData): void {
        this.dataPoints.push(data);
        if (this.dataPoints.length > this.maxDataPoints) {
            this.dataPoints.shift();
        }
        this.logger.log('Performance data point added', { 
            cpuPercent: data.cpuPercent, 
            dataPointsCount: this.dataPoints.length 
        });
    }

    private updateChart(): void {
        if (!this.panel) {
            return;
        }

        this.panel.webview.postMessage({
            command: 'updateData',
            data: this.dataPoints
        });
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Graph</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #chartContainer {
            position: relative;
            height: 400px;
            width: 100%;
        }
    </style>
</head>
<body>
    <h2>CPU Performance</h2>
    <div id="chartContainer">
        <canvas id="performanceChart"></canvas>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU %',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true
                    }
                }
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                const data = message.data;
                const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
                const values = data.map(d => d.cpuPercent);
                
                chart.data.labels = labels;
                chart.data.datasets[0].data = values;
                chart.update();
            }
        });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.logger.log('Disposing performance graph');
        if (this.performanceDataCallback) {
            this.websocketClient.offPerformanceData(this.performanceDataCallback);
        }
        this.panel?.dispose();
        this.panel = undefined;
        this.dataPoints = [];
    }
}


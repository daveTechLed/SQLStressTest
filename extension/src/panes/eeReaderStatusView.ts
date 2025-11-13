import * as vscode from 'vscode';
import { WebSocketClient, ExtendedEventData } from '../services/websocketClient';
import { ILogger, Logger } from '../services/logger';
import * as signalR from '@microsoft/signalr';

interface EventWindowEntry {
    timestamp: number;
    eventName: string;
}

interface StatusMetrics {
    readsPerSecond: number;
    totalEventsInWindow: number;
    eventTypeCounts: Map<string, number>;
    connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'reconnecting';
    readingStatus: 'reading' | 'not-reading';
    sessionStatus: 'active' | 'inactive';
    lastEventTimestamp: number | null;
    lastUpdateTimestamp: number;
}

export class EEReaderStatusView {
    private panel: vscode.WebviewPanel | undefined;
    private extendedEventDataCallback: ((data: ExtendedEventData) => void) | null = null;
    private eventWindow: EventWindowEntry[] = [];
    private readonly windowSizeMs = 60000; // 60 seconds
    private readonly readingThresholdMs = 5000; // 5 seconds
    private readonly sessionInactiveThresholdMs = 30000; // 30 seconds
    private updateInterval: NodeJS.Timeout | null = null;
    private logger: ILogger;
    private lastEventTimestamp: number | null = null;
    private connectionState: signalR.HubConnectionState = signalR.HubConnectionState.Disconnected;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - EE Reader Status');
        this.logger.log('EEReaderStatusView initialized');
    }

    show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.logger.log('Showing EE Reader Status panel');
        this.panel = vscode.window.createWebviewPanel(
            'eeReaderStatus',
            'EE Reader Status',
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

        // Register for Extended Events data updates
        this.extendedEventDataCallback = (data: ExtendedEventData) => {
            this.addEvent(data);
        };

        this.websocketClient.onExtendedEventData(this.extendedEventDataCallback);

        // Monitor connection state
        this.updateConnectionState();
        // Check connection state periodically
        const connectionCheckInterval = setInterval(() => {
            this.updateConnectionState();
        }, 1000);

        // Start periodic updates
        this.updateInterval = setInterval(() => {
            this.updateView();
        }, 500); // Update every .5 secs

        // Initial update
        this.updateView();

        // Clean up connection check on dispose
        this.panel.onDidDispose(() => {
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
            }
        });
    }

    private updateConnectionState(): void {
        // Access the connection property via type assertion since it's private
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connection = (this.websocketClient as any).connection as signalR.HubConnection | null;
        
        if (connection) {
            this.connectionState = connection.state;
        } else {
            this.connectionState = signalR.HubConnectionState.Disconnected;
        }
    }

    private addEvent(data: ExtendedEventData): void {
        const now = Date.now();
        
        // Add event to window
        this.eventWindow.push({
            timestamp: now, // Use current time for window calculation
            eventName: data.eventName
        });

        // Remove events older than window size
        const cutoffTime = now - this.windowSizeMs;
        this.eventWindow = this.eventWindow.filter(e => e.timestamp >= cutoffTime);

        // Update last event timestamp
        this.lastEventTimestamp = now;
    }

    private calculateMetrics(): StatusMetrics {
        const now = Date.now();
        const cutoffTime = now - this.windowSizeMs;
        
        // Filter to events in the last 60 seconds
        const recentEvents = this.eventWindow.filter(e => e.timestamp >= cutoffTime);
        
        // Count events by type
        const eventTypeCounts = new Map<string, number>();
        recentEvents.forEach(event => {
            const count = eventTypeCounts.get(event.eventName) || 0;
            eventTypeCounts.set(event.eventName, count + 1);
        });

        // Calculate reads per second (average over 60 seconds)
        const readsPerSecond = recentEvents.length / 60;

        // Determine reading status
        const timeSinceLastEvent = this.lastEventTimestamp ? now - this.lastEventTimestamp : Infinity;
        const readingStatus: 'reading' | 'not-reading' = timeSinceLastEvent < this.readingThresholdMs ? 'reading' : 'not-reading';

        // Determine session status
        const sessionStatus: 'active' | 'inactive' = timeSinceLastEvent < this.sessionInactiveThresholdMs ? 'active' : 'inactive';

        // Determine connection status
        let connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'reconnecting';
        switch (this.connectionState) {
            case signalR.HubConnectionState.Connected:
                connectionStatus = 'connected';
                break;
            case signalR.HubConnectionState.Connecting:
                connectionStatus = 'connecting';
                break;
            case signalR.HubConnectionState.Reconnecting:
                connectionStatus = 'reconnecting';
                break;
            default:
                connectionStatus = 'disconnected';
                break;
        }

        return {
            readsPerSecond,
            totalEventsInWindow: recentEvents.length,
            eventTypeCounts,
            connectionStatus,
            readingStatus,
            sessionStatus,
            lastEventTimestamp: this.lastEventTimestamp,
            lastUpdateTimestamp: now
        };
    }

    private updateView(): void {
        if (!this.panel) {
            return;
        }

        const metrics = this.calculateMetrics();
        
        // Convert Map to object for JSON serialization
        const eventTypeCountsObj: { [key: string]: number } = {};
        metrics.eventTypeCounts.forEach((count, eventName) => {
            eventTypeCountsObj[eventName] = count;
        });

        // Calculate averages per event type (per second over 60 seconds)
        const eventTypeAverages: { [key: string]: number } = {};
        Object.keys(eventTypeCountsObj).forEach(eventName => {
            eventTypeAverages[eventName] = eventTypeCountsObj[eventName] / 60;
        });

        this.panel.webview.postMessage({
            command: 'updateMetrics',
            metrics: {
                readsPerSecond: metrics.readsPerSecond,
                totalEventsInWindow: metrics.totalEventsInWindow,
                eventTypeAverages,
                connectionStatus: metrics.connectionStatus,
                readingStatus: metrics.readingStatus,
                sessionStatus: metrics.sessionStatus,
                lastEventTimestamp: metrics.lastEventTimestamp,
                lastUpdateTimestamp: metrics.lastUpdateTimestamp
            }
        });
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EE Reader Status</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        h1 {
            color: var(--vscode-foreground);
        }
        .status-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .status-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
        }
        .status-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
        }
        .status-value {
            font-size: 24px;
            font-weight: bold;
            margin: 10px 0;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-indicator.connected { background-color: #4caf50; }
        .status-indicator.disconnected { background-color: #f44336; }
        .status-indicator.connecting { background-color: #ff9800; }
        .status-indicator.reconnecting { background-color: #ff9800; }
        .status-indicator.reading { background-color: #4caf50; }
        .status-indicator.not-reading { background-color: #ffc107; }
        .status-indicator.active { background-color: #4caf50; }
        .status-indicator.inactive { background-color: #f44336; }
        .reads-per-second {
            font-size: 36px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            text-align: center;
            margin: 20px 0;
        }
        .chart-container {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 20px;
            margin-top: 20px;
        }
        .chart-container h2 {
            margin: 0 0 20px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .last-update {
            text-align: center;
            color: var(--vscode-foreground);
            font-size: 12px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <h1>Extended Events Reader Status</h1>
    
    <div class="reads-per-second" id="readsPerSecond">0.00</div>
    <div style="text-align: center; color: var(--vscode-descriptionForeground); margin-bottom: 20px;">
        Events per second (60-second average)
    </div>

    <div class="status-container">
        <div class="status-card">
            <h3>Connection Status</h3>
            <div>
                <span class="status-indicator" id="connectionIndicator"></span>
                <span id="connectionStatus">Disconnected</span>
            </div>
        </div>
        <div class="status-card">
            <h3>Reading Status</h3>
            <div>
                <span class="status-indicator" id="readingIndicator"></span>
                <span id="readingStatus">Not Reading</span>
            </div>
        </div>
        <div class="status-card">
            <h3>Session Status</h3>
            <div>
                <span class="status-indicator" id="sessionIndicator"></span>
                <span id="sessionStatus">Inactive</span>
            </div>
        </div>
        <div class="status-card">
            <h3>Total Events</h3>
            <div class="status-value" id="totalEvents">0</div>
            <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                (Last 60 seconds)
            </div>
        </div>
    </div>

    <div class="chart-container">
        <h2>Event Types (Average per Second - Last 60 Seconds)</h2>
        <canvas id="eventChart"></canvas>
    </div>

    <div class="last-update" id="lastUpdate">Last update: Never</div>

    <script>
        const vscode = acquireVsCodeApi();
        let chart = null;

        function updateMetrics(data) {
            // Update reads per second
            document.getElementById('readsPerSecond').textContent = data.metrics.readsPerSecond.toFixed(2);

            // Update total events
            document.getElementById('totalEvents').textContent = data.metrics.totalEventsInWindow;

            // Update connection status
            const connectionStatus = data.metrics.connectionStatus;
            const connectionIndicator = document.getElementById('connectionIndicator');
            const connectionStatusText = document.getElementById('connectionStatus');
            connectionIndicator.className = 'status-indicator ' + connectionStatus;
            connectionStatusText.textContent = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1).replace('-', ' ');

            // Update reading status
            const readingStatus = data.metrics.readingStatus;
            const readingIndicator = document.getElementById('readingIndicator');
            const readingStatusText = document.getElementById('readingStatus');
            readingIndicator.className = 'status-indicator ' + readingStatus;
            readingStatusText.textContent = readingStatus === 'reading' ? 'Reading' : 'Not Reading';

            // Update session status
            const sessionStatus = data.metrics.sessionStatus;
            const sessionIndicator = document.getElementById('sessionIndicator');
            const sessionStatusText = document.getElementById('sessionStatus');
            sessionIndicator.className = 'status-indicator ' + sessionStatus;
            sessionStatusText.textContent = sessionStatus === 'active' ? 'Active' : 'Inactive';

            // Update chart
            updateChart(data.metrics.eventTypeAverages);

            // Update last update time
            const lastUpdate = new Date(data.metrics.lastUpdateTimestamp);
            document.getElementById('lastUpdate').textContent = 'Last update: ' + lastUpdate.toLocaleTimeString();
        }

        function updateChart(eventTypeAverages) {
            const ctx = document.getElementById('eventChart').getContext('2d');
            
            // Get computed text color from CSS variable
            const getComputedColor = (cssVar) => {
                try {
                    // Try to get computed color from body element first
                    const bodyStyle = window.getComputedStyle(document.body);
                    const bodyColor = bodyStyle.color;
                    if (bodyColor && bodyColor !== 'rgba(0, 0, 0, 0)' && bodyColor !== 'transparent') {
                        return bodyColor;
                    }
                    
                    // Fallback: create temp element
                    const tempDiv = document.createElement('div');
                    tempDiv.style.color = cssVar;
                    document.body.appendChild(tempDiv);
                    const computedColor = window.getComputedStyle(tempDiv).color;
                    document.body.removeChild(tempDiv);
                    
                    // If we got a valid color, return it; otherwise use white as fallback
                    if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') {
                        return computedColor;
                    }
                } catch (e) {
                    // Fall through to default
                }
                
                // Default fallback: use white for dark themes
                return '#ffffff';
            };
            
            const textColor = getComputedColor('var(--vscode-foreground)');
            
            // Sort event types by average (descending) and get top 20
            const sortedEntries = Object.entries(eventTypeAverages)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20);

            const labels = sortedEntries.map(([name]) => name);
            const data = sortedEntries.map(([, avg]) => avg);

            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets[0].data = data;
                // Update colors if needed
                chart.options.scales.x.title.color = textColor;
                chart.options.scales.x.ticks.color = textColor;
                chart.options.scales.y.ticks.color = textColor;
                chart.update();
            } else {
                chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Events per Second',
                            data: data,
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1,
                                callbacks: {
                                    label: function(context) {
                                        return context.parsed.x.toFixed(3) + ' events/sec';
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Events per Second (Average)',
                                    color: textColor,
                                    font: {
                                        size: 12,
                                        weight: 'bold'
                                    }
                                },
                                ticks: {
                                    color: textColor,
                                    font: {
                                        size: 11
                                    }
                                },
                                grid: {
                                    color: 'rgba(128, 128, 128, 0.2)',
                                    drawBorder: false
                                }
                            },
                            y: {
                                ticks: {
                                    color: textColor,
                                    font: {
                                        size: 11
                                    }
                                },
                                grid: {
                                    color: 'rgba(128, 128, 128, 0.2)',
                                    drawBorder: false
                                }
                            }
                        }
                    }
                });
            }
        }

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateMetrics') {
                updateMetrics(message);
            }
        });
    </script>
</body>
</html>`;
    }

    private dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.extendedEventDataCallback) {
            this.websocketClient.offExtendedEventData(this.extendedEventDataCallback);
            this.extendedEventDataCallback = null;
        }

        this.panel = undefined;
        this.logger.log('EEReaderStatusView disposed');
    }
}


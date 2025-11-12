import * as vscode from 'vscode';
import { WebSocketClient } from '../services/websocketClient';
import { HttpClient, QueryRequest, QueryResponse } from '../services/httpClient';
import { StorageService } from '../services/storage';
import { ILogger, Logger } from '../services/logger';

export class QueryEditor {
    private panel: vscode.WebviewPanel | undefined;
    private httpClient: HttpClient;
    private storageService: StorageService;
    private logger: ILogger;
    private selectedConnectionId: string | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - Query Editor');
        this.httpClient = new HttpClient(undefined, this.logger);
        this.storageService = new StorageService(context);
        this.logger.log('QueryEditor initialized');
    }

    show(connectionId?: string): void {
        this.selectedConnectionId = connectionId;
        
        if (this.panel) {
            this.panel.reveal();
            // Update connection selection if panel already exists
            if (connectionId) {
                this.sendConnections();
            }
            return;
        }

        this.logger.log('Showing query editor panel', { connectionId });
        this.panel = vscode.window.createWebviewPanel(
            'queryEditor',
            'SQL Query Editor',
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

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            this.logger.log('Message received from webview', { command: message.command });
            switch (message.command) {
                case 'executeQuery':
                    await this.executeQuery(message.connectionId, message.query);
                    break;
                case 'executeStressTest':
                    await this.executeStressTest(
                        message.connectionId, 
                        message.query,
                        message.parallelExecutions,
                        message.totalExecutions
                    );
                    break;
                case 'getConnections':
                    await this.sendConnections();
                    break;
            }
        });

        // Send initial connections
        this.sendConnections();
    }

    private async sendConnections(): Promise<void> {
        if (!this.panel) {
            return;
        }

        const connections = await this.storageService.loadConnections();
        this.logger.log('Sending connections to webview', { count: connections.length, selectedConnectionId: this.selectedConnectionId });
        this.panel.webview.postMessage({
            command: 'connections',
            data: connections,
            selectedConnectionId: this.selectedConnectionId
        });
    }

    private async executeQuery(connectionId: string, query: string): Promise<void> {
        if (!this.panel) {
            return;
        }

        this.logger.log('Executing query', { connectionId, queryLength: query.length });
        const request: QueryRequest = {
            connectionId,
            query
        };

        try {
            const response = await this.httpClient.executeQuery(request);
            this.logger.log('Query execution completed', { 
                success: response.success, 
                rowCount: response.rowCount,
                executionTimeMs: response.executionTimeMs 
            });
            this.panel.webview.postMessage({
                command: 'queryResult',
                data: response
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Query execution error', error);
            this.panel.webview.postMessage({
                command: 'queryResult',
                data: {
                    success: false,
                    error: errorMessage
                } as QueryResponse
            });
        }
    }

    private async executeStressTest(
        connectionId: string, 
        query: string,
        parallelExecutions: number,
        totalExecutions: number
    ): Promise<void> {
        if (!this.panel) {
            return;
        }

        this.logger.log('Executing stress test', { 
            connectionId, 
            queryLength: query.length,
            parallelExecutions,
            totalExecutions
        });

        // Notify that stress test is starting (this will be handled by extension.ts to start PerformanceGraph)
        vscode.commands.executeCommand('sqlStressTest.showPerformanceGraph', connectionId);

        try {
            const response = await this.httpClient.executeStressTest({
                connectionId,
                query,
                parallelExecutions,
                totalExecutions
            });
            
            this.logger.log('Stress test execution completed', { 
                success: response.success, 
                testId: response.testId,
                message: response.message,
                error: response.error
            });
            
            this.panel.webview.postMessage({
                command: 'stressTestResult',
                data: response
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Stress test execution error', error);
            this.panel.webview.postMessage({
                command: 'stressTestResult',
                data: {
                    success: false,
                    error: errorMessage
                }
            });
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Query Editor</title>
    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
    <style>
        body {
            font-family: var(--vscode-font-family);
            margin: 0;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #toolbar {
            margin-bottom: 10px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        select, button {
            padding: 5px 10px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #editor {
            height: 300px;
            border: 1px solid var(--vscode-input-border);
        }
        #results {
            margin-top: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th, td {
            border: 1px solid var(--vscode-input-border);
            padding: 5px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-list-hoverBackground);
        }
        .error {
            color: var(--vscode-errorForeground);
            padding: 10px;
            background-color: var(--vscode-inputValidation-errorBackground);
        }
        .info {
            padding: 10px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <select id="connectionSelect">
            <option value="">Select connection...</option>
        </select>
        <button id="executeBtn">Execute</button>
    </div>
    <div id="stressTestConfig" style="margin-top: 10px; padding: 10px; border: 1px solid var(--vscode-input-border); background-color: var(--vscode-input-background);">
        <h3 style="margin-top: 0;">Stress Test Configuration</h3>
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
            <label>
                Parallel Executions:
                <input type="number" id="parallelExecutions" value="1" min="1" max="1000" style="width: 80px; margin-left: 5px; padding: 3px;">
            </label>
            <label>
                Total Executions:
                <input type="number" id="totalExecutions" value="10" min="1" max="100000" style="width: 80px; margin-left: 5px; padding: 3px;">
            </label>
            <button id="stressTestBtn" style="padding: 5px 15px;">Run Stress Test</button>
        </div>
        <div id="stressTestStatus" style="font-size: 12px; color: var(--vscode-descriptionForeground);"></div>
    </div>
    <div id="editor"></div>
    <div id="results"></div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let editor;
        
        require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
        require(['vs/editor/editor.main'], function() {
            editor = monaco.editor.create(document.getElementById('editor'), {
                value: 'SELECT * FROM sys.tables;',
                language: 'sql',
                theme: 'vs-dark',
                automaticLayout: true
            });
        });

        const connectionSelect = document.getElementById('connectionSelect');
        const executeBtn = document.getElementById('executeBtn');
        const stressTestBtn = document.getElementById('stressTestBtn');
        const parallelExecutionsInput = document.getElementById('parallelExecutions');
        const totalExecutionsInput = document.getElementById('totalExecutions');
        const stressTestStatus = document.getElementById('stressTestStatus');
        const resultsDiv = document.getElementById('results');

        executeBtn.addEventListener('click', () => {
            const connectionId = connectionSelect.value;
            const query = editor.getValue();
            
            if (!connectionId) {
                showError('Please select a connection');
                return;
            }
            
            if (!query.trim()) {
                showError('Please enter a query');
                return;
            }

            vscode.postMessage({
                command: 'executeQuery',
                connectionId: connectionId,
                query: query
            });
        });

        stressTestBtn.addEventListener('click', () => {
            const connectionId = connectionSelect.value;
            const query = editor.getValue();
            const parallelExecutions = parseInt(parallelExecutionsInput.value) || 1;
            const totalExecutions = parseInt(totalExecutionsInput.value) || 10;
            
            if (!connectionId) {
                showError('Please select a connection');
                return;
            }
            
            if (!query.trim()) {
                showError('Please enter a query');
                return;
            }

            if (parallelExecutions < 1 || parallelExecutions > 1000) {
                showError('Parallel executions must be between 1 and 1000');
                return;
            }

            if (totalExecutions < 1 || totalExecutions > 100000) {
                showError('Total executions must be between 1 and 100000');
                return;
            }

            stressTestStatus.textContent = 'Starting stress test...';
            stressTestBtn.disabled = true;

            vscode.postMessage({
                command: 'executeStressTest',
                connectionId: connectionId,
                query: query,
                parallelExecutions: parallelExecutions,
                totalExecutions: totalExecutions
            });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'connections':
                    updateConnections(message.data, message.selectedConnectionId);
                    break;
                case 'queryResult':
                    showResults(message.data);
                    break;
                case 'stressTestResult':
                    if (message.data.success) {
                        stressTestStatus.textContent = 'Stress test completed: ' + (message.data.message || 'Success');
                        stressTestStatus.style.color = 'var(--vscode-textLink-foreground)';
                    } else {
                        stressTestStatus.textContent = 'Stress test failed: ' + (message.data.error || 'Unknown error');
                        stressTestStatus.style.color = 'var(--vscode-errorForeground)';
                    }
                    stressTestBtn.disabled = false;
                    break;
            }
        });

        function updateConnections(connections, selectedConnectionId) {
            connectionSelect.innerHTML = '<option value="">Select connection...</option>';
            connections.forEach(conn => {
                const option = document.createElement('option');
                option.value = conn.id;
                option.textContent = conn.name + ' (' + conn.server + ')';
                if (selectedConnectionId && conn.id === selectedConnectionId) {
                    option.selected = true;
                }
                connectionSelect.appendChild(option);
            });
        }

        function showResults(result) {
            if (!result.success) {
                showError(result.error || 'Query execution failed');
                return;
            }

            let html = '<div class="info">';
            html += 'Rows: ' + (result.rowCount || 0) + ' | ';
            html += 'Execution time: ' + (result.executionTimeMs || 0) + 'ms';
            html += '</div>';

            if (result.columns && result.rows) {
                html += '<table><thead><tr>';
                result.columns.forEach(col => {
                    html += '<th>' + escapeHtml(col) + '</th>';
                });
                html += '</tr></thead><tbody>';

                result.rows.forEach(row => {
                    html += '<tr>';
                    row.forEach(cell => {
                        html += '<td>' + escapeHtml(cell !== null && cell !== undefined ? cell.toString() : '') + '</td>';
                    });
                    html += '</tr>';
                });

                html += '</tbody></table>';
            }

            resultsDiv.innerHTML = html;
        }

        function showError(message) {
            resultsDiv.innerHTML = '<div class="error">' + escapeHtml(message) + '</div>';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Request connections on load
        vscode.postMessage({ command: 'getConnections' });
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.logger.log('Disposing query editor');
        this.panel?.dispose();
        this.panel = undefined;
    }
}


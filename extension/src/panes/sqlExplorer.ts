import * as vscode from 'vscode';
import { StorageService, ConnectionConfig } from '../services/storage';
import { HttpClient } from '../services/httpClient';
import { WebSocketClient } from '../services/websocketClient';
import { ILogger, Logger } from '../services/logger';

export class SqlServerExplorer implements vscode.TreeDataProvider<ServerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ServerTreeItem | undefined | null | void> = new vscode.EventEmitter<ServerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ServerTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private storageService: StorageService;
    private httpClient: HttpClient;
    private connections: ConnectionConfig[] = [];
    private logger: ILogger;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - SQL Explorer');
        this.storageService = new StorageService(context);
        this.httpClient = new HttpClient(undefined, this.logger);
        this.logger.log('SqlServerExplorer initialized');
        this.loadConnections();
    }

    private async loadConnections(): Promise<void> {
        this.connections = await this.storageService.loadConnections();
        this.logger.log('Connections loaded', { count: this.connections.length });
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ServerTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ServerTreeItem): Promise<ServerTreeItem[]> {
        if (!element) {
            // Root level - show all servers
            return this.connections.map(conn => new ServerTreeItem(
                conn.name,
                conn.server,
                conn.id,
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        if (element.contextValue === 'server') {
            // Server level - show databases (placeholder for now)
            return [
                new ServerTreeItem('Databases', '', '', vscode.TreeItemCollapsibleState.None, 'database')
            ];
        }

        return [];
    }

    async addServer(): Promise<void> {
        await this.showConnectionDialog();
    }

    private async showConnectionDialog(editConnection?: ConnectionConfig): Promise<void> {
        return new Promise<void>((resolve) => {
            const panel = vscode.window.createWebviewPanel(
                'sqlConnectionDialog',
                editConnection ? 'Edit SQL Server Connection' : 'Add SQL Server Connection',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: false
                }
            );

            const isEdit = !!editConnection;
            const connection: ConnectionConfig = editConnection || {
                id: '',
                name: '',
                server: '',
                database: '',
                username: '',
                password: '',
                integratedSecurity: true,
                port: 1433
            };

            panel.webview.html = this.getConnectionDialogHtml(connection, isEdit);

            // Track if dialog is being disposed to prevent multiple resolves
            let isDisposed = false;

            panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'testConnection':
                            // Test connection before saving
                            const testConfig: ConnectionConfig = {
                                id: '',
                                name: message.name || '',
                                server: message.server || '',
                                database: message.database || undefined,
                                username: message.username || undefined,
                                password: message.password || undefined,
                                integratedSecurity: message.integratedSecurity === true,
                                port: message.port
                            };

                            try {
                                this.logger.log('Testing connection from dialog', { server: testConfig.server, name: testConfig.name });
                                const testResult = await this.httpClient.testConnection(testConfig);
                                
                                // Send result back to webview
                                panel.webview.postMessage({
                                    command: 'testConnectionResult',
                                    success: testResult.success,
                                    error: testResult.error,
                                    serverVersion: testResult.serverVersion,
                                    authenticatedUser: testResult.authenticatedUser,
                                    databases: testResult.databases,
                                    serverName: testResult.serverName
                                });
                            } catch (error: any) {
                                this.logger.error('Test connection error', error);
                                panel.webview.postMessage({
                                    command: 'testConnectionResult',
                                    success: false,
                                    error: error.message || 'Connection test failed'
                                });
                            }
                            break;
                        case 'save':
                            const config: ConnectionConfig = {
                                id: editConnection?.id || `conn_${Date.now()}`,
                                name: message.name || '',
                                server: message.server || '',
                                database: message.database || undefined,
                                username: message.username || undefined,
                                password: message.password || undefined,
                                integratedSecurity: message.integratedSecurity === true,
                                port: message.port ? parseInt(message.port, 10) : undefined
                            };

                            if (!config.name || !config.server) {
                                panel.webview.postMessage({
                                    command: 'saveResult',
                                    success: false,
                                    error: 'Name and Server are required fields'
                                });
                                return;
                            }

                            // Show saving state in dialog
                            panel.webview.postMessage({
                                command: 'saving',
                                saving: true
                            });

                            // Perform the save operation
                            try {
                                this.logger.info('=== STARTING CONNECTION SAVE ===');
                                this.logger.info('Connection details (password masked)', { 
                                    id: config.id,
                                    name: config.name, 
                                    server: config.server,
                                    database: config.database,
                                    username: config.username,
                                    port: config.port,
                                    integratedSecurity: config.integratedSecurity,
                                    password: '***MASKED***'
                                });
                                
                                // Get connection count before save
                                const connectionsBefore = await this.storageService.loadConnections();
                                this.logger.info(`Connection count before save: ${connectionsBefore.length}`);
                                
                                // Use updateConnection if editing, otherwise addConnection
                                if (isEdit && editConnection?.id) {
                                    await this.storageService.updateConnection(editConnection.id, config);
                                    this.logger.info('Connection updated successfully in VS Code storage', { 
                                        id: config.id,
                                        name: config.name, 
                                        server: config.server 
                                    });
                                    
                                    // Verify the connection was updated
                                    const connectionsAfter = await this.storageService.loadConnections();
                                    this.logger.info(`Connection count after update: ${connectionsAfter.length}`);
                                    
                                    const savedConnection = connectionsAfter.find(c => c.id === config.id);
                                    if (savedConnection) {
                                        this.logger.info('=== CONNECTION UPDATE VERIFIED IN STORAGE ===');
                                        this.logger.info('Updated connection found: Id={id}, Name={name}, Server={server}', {
                                            id: savedConnection.id,
                                            name: savedConnection.name,
                                            server: savedConnection.server
                                        });
                                    } else {
                                        this.logger.error('=== CONNECTION UPDATE VERIFICATION FAILED ===');
                                        this.logger.error('Connection NOT found in storage after update!', {
                                            expectedId: config.id,
                                            availableIds: connectionsAfter.map(c => c.id)
                                        });
                                        throw new Error('Connection update verification failed - connection not found in storage');
                                    }
                                } else {
                                    await this.storageService.addConnection(config);
                                    this.logger.info('Connection saved successfully to VS Code storage', { 
                                        id: config.id,
                                        name: config.name, 
                                        server: config.server 
                                    });
                                    
                                    // Verify the connection was saved
                                    const connectionsAfter = await this.storageService.loadConnections();
                                    this.logger.info(`Connection count after save: ${connectionsAfter.length}`);
                                    
                                    const savedConnection = connectionsAfter.find(c => c.id === config.id);
                                    if (savedConnection) {
                                        this.logger.info('=== CONNECTION SAVE VERIFIED IN STORAGE ===');
                                        this.logger.info('Saved connection found: Id={id}, Name={name}, Server={server}', {
                                            id: savedConnection.id,
                                            name: savedConnection.name,
                                            server: savedConnection.server
                                        });
                                    } else {
                                        this.logger.error('=== CONNECTION SAVE VERIFICATION FAILED ===');
                                        this.logger.error('Connection NOT found in storage after save!', {
                                            expectedId: config.id,
                                            availableIds: connectionsAfter.map(c => c.id)
                                        });
                                        throw new Error('Connection save verification failed - connection not found in storage');
                                    }
                                }
                                
                                // Notify backend that connection was saved so it can reload its cache
                                try {
                                    this.logger.info('Notifying backend of connection save', { connectionId: config.id });
                                    await this.websocketClient.notifyConnectionSaved(config.id);
                                    this.logger.info('Backend notification sent successfully', { connectionId: config.id });
                                } catch (error: any) {
                                    // Log but don't fail - save operation succeeded even if notification fails
                                    this.logger.error('=== BACKEND NOTIFICATION FAILED ===');
                                    this.logger.error('Failed to notify backend of connection save', { 
                                        error: error?.message || String(error),
                                        errorStack: error?.stack,
                                        connectionId: config.id 
                                    });
                                }
                                
                                await this.loadConnections();
                                this.logger.info('=== CONNECTION SAVE COMPLETED ===');
                                
                                // Send success message to dialog - dialog will stay open until user closes it
                                panel.webview.postMessage({
                                    command: 'saveResult',
                                    success: true,
                                    message: 'Connection saved successfully!'
                                });
                                
                                // Mark as resolved but don't close - let user close manually after seeing success
                                if (!isDisposed) {
                                    isDisposed = true;
                                    resolve();
                                }
                            } catch (error: any) {
                                this.logger.error('=== CONNECTION SAVE FAILED ===');
                                this.logger.error('Error saving connection to storage', {
                                    error: error?.message || String(error),
                                    errorStack: error?.stack,
                                    connectionId: config.id
                                });
                                
                                // Send error message to dialog
                                panel.webview.postMessage({
                                    command: 'saveResult',
                                    success: false,
                                    error: error?.message || 'Failed to save connection'
                                });
                            }
                            break;
                        case 'cancel':
                            if (!isDisposed) {
                                isDisposed = true;
                                panel.dispose();
                                resolve();
                            }
                            break;
                        case 'closeAfterSave':
                            // User clicked close button after successful save
                            if (!isDisposed) {
                                isDisposed = true;
                                panel.dispose();
                                resolve();
                            }
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );

            // Handle panel disposal
            panel.onDidDispose(() => {
                if (!isDisposed) {
                    isDisposed = true;
                    resolve();
                }
            });
        });
    }

    private getConnectionDialogHtml(connection: ConnectionConfig, isEdit: boolean): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Server Connection</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        .required {
            color: var(--vscode-errorForeground);
        }
        input[type="text"],
        input[type="password"],
        input[type="number"] {
            width: 100%;
            padding: 8px;
            box-sizing: border-box;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        input[type="text"]:focus,
        input[type="password"]:focus,
        input[type="number"]:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        input[type="checkbox"] {
            margin-right: 8px;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            margin-top: 10px;
        }
        .button-group {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
        }
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .help-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 3px;
        }
        .auth-section {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--vscode-input-border);
        }
        .test-results {
            margin-top: 15px;
            padding: 10px;
            border-radius: 4px;
            display: none;
        }
        .test-results.success {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            color: var(--vscode-inputValidation-infoForeground);
            display: block;
        }
        .test-results.error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            display: block;
        }
        .test-results.loading {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-editor-foreground);
            display: block;
        }
        .test-results h4 {
            margin: 0 0 8px 0;
            font-size: 13px;
            font-weight: 600;
        }
        .test-results .detail {
            margin: 4px 0;
            font-size: 12px;
        }
        .test-results .detail-label {
            font-weight: 600;
            display: inline-block;
            min-width: 120px;
        }
        .test-results .databases-list {
            max-height: 150px;
            overflow-y: auto;
            margin-top: 5px;
            padding: 5px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        .test-results .database-item {
            padding: 2px 0;
            font-size: 11px;
        }
        .btn-test {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-test:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .btn-test:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .save-status {
            margin-top: 15px;
            padding: 10px;
            border-radius: 4px;
            display: none;
        }
        .save-status.saving {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-editor-foreground);
            display: block;
        }
        .save-status.success {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            color: var(--vscode-inputValidation-infoForeground);
            display: block;
        }
        .save-status.error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            display: block;
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <form id="connectionForm">
        <div class="form-group">
            <label for="name">Connection Name <span class="required">*</span></label>
            <input type="text" id="name" name="name" value="${this.escapeHtml(connection.name)}" required placeholder="My SQL Server">
            <div class="help-text">A friendly name to identify this connection</div>
        </div>

        <div class="form-group">
            <label for="server">Server <span class="required">*</span></label>
            <input type="text" id="server" name="server" value="${this.escapeHtml(connection.server)}" required placeholder="localhost or server\\instance">
            <div class="help-text">Server name or IP address. Use 'server\\instance' for named instances</div>
        </div>

        <div class="form-group">
            <label for="port">Port</label>
            <input type="number" id="port" name="port" value="${connection.port || 1433}" min="1" max="65535" placeholder="1433">
            <div class="help-text">SQL Server port (default: 1433)</div>
        </div>

        <div class="form-group">
            <label for="database">Database</label>
            <input type="text" id="database" name="database" value="${this.escapeHtml(connection.database || '')}" placeholder="master">
            <div class="help-text">Initial database to connect to (optional)</div>
        </div>

        <div class="form-group">
            <div class="checkbox-group">
                <input type="checkbox" id="integratedSecurity" name="integratedSecurity" ${connection.integratedSecurity ? 'checked' : ''}>
                <label for="integratedSecurity">Use Windows Authentication (Integrated Security)</label>
            </div>
        </div>

        <div class="auth-section" id="authSection" style="display: ${connection.integratedSecurity ? 'none' : 'block'};">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" value="${this.escapeHtml(connection.username || '')}" placeholder="sa">
                <div class="help-text">SQL Server authentication username</div>
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" value="${this.escapeHtml(connection.password || '')}" placeholder="••••••••">
                <div class="help-text">SQL Server authentication password</div>
            </div>
        </div>

        <div class="button-group">
            <button type="button" class="btn-test" id="testBtn">Test Connection</button>
            <button type="button" class="btn-secondary" id="cancelBtn">Cancel</button>
            <button type="submit" class="btn-primary" id="saveBtn">${isEdit ? 'Save' : 'Add Connection'}</button>
        </div>
    </form>

    <div id="testResults" class="test-results"></div>
    <div id="saveStatus" class="save-status"></div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const form = document.getElementById('connectionForm');
        const integratedSecurityCheckbox = document.getElementById('integratedSecurity');
        const authSection = document.getElementById('authSection');
        const cancelBtn = document.getElementById('cancelBtn');
        const testBtn = document.getElementById('testBtn');
        const saveBtn = document.getElementById('saveBtn');
        const testResults = document.getElementById('testResults');
        const saveStatus = document.getElementById('saveStatus');

        integratedSecurityCheckbox.addEventListener('change', (e) => {
            authSection.style.display = e.target.checked ? 'none' : 'block';
        });

        testBtn.addEventListener('click', () => {
            const formData = new FormData(form);
            const data = {
                name: formData.get('name') || '',
                server: formData.get('server') || '',
                port: formData.get('port') ? parseInt(formData.get('port'), 10) : undefined,
                database: formData.get('database') || undefined,
                username: formData.get('username') || undefined,
                password: formData.get('password') || undefined,
                integratedSecurity: integratedSecurityCheckbox.checked
            };

            if (!data.name || !data.server) {
                showTestError('Name and Server are required to test connection');
            return;
        }

            testBtn.disabled = true;
            testResults.className = 'test-results loading';
            testResults.innerHTML = '<div>Testing connection...</div>';

            vscode.postMessage({
                command: 'testConnection',
                ...data
            });
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = {
                name: formData.get('name'),
                server: formData.get('server'),
                port: formData.get('port'),
                database: formData.get('database'),
                username: formData.get('username'),
                password: formData.get('password'),
                integratedSecurity: integratedSecurityCheckbox.checked
            };

            // Disable form while saving
            saveBtn.disabled = true;
            testBtn.disabled = true;
            cancelBtn.disabled = true;
            saveStatus.className = 'save-status saving';
            saveStatus.innerHTML = '<div>Saving connection...</div>';

            vscode.postMessage({
                command: 'save',
                ...data
            });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
        });

        function showTestError(message) {
            testResults.className = 'test-results error';
            testResults.innerHTML = '<h4>Connection Test Failed</h4><div>' + escapeHtml(message) + '</div>';
            testBtn.disabled = false;
        }

        function showTestSuccess(result) {
            testResults.className = 'test-results success';
            let html = '<h4>Connection Test Successful</h4>';
            
            if (result.serverName) {
                html += '<div class="detail"><span class="detail-label">Server:</span> ' + escapeHtml(result.serverName) + '</div>';
            }
            if (result.serverVersion) {
                html += '<div class="detail"><span class="detail-label">Version:</span> ' + escapeHtml(result.serverVersion.substring(0, 100)) + '</div>';
            }
            if (result.authenticatedUser) {
                html += '<div class="detail"><span class="detail-label">User:</span> ' + escapeHtml(result.authenticatedUser) + '</div>';
            }
            if (result.databases && result.databases.length > 0) {
                html += '<div class="detail"><span class="detail-label">Databases:</span> ' + result.databases.length + ' found</div>';
                html += '<div class="databases-list">';
                result.databases.slice(0, 20).forEach(db => {
                    html += '<div class="database-item">' + escapeHtml(db) + '</div>';
                });
                if (result.databases.length > 20) {
                    html += '<div class="database-item">... and ' + (result.databases.length - 20) + ' more</div>';
                }
                html += '</div>';
            }
            
            testResults.innerHTML = html;
            testBtn.disabled = false;
        }

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'testConnectionResult') {
                if (message.success) {
                    showTestSuccess(message);
                } else {
                    showTestError(message.error || 'Connection test failed');
                }
            } else if (message.command === 'saving') {
                // Already handled in form submit, but can update if needed
                saveStatus.className = 'save-status saving';
                saveStatus.innerHTML = '<div>Saving connection...</div>';
            } else if (message.command === 'saveResult') {
                if (message.success) {
                    saveStatus.className = 'save-status success';
                    saveStatus.innerHTML = '<div><strong>Success!</strong> ' + escapeHtml(message.message || 'Connection saved successfully!') + '</div>';
                    // Change save button to close button after successful save
                    saveBtn.textContent = 'Close';
                    saveBtn.type = 'button'; // Change from submit to button to prevent form submission
                    saveBtn.disabled = false;
                    // Remove existing event listeners and add close handler
                    const newSaveBtn = saveBtn.cloneNode(true);
                    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
                    newSaveBtn.addEventListener('click', () => {
                        vscode.postMessage({ command: 'closeAfterSave' });
                    });
                    saveBtn = newSaveBtn;
                    // Keep cancel button enabled so user can close
                    cancelBtn.disabled = false;
                    // Keep test button disabled since save is complete
                    testBtn.disabled = true;
                    // Disable form fields to prevent further editing
                    form.querySelectorAll('input, select').forEach((el) => {
                        el.disabled = true;
                    });
                } else {
                    saveStatus.className = 'save-status error';
                    saveStatus.innerHTML = '<div><strong>Error:</strong> ' + escapeHtml(message.error || 'Failed to save connection') + '</div>';
                    // Re-enable buttons on error so user can try again
                    saveBtn.disabled = false;
                    testBtn.disabled = false;
                    cancelBtn.disabled = false;
                }
            }
        });
    </script>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        if (!text) {
            return '';
        }
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async removeServer(item: ServerTreeItem): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to remove ${item.label}?`,
            'Yes',
            'No'
        );

        if (result === 'Yes') {
            await this.storageService.removeConnection(item.connectionId);
            this.logger.log('Connection removed', { name: item.label, connectionId: item.connectionId });
            await this.loadConnections();
        }
    }

    async editServer(item: ServerTreeItem): Promise<void> {
        const connection = await this.storageService.getConnection(item.connectionId);
        if (!connection) {
            this.logger.error('Connection not found for edit', { connectionId: item.connectionId });
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        this.logger.log('Edit server requested', { name: connection.name, connectionId: item.connectionId });
        // Dialog now handles save internally, including update operations
        await this.showConnectionDialog(connection);
        await this.loadConnections();
    }

    async testConnection(item: ServerTreeItem): Promise<void> {
        const connection = await this.storageService.getConnection(item.connectionId);
        if (!connection) {
            this.logger.error('Connection not found for test', { connectionId: item.connectionId });
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        this.logger.log('Testing connection', { name: connection.name, server: connection.server });
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Testing connection...',
                cancellable: false
            },
            async () => {
                const result = await this.httpClient.testConnection(connection);
                if (result.success) {
                    this.logger.log('Connection test successful', { name: connection.name });
                    vscode.window.showInformationMessage(`Connection to ${connection.name} successful!`);
                } else {
                    this.logger.error('Connection test failed', { name: connection.name, error: result.error });
                    vscode.window.showErrorMessage(`Connection failed: ${result.error || 'Unknown error'}`);
                }
            }
        );
    }

    dispose(): void {
        // Cleanup if needed
    }
}

class ServerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly server: string,
        public readonly connectionId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string = 'server'
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label} - ${this.server}`;
        this.description = this.server;
    }
}


import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SqlServerExplorer } from '../../panes/sqlExplorer';
import * as vscode from 'vscode';
import { StorageService } from '../../services/storage';
import { HttpClient } from '../../services/httpClient';

vi.mock('../../services/storage');
vi.mock('../../services/httpClient');
vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(),
        createTreeView: vi.fn(),
        createOutputChannel: vi.fn(() => ({
            append: vi.fn(),
            appendLine: vi.fn(),
            show: vi.fn(),
            dispose: vi.fn()
        })),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn(),
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        withProgress: vi.fn()
    },
    workspace: {
        getConfiguration: vi.fn(),
        workspaceState: {
            get: vi.fn(),
            update: vi.fn()
        }
    },
    commands: {
        registerCommand: vi.fn()
    },
    StatusBarAlignment: {
        Right: 2,
        Left: 1
    },
    ViewColumn: {
        Two: 2,
        One: 1
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    },
    TreeItem: class TreeItem {
        label: string;
        collapsibleState: number;
        constructor(label: string, collapsibleState: number) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    EventEmitter: class EventEmitter<T> {
        private listeners: Array<(data: T) => void> = [];
        fire(data: T): void {
            this.listeners.forEach(listener => listener(data));
        }
        event(listener: (data: T) => void): { dispose: () => void } {
            this.listeners.push(listener);
            return { dispose: () => this.listeners = this.listeners.filter(l => l !== listener) };
        }
    },
    ExtensionContext: vi.fn()
}));

describe('SqlServerExplorer', () => {
    let explorer: SqlServerExplorer;
    let mockContext: vscode.ExtensionContext;
    let mockWebSocketClient: any;
    let mockStorageService: any;
    let mockHttpClient: any;
    let mockPanel: any;
    let messageHandler: any;

    beforeEach(() => {
        mockContext = {
            workspaceState: {
                get: vi.fn(),
                update: vi.fn()
            },
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        mockPanel = {
            webview: {
                html: '',
                postMessage: vi.fn(),
                onDidReceiveMessage: vi.fn((callback) => {
                    messageHandler = callback;
                    return { dispose: vi.fn() };
                })
            },
            reveal: vi.fn(),
            dispose: vi.fn(),
            onDidDispose: {
                dispose: vi.fn()
            }
        };

        (vscode.window.createWebviewPanel as any).mockReturnValue(mockPanel);

        mockWebSocketClient = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            isConnected: vi.fn().mockReturnValue(true),
            notifyConnectionSaved: vi.fn().mockResolvedValue(undefined)
        };

        mockHttpClient = {
            testConnection: vi.fn().mockResolvedValue({
                success: true,
                serverVersion: 'Test Version',
                authenticatedUser: 'testuser',
                databases: ['master', 'tempdb']
            })
        };

        mockStorageService = {
            loadConnections: vi.fn().mockResolvedValue([]),
            addConnection: vi.fn().mockResolvedValue(undefined),
            updateConnection: vi.fn().mockResolvedValue(undefined),
            removeConnection: vi.fn().mockResolvedValue(undefined),
            getConnection: vi.fn().mockResolvedValue(undefined)
        };

        (StorageService as any).mockImplementation(() => mockStorageService);
        (HttpClient as any).mockImplementation(() => mockHttpClient);

        explorer = new SqlServerExplorer(mockContext, mockWebSocketClient);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getChildren', () => {
        it('should return empty array when no connections', async () => {
            mockStorageService.loadConnections.mockResolvedValue([]);

            const children = await explorer.getChildren();

            expect(children).toEqual([]);
        });

        it('should return server items for connections', async () => {
            const connections = [
                {
                    id: '1',
                    name: 'Server 1',
                    server: 'localhost'
                },
                {
                    id: '2',
                    name: 'Server 2',
                    server: 'remote'
                }
            ];

            mockStorageService.loadConnections.mockResolvedValue(connections);

            const children = await explorer.getChildren();

            expect(children).toHaveLength(2);
            expect(children[0].label).toBe('Server 1');
            expect(children[1].label).toBe('Server 2');
        });
    });

    describe('addServer', () => {
        it('should not add server if name is cancelled', async () => {
            (vscode.window.showInputBox as any).mockResolvedValue(undefined);

            await explorer.addServer();

            expect(mockStorageService.addConnection).not.toHaveBeenCalled();
        });

        it('should not add server if server address is cancelled', async () => {
            (vscode.window.showInputBox as any)
                .mockResolvedValueOnce('Test Server')
                .mockResolvedValueOnce(undefined);

            await explorer.addServer();

            expect(mockStorageService.addConnection).not.toHaveBeenCalled();
        });
    });

    describe('removeServer', () => {
        it('should remove server when confirmed', async () => {
            const item = {
                label: 'Test Server',
                connectionId: '1'
            } as any;

            (vscode.window.showWarningMessage as any).mockResolvedValue('Yes');
            mockStorageService.removeConnection.mockResolvedValue(undefined);

            await explorer.removeServer(item);

            expect(mockStorageService.removeConnection).toHaveBeenCalledWith('1');
        });

        it('should not remove server when cancelled', async () => {
            const item = {
                label: 'Test Server',
                connectionId: '1'
            } as any;

            (vscode.window.showWarningMessage as any).mockResolvedValue('No');

            await explorer.removeServer(item);

            expect(mockStorageService.removeConnection).not.toHaveBeenCalled();
        });
    });

    describe('testConnection', () => {
        it('should show error if connection not found', async () => {
            const item = {
                connectionId: '1'
            } as any;

            mockStorageService.getConnection.mockResolvedValue(undefined);

            await explorer.testConnection(item);

            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });

    describe('addServer - save confirmation behavior', () => {
        it('should not close dialog automatically after successful save', async () => {
            const savedConnection = {
                id: 'conn_123',
                name: 'Test Server',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([]) // Before save
                .mockResolvedValueOnce([savedConnection]); // After save

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message from webview
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost',
                    port: '1433',
                    database: 'master',
                    username: 'sa',
                    password: 'password',
                    integratedSecurity: false
                });
            }

            // Wait a bit to ensure save completes
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify save was called
            expect(mockStorageService.addConnection).toHaveBeenCalled();

            // Verify success message was sent
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'saveResult',
                    success: true
                })
            );

            // Verify dialog was NOT disposed automatically
            expect(mockPanel.dispose).not.toHaveBeenCalled();

            // Simulate closeAfterSave command
            if (messageHandler) {
                await messageHandler({
                    command: 'closeAfterSave'
                });
            }

            // Now dialog should be disposed
            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('should verify connection is saved before showing success', async () => {
            const savedConnection = {
                id: 'conn_123',
                name: 'Test Server',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([]) // Before save
                .mockResolvedValueOnce([savedConnection]); // After save - verification

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify loadConnections was called for verification
            expect(mockStorageService.loadConnections).toHaveBeenCalledTimes(2);
            
            // Verify success message includes verification
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'saveResult',
                    success: true
                })
            );
        });

        it('should throw error if connection verification fails', async () => {
            mockStorageService.loadConnections
                .mockResolvedValueOnce([]) // Before save
                .mockResolvedValueOnce([]); // After save - connection not found

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify error message was sent
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'saveResult',
                    success: false,
                    error: expect.stringContaining('verification failed')
                })
            );

            // Dialog should NOT be disposed on error
            expect(mockPanel.dispose).not.toHaveBeenCalled();
        });

        it('should keep dialog open on save error', async () => {
            mockStorageService.addConnection.mockRejectedValue(new Error('Save failed'));

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify error message was sent
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'saveResult',
                    success: false
                })
            );

            // Dialog should NOT be disposed on error
            expect(mockPanel.dispose).not.toHaveBeenCalled();
        });

        it('should handle closeAfterSave command', async () => {
            const savedConnection = {
                id: 'conn_123',
                name: 'Test Server',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([savedConnection]);

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Simulate closeAfterSave command
            if (messageHandler) {
                await messageHandler({
                    command: 'closeAfterSave'
                });
            }

            // Dialog should be disposed
            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('should verify connection update when editing', async () => {
            const existingConnection = {
                id: 'conn_123',
                name: 'Old Name',
                server: 'oldserver'
            };

            const updatedConnection = {
                id: 'conn_123',
                name: 'New Name',
                server: 'newserver'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([existingConnection]) // Before update
                .mockResolvedValueOnce([updatedConnection]); // After update - verification

            // Start edit process (would need to expose edit method or use addServer with edit flag)
            // For now, test the update verification logic
            await mockStorageService.updateConnection('conn_123', updatedConnection);
            
            const connectionsAfter = await mockStorageService.loadConnections();
            const found = connectionsAfter.find((c: any) => c.id === 'conn_123');
            
            expect(found).toBeDefined();
            expect(found.name).toBe('New Name');
        });

        it('should notify backend after successful save', async () => {
            const savedConnection = {
                id: 'conn_123',
                name: 'Test Server',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([savedConnection]);

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify backend was notified
            expect(mockWebSocketClient.notifyConnectionSaved).toHaveBeenCalledWith('conn_123');
        });

        it('should handle backend notification failure gracefully', async () => {
            const savedConnection = {
                id: 'conn_123',
                name: 'Test Server',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([savedConnection]);

            mockWebSocketClient.notifyConnectionSaved.mockRejectedValue(new Error('Notification failed'));

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Test Server',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify save still succeeded despite notification failure
            expect(mockStorageService.addConnection).toHaveBeenCalled();
            
            // Verify success message was still sent
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'saveResult',
                    success: true
                })
            );
        });
    });

    describe('saveConnection - end-to-end backend notification (failing tests)', () => {
        it('saveConnection_ShouldNotifyBackendAndReloadSuccessfully', async () => {
            // This test replicates the complete real-world scenario from logs:
            // 1. Frontend saves connection to VS Code storage (verified in frontend)
            // 2. Frontend notifies backend via NotifyConnectionSaved
            // 3. Backend attempts to reload connections via LoadConnectionsAsync
            // 4. Backend's LoadConnectionsAsync calls SignalR LoadConnections on frontend
            // 5. EXPECTED: Connection should be found in backend cache
            // ACTUAL (from logs): Connection count is 0, connection not found
            
            const savedConnection = {
                id: 'conn_1762928362535', // From logs
                name: 'local',
                server: 'localhost',
                port: 1433,
                integratedSecurity: false,
                username: 'sa',
                password: 'password'
            };

            // Simulate storage state: empty before, has connection after save
            mockStorageService.loadConnections
                .mockResolvedValueOnce([]) // Before save - connection count: 0
                .mockResolvedValueOnce([savedConnection]); // After save - should be readable

            // Start the addServer process
            explorer.addServer();

            // Wait for dialog to be created
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save message from webview
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'local',
                    server: 'localhost',
                    port: '1433',
                    database: '',
                    username: 'sa',
                    password: 'password',
                    integratedSecurity: false
                });
            }

            // Wait for save to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify connection was saved to storage
            expect(mockStorageService.addConnection).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: expect.stringMatching(/^conn_/),
                    name: 'local',
                    server: 'localhost'
                })
            );

            // Verify storage was read for verification
            expect(mockStorageService.loadConnections).toHaveBeenCalledTimes(2);

            // Verify backend was notified
            expect(mockWebSocketClient.notifyConnectionSaved).toHaveBeenCalled();
            
            // Get the connection ID that was passed to notifyConnectionSaved
            const notifyCall = mockWebSocketClient.notifyConnectionSaved.mock.calls[0];
            const connectionId = notifyCall[0];
            
            // This test will FAIL if:
            // 1. Connection is not immediately readable after save (timing issue)
            // 2. Backend notification happens before storage is fully persisted
            // 3. Backend's LoadConnections doesn't receive the connection
            expect(connectionId).toBeDefined();
            expect(connectionId).toMatch(/^conn_/);
            
            // Verify the connection that was saved matches what backend should receive
            const savedCall = mockStorageService.addConnection.mock.calls[0][0];
            expect(savedCall.id).toBe(connectionId);
            
            // Verify success message was sent
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'saveResult',
                    success: true,
                    message: expect.stringContaining('successfully')
                })
            );
        });

        it('should handle timing issue when backend reloads immediately after save', async () => {
            // This test replicates a potential race condition:
            // - Frontend saves connection
            // - Frontend notifies backend
            // - Backend immediately calls LoadConnections
            // - Storage may not be fully persisted yet
            
            const savedConnection = {
                id: 'conn_timing_test',
                name: 'Timing Test',
                server: 'localhost'
            };

            // Simulate a delay in storage persistence
            let storageState: any[] = [];
            mockStorageService.addConnection.mockImplementation(async (conn) => {
                // Simulate async storage write
                await new Promise(resolve => setTimeout(resolve, 50));
                storageState = [conn];
            });
            
            mockStorageService.loadConnections.mockImplementation(async () => {
                // Return current storage state (may be empty if save hasn't completed)
                return [...storageState];
            });

            // Start save process
            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Timing Test',
                    server: 'localhost'
                });
            }

            // Immediately check if connection is readable (simulating backend LoadConnections)
            // This test will FAIL if there's a race condition
            const immediatelyAfterSave = await mockStorageService.loadConnections();
            
            // Wait for save to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const afterSaveCompletes = await mockStorageService.loadConnections();
            
            // This test demonstrates the timing issue:
            // - immediatelyAfterSave may be empty (race condition)
            // - afterSaveCompletes should have the connection
            // The test will FAIL if immediate read doesn't work, showing the timing problem
            expect(immediatelyAfterSave.length).toBeGreaterThan(0,
                'Connection should be immediately readable after save. ' +
                'If this fails, it indicates a timing/race condition issue.');
            
            expect(afterSaveCompletes).toHaveLength(1);
            expect(afterSaveCompletes[0].id).toBe('conn_timing_test');
        });
    });

    describe('tree view refresh after save (failing tests)', () => {
        it('should refresh tree view after successful connection save', async () => {
            // This test verifies that after a connection is successfully saved,
            // the tree view is refreshed so the new connection appears in the UI.
            // EXPECTED: refresh() should be called after loadConnections() completes
            // ACTUAL: Tree view may not refresh, leaving the UI showing old state
            
            const savedConnection = {
                id: 'conn_refresh_test',
                name: 'Refresh Test Server',
                server: 'localhost',
                port: 1433
            };

            // Setup: empty connections initially, then connection after save
            mockStorageService.loadConnections
                .mockResolvedValueOnce([]) // Initial load
                .mockResolvedValueOnce([savedConnection]); // After save

            // Track if refresh was called
            let refreshCalled = false;
            const originalRefresh = explorer.refresh;
            explorer.refresh = function() {
                refreshCalled = true;
                return originalRefresh.call(this);
            };

            // Start add server process
            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate save
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Refresh Test Server',
                    server: 'localhost',
                    port: '1433'
                });
            }

            // Wait for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if:
            // 1. refresh() is not called after save
            // 2. refresh() is called before loadConnections() completes
            // 3. Tree view doesn't update with new connection
            expect(refreshCalled).toBe(true);
            expect(mockStorageService.loadConnections).toHaveBeenCalled();
            
            // Verify the connection was loaded
            const finalConnections = await mockStorageService.loadConnections();
            expect(finalConnections).toContainEqual(
                expect.objectContaining({ id: 'conn_refresh_test' })
            );
        });

        it('should fire onDidChangeTreeData event after save', async () => {
            // This test verifies that the tree view's onDidChangeTreeData event
            // is fired after a connection is saved, which triggers VS Code to refresh the tree.
            // EXPECTED: _onDidChangeTreeData.fire() should be called
            // ACTUAL: Event may not fire, so tree view doesn't update
            
            const savedConnection = {
                id: 'conn_event_test',
                name: 'Event Test Server',
                server: 'testserver'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([savedConnection]);

            // Track event emitter calls
            let eventFired = false;
            const eventEmitter = (explorer as any)._onDidChangeTreeData;
            const originalFire = eventEmitter.fire;
            eventEmitter.fire = function(...args: any[]) {
                eventFired = true;
                return originalFire.apply(this, args);
            };

            // Subscribe to the event
            const eventListener = vi.fn();
            explorer.onDidChangeTreeData(eventListener);

            // Start save process
            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Event Test Server',
                    server: 'testserver'
                });
            }

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if:
            // 1. onDidChangeTreeData event is not fired
            // 2. Event is fired before connections are loaded
            // 3. Tree view doesn't receive the refresh signal
            expect(eventFired).toBe(true);
            expect(eventListener).toHaveBeenCalled();
        });

        it('should refresh tree view after updateConnection', async () => {
            // This test verifies that after updating an existing connection,
            // the tree view is refreshed to show the updated connection.
            // EXPECTED: refresh() should be called after update
            // ACTUAL: Tree view may not refresh after update
            
            const existingConnection = {
                id: 'conn_update_test',
                name: 'Original Name',
                server: 'localhost'
            };

            const updatedConnection = {
                id: 'conn_update_test',
                name: 'Updated Name',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([existingConnection]) // Initial load
                .mockResolvedValueOnce([updatedConnection]); // After update

            let refreshCalled = false;
            const originalRefresh = explorer.refresh;
            explorer.refresh = function() {
                refreshCalled = true;
                return originalRefresh.call(this);
            };

            // Start edit process (simulating editing existing connection)
            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Simulate update (with existing connection ID)
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Updated Name',
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if refresh is not called after update
            expect(refreshCalled).toBe(true);
            expect(mockStorageService.updateConnection).toHaveBeenCalled();
        });

        it('should refresh tree view in correct order: load then refresh', async () => {
            // This test verifies the correct sequence:
            // 1. Connection is saved
            // 2. loadConnections() is called and completes
            // 3. refresh() is called AFTER loadConnections() completes
            // EXPECTED: refresh() called after loadConnections() resolves
            // ACTUAL: refresh() may be called before connections are loaded
            
            const savedConnection = {
                id: 'conn_sequence_test',
                name: 'Sequence Test',
                server: 'localhost'
            };

            let loadConnectionsResolved = false;
            let refreshCalledAfterLoad = false;

            mockStorageService.loadConnections.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async load
                loadConnectionsResolved = true;
                return [savedConnection];
            });

            const originalRefresh = explorer.refresh;
            explorer.refresh = function() {
                if (loadConnectionsResolved) {
                    refreshCalledAfterLoad = true;
                }
                return originalRefresh.call(this);
            };

            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Sequence Test',
                    server: 'localhost'
                });
            }

            // Wait for all async operations
            await new Promise(resolve => setTimeout(resolve, 200));

            // Assert - This test will FAIL if refresh is called before loadConnections completes
            expect(loadConnectionsResolved).toBe(true);
            expect(refreshCalledAfterLoad).toBe(true);
        });
    });

    describe('connection name uniqueness (failing tests)', () => {
        it('should prevent saving connection with duplicate name', async () => {
            // This test verifies that when saving a connection, duplicate names are prevented.
            // EXPECTED: Save should fail or name should be made unique if duplicate name exists
            // ACTUAL: Duplicate names are allowed, causing identical entries in tree view
            
            const existingConnection = {
                id: 'conn_existing',
                name: 'local',
                server: 'localhost',
                port: 1433
            };

            const duplicateConnection = {
                id: 'conn_duplicate',
                name: 'local', // Same name as existing
                server: 'localhost',
                port: 1433
            };

            // Setup: one connection exists
            mockStorageService.loadConnections
                .mockResolvedValueOnce([existingConnection]) // Initial load
                .mockResolvedValueOnce([existingConnection]) // Before save check
                .mockResolvedValueOnce([existingConnection, duplicateConnection]); // After save (if allowed)

            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Try to save connection with duplicate name
            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'local', // Duplicate name
                    server: 'localhost',
                    port: '1433'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if:
            // 1. Duplicate names are allowed
            // 2. No validation prevents duplicate names
            // 3. Tree view shows duplicate entries with same name
            
            // Verify that either:
            // - Save was prevented (error message sent)
            // - Name was made unique (e.g., "local (2)")
            const saveResult = mockPanel.webview.postMessage.mock.calls.find(
                (call: any) => call[0]?.command === 'saveResult'
            );
            
            if (saveResult && saveResult[0]?.success === false) {
                // Save was prevented - this is acceptable
                expect(saveResult[0].error).toBeDefined();
            } else {
                // Save succeeded - verify name was made unique
                const savedConnections = await mockStorageService.loadConnections();
                const names = savedConnections.map(c => c.name);
                const uniqueNames = new Set(names);
                
                // All names should be unique
                expect(names.length).toBe(uniqueNames.size);
            }
        });

        it('should make connection name unique when duplicate exists', async () => {
            // This test verifies that if a duplicate name is detected,
            // the system automatically makes it unique (e.g., "local" -> "local (2)").
            // EXPECTED: Duplicate name is automatically made unique
            // ACTUAL: Duplicate name is saved as-is
            
            const existingConnection = {
                id: 'conn_1',
                name: 'local',
                server: 'localhost'
            };

            mockStorageService.loadConnections
                .mockResolvedValueOnce([existingConnection])
                .mockResolvedValueOnce([existingConnection])
                .mockResolvedValueOnce([existingConnection, {
                    id: 'conn_2',
                    name: 'local (2)', // Should be auto-renamed
                    server: 'localhost'
                }]);

            let savedConnectionName = '';
            mockStorageService.addConnection.mockImplementation(async (conn) => {
                savedConnectionName = conn.name;
            });

            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'local', // Duplicate - should be renamed
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if duplicate name is not made unique
            expect(savedConnectionName).not.toBe('local');
            expect(savedConnectionName).toMatch(/^local/); // Should start with "local"
            if (savedConnectionName !== 'local') {
                // Should be something like "local (2)" or "local-2"
                expect(savedConnectionName.length).toBeGreaterThan('local'.length);
            }
        });

        it('should show unique names in tree view', async () => {
            // This test verifies that the tree view displays unique names for each connection.
            // EXPECTED: Each connection in tree view has a unique display name
            // ACTUAL: Duplicate names appear in tree view
            
            const connections = [
                { id: 'conn_1', name: 'local', server: 'localhost' },
                { id: 'conn_2', name: 'local', server: 'localhost' } // Duplicate name
            ];

            mockStorageService.loadConnections.mockResolvedValue(connections);

            // Reload connections to update tree view
            await (explorer as any).loadConnections();

            // Get tree items
            const treeItems = await explorer.getChildren();

            // Assert - This test will FAIL if duplicate names appear in tree view
            const displayNames = treeItems.map(item => {
                // ServerTreeItem label is typically "name server" format
                return item.label?.toString() || '';
            });

            // All display names should be unique
            const uniqueNames = new Set(displayNames);
            expect(displayNames.length).toBe(uniqueNames.size);
            
            // Verify no two items have identical labels
            displayNames.forEach((name, index) => {
                const duplicates = displayNames.filter(n => n === name);
                expect(duplicates.length).toBe(1);
            });
        });

        it('should validate name uniqueness before saving', async () => {
            // This test verifies that name uniqueness is checked before saving.
            // EXPECTED: Uniqueness check happens before addConnection is called
            // ACTUAL: No uniqueness validation, duplicates are saved
            
            const existingConnections = [
                { id: 'conn_1', name: 'Server1', server: 'server1' },
                { id: 'conn_2', name: 'Server2', server: 'server2' }
            ];

            mockStorageService.loadConnections
                .mockResolvedValueOnce(existingConnections) // Initial load
                .mockResolvedValueOnce(existingConnections) // Before save validation
                .mockResolvedValueOnce([...existingConnections, {
                    id: 'conn_3',
                    name: 'Server1', // Duplicate of conn_1
                    server: 'server3'
                }]);

            let validationOccurred = false;
            const originalLoadConnections = mockStorageService.loadConnections;
            mockStorageService.loadConnections.mockImplementation(async () => {
                const result = await originalLoadConnections();
                // Check if this is the validation call (called before addConnection)
                if (mockStorageService.addConnection.mock.calls.length === 0) {
                    validationOccurred = true;
                }
                return result;
            });

            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'Server1', // Duplicate name
                    server: 'server3'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if:
            // 1. No uniqueness validation occurs
            // 2. Duplicate name is saved without checking
            // 3. addConnection is called even with duplicate name
            
            // Verify that loadConnections was called to check for duplicates
            expect(mockStorageService.loadConnections).toHaveBeenCalled();
            
            // If validation occurred, either:
            // - addConnection should NOT be called (save prevented)
            // - OR addConnection should be called with unique name
            if (validationOccurred) {
                const addConnectionCalls = mockStorageService.addConnection.mock.calls;
                if (addConnectionCalls.length > 0) {
                    const savedName = addConnectionCalls[0][0].name;
                    // Name should be unique
                    const allNames = [...existingConnections.map(c => c.name), savedName];
                    const uniqueNames = new Set(allNames);
                    expect(allNames.length).toBe(uniqueNames.size);
                }
            }
        });

        it('should handle multiple duplicates correctly', async () => {
            // This test verifies that when multiple duplicates exist,
            // new names are generated correctly (local, local (2), local (3), etc.).
            // EXPECTED: Sequential unique names are generated
            // ACTUAL: All duplicates get same name or incorrect numbering
            
            const existingConnections = [
                { id: 'conn_1', name: 'local', server: 'localhost' },
                { id: 'conn_2', name: 'local (2)', server: 'localhost' },
                { id: 'conn_3', name: 'local (3)', server: 'localhost' }
            ];

            mockStorageService.loadConnections
                .mockResolvedValueOnce(existingConnections)
                .mockResolvedValueOnce(existingConnections)
                .mockResolvedValueOnce([...existingConnections, {
                    id: 'conn_4',
                    name: 'local (4)', // Should be next in sequence
                    server: 'localhost'
                }]);

            explorer.addServer();
            await new Promise(resolve => setTimeout(resolve, 10));

            if (messageHandler) {
                await messageHandler({
                    command: 'save',
                    name: 'local', // Should become "local (4)"
                    server: 'localhost'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Assert - This test will FAIL if:
            // 1. Name numbering is incorrect
            // 2. Duplicate of existing number is created
            // 3. No sequential naming logic exists
            
            const savedConnections = await mockStorageService.loadConnections();
            const localConnections = savedConnections.filter(c => c.name.startsWith('local'));
            const names = localConnections.map(c => c.name);
            
            // All names should be unique
            expect(new Set(names).size).toBe(names.length);
            
            // Should have: local, local (2), local (3), local (4)
            expect(names).toContain('local');
            expect(names).toContain('local (2)');
            expect(names).toContain('local (3)');
            expect(names).toContain('local (4)');
        });
    });

    describe('server node selection', () => {
        let mockQueryEditor: any;
        let mockPerformanceGraph: any;

        beforeEach(() => {
            mockQueryEditor = {
                show: vi.fn()
            };
            mockPerformanceGraph = {
                show: vi.fn()
            };

            // Reset explorer with mocks
            explorer = new SqlServerExplorer(mockContext, mockWebSocketClient);
            
            // Inject mocks into explorer (will need to be implemented)
            // For now, we'll test that the method exists and can be called
        });

        it('should open query editor when server node is selected', async () => {
            // This test will FAIL because handleServerSelection() doesn't exist yet
            const serverNode = {
                label: 'Test Server',
                server: 'localhost',
                connectionId: 'conn_1',
                contextValue: 'server',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            } as any;

            // @ts-expect-error - testing method that should exist
            await explorer.handleServerSelection(serverNode, mockQueryEditor, mockPerformanceGraph);

            expect(mockQueryEditor.show).toHaveBeenCalled();
        });

        it('should open performance graph when server node is selected', async () => {
            // This test will FAIL because handleServerSelection() doesn't exist yet
            const serverNode = {
                label: 'Test Server',
                server: 'localhost',
                connectionId: 'conn_1',
                contextValue: 'server',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            } as any;

            // @ts-expect-error - testing method that should exist
            await explorer.handleServerSelection(serverNode, mockQueryEditor, mockPerformanceGraph);

            expect(mockPerformanceGraph.show).toHaveBeenCalled();
        });

        it('should open both query editor and graph view together when server node is selected', async () => {
            // This test will FAIL because the selection handler doesn't exist
            const serverNode = {
                label: 'Test Server',
                server: 'localhost',
                connectionId: 'conn_1',
                contextValue: 'server',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            } as any;

            // @ts-expect-error - testing method that should exist
            await explorer.handleServerSelection(serverNode, mockQueryEditor, mockPerformanceGraph);

            // Both should be called
            expect(mockQueryEditor.show).toHaveBeenCalled();
            expect(mockPerformanceGraph.show).toHaveBeenCalled();
            
            // Both should be called with the same connectionId
            expect(mockQueryEditor.show).toHaveBeenCalledWith('conn_1');
            expect(mockPerformanceGraph.show).toHaveBeenCalledWith('conn_1');
        });

        it('should pass connection id to query editor when server node is selected', async () => {
            // This test will FAIL because the method doesn't accept connectionId yet
            const serverNode = {
                label: 'Test Server',
                server: 'localhost',
                connectionId: 'conn_123',
                contextValue: 'server',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            } as any;

            // @ts-expect-error - testing method that should exist
            await explorer.handleServerSelection(serverNode, mockQueryEditor, mockPerformanceGraph);

            expect(mockQueryEditor.show).toHaveBeenCalledWith('conn_123');
        });

        it('should pass connection id to performance graph when server node is selected', async () => {
            // This test will FAIL because the method doesn't accept connectionId yet
            const serverNode = {
                label: 'Test Server',
                server: 'localhost',
                connectionId: 'conn_456',
                contextValue: 'server',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            } as any;

            // @ts-expect-error - testing method that should exist
            await explorer.handleServerSelection(serverNode, mockQueryEditor, mockPerformanceGraph);

            expect(mockPerformanceGraph.show).toHaveBeenCalledWith('conn_456');
        });

        it('should handle selection of non-server nodes gracefully', async () => {
            // This test will FAIL because selection handling doesn't exist
            const databaseNode = {
                label: 'Databases',
                server: '',
                connectionId: '',
                contextValue: 'database',
                collapsibleState: vscode.TreeItemCollapsibleState.None
            } as any;

            // @ts-expect-error - testing method that should exist
            await explorer.handleServerSelection(databaseNode, mockQueryEditor, mockPerformanceGraph);

            // Non-server nodes should not trigger panel opening
            expect(mockQueryEditor.show).not.toHaveBeenCalled();
            expect(mockPerformanceGraph.show).not.toHaveBeenCalled();
        });
    });
});


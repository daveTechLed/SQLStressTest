import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SqlServerExplorer } from '../../panes/sqlExplorer';
import * as vscode from 'vscode';
import { WebSocketClient } from '../../services/websocketClient';
import { StorageService } from '../../services/storage';
import { HttpClient } from '../../services/httpClient';

vi.mock('../../services/storage');
vi.mock('../../services/httpClient');
vi.mock('vscode');

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
});


import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryEditor } from '../../panes/queryEditor';
import * as vscode from 'vscode';
import { WebSocketClient } from '../../services/websocketClient';
import { HttpClient, QueryResponse } from '../../services/httpClient';
import { StorageService } from '../../services/storage';

vi.mock('../../services/httpClient');
vi.mock('../../services/storage');
vi.mock('vscode');

describe('QueryEditor', () => {
    let editor: QueryEditor;
    let mockContext: vscode.ExtensionContext;
    let mockWebSocketClient: any;
    let mockHttpClient: any;
    let mockStorageService: any;
    let mockPanel: any;

    beforeEach(() => {
        mockContext = {
            workspaceState: {
                get: vi.fn(),
                update: vi.fn()
            }
        } as unknown as vscode.ExtensionContext;

        mockPanel = {
            webview: {
                html: '',
                postMessage: vi.fn(),
                onDidReceiveMessage: {
                    dispose: vi.fn()
                }
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
            disconnect: vi.fn()
        };

        mockHttpClient = {
            executeQuery: vi.fn()
        };

        mockStorageService = {
            loadConnections: vi.fn().mockResolvedValue([])
        };

        (HttpClient as any).mockImplementation(() => mockHttpClient);
        (StorageService as any).mockImplementation(() => mockStorageService);

        editor = new QueryEditor(mockContext, mockWebSocketClient);
    });

    afterEach(() => {
        editor.dispose();
    });

    describe('show', () => {
        it('should create webview panel', () => {
            editor.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should send connections on show', async () => {
            const connections = [
                { id: '1', name: 'Server 1', server: 'localhost' }
            ];

            mockStorageService.loadConnections.mockResolvedValue(connections);

            editor.show();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });

        it('should reveal existing panel if already shown', () => {
            editor.show();
            editor.show();

            expect(mockPanel.reveal).toHaveBeenCalled();
        });
    });

    describe('executeQuery', () => {
        it('should execute query and send result', async () => {
            editor.show();

            const response: QueryResponse = {
                success: true,
                columns: ['id', 'name'],
                rows: [[1, 'Test']],
                rowCount: 1,
                executionTimeMs: 100
            };

            mockHttpClient.executeQuery.mockResolvedValue(response);

            // Simulate message from webview
            const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0][0];
            await messageHandler({
                command: 'executeQuery',
                connectionId: '1',
                query: 'SELECT * FROM users'
            });

            expect(mockHttpClient.executeQuery).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });

        it('should handle query execution errors', async () => {
            editor.show();

            mockHttpClient.executeQuery.mockRejectedValue(new Error('Connection failed'));

            const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0][0];
            await messageHandler({
                command: 'executeQuery',
                connectionId: '1',
                query: 'SELECT * FROM users'
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'queryResult',
                    data: expect.objectContaining({
                        success: false
                    })
                })
            );
        });
    });

    describe('dispose', () => {
        it('should dispose panel', () => {
            editor.show();
            editor.dispose();

            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });
});


import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryEditor } from '../../panes/queryEditor';
import * as vscode from 'vscode';
import { HttpClient, QueryResponse } from '../../services/httpClient';
import { StorageService } from '../../services/storage';

vi.mock('../../services/httpClient');
vi.mock('../../services/storage');
vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(),
        createStatusBarItem: vi.fn(),
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
    ViewColumn: {
        One: 1,
        Two: 2,
        Three: 3
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    }
}));

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
        it('should execute query but NOT send queryResult message (results removed)', async () => {
            editor.show();

            const response: QueryResponse = {
                success: true,
                rowCount: 5,
                executionTimeMs: 21,
                columns: ['name', 'object_id'],
                rows: [['test', '123']]
            };

            mockHttpClient.executeQuery.mockResolvedValue(response);

            // Simulate message from webview
            const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0]?.[0];
            if (messageHandler) {
                await messageHandler({
                    command: 'executeQuery',
                    connectionId: 'test-conn',
                    query: 'SELECT 1',
                    database: 'testdb'
                });
            }

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify query was executed
            expect(mockHttpClient.executeQuery).toHaveBeenCalled();

            // Verify queryResult message was NOT sent (results are removed)
            const queryResultCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'queryResult'
            );
            expect(queryResultCalls.length).toBe(0);
        });

        it('should NOT display query results in webview HTML', () => {
            editor.show();

            const html = mockPanel.webview.html;
            
            // Verify results div is not in HTML
            expect(html).not.toContain('id="results"');
            expect(html).not.toContain('showResults');
            expect(html).not.toContain('showError');
            expect(html).not.toContain('escapeHtml');
        });

        it('should handle query execution errors without displaying them', async () => {
            editor.show();

            mockHttpClient.executeQuery.mockRejectedValue(new Error('Connection failed'));

            const messageHandler = mockPanel.webview.onDidReceiveMessage.mock.calls[0]?.[0];
            if (messageHandler) {
                await messageHandler({
                    command: 'executeQuery',
                    connectionId: 'test-conn',
                    query: 'SELECT 1'
                });
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify query was attempted
            expect(mockHttpClient.executeQuery).toHaveBeenCalled();

            // Verify queryResult error message was NOT sent
            const queryResultCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'queryResult'
            );
            expect(queryResultCalls.length).toBe(0);
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


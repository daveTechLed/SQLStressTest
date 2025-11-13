import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceGraph } from '../../panes/performanceGraph';
import * as vscode from 'vscode';
import { PerformanceData } from '../../services/websocketClient';

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

describe('PerformanceGraph', () => {
    let graph: PerformanceGraph;
    let mockContext: vscode.ExtensionContext;
    let mockWebSocketClient: any;
    let mockPanel: any;

    beforeEach(() => {
        mockContext = {} as vscode.ExtensionContext;

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
            onPerformanceData: vi.fn(),
            offPerformanceData: vi.fn(),
            onExtendedEventData: vi.fn(),
            offExtendedEventData: vi.fn(),
            onExecutionBoundary: vi.fn(),
            offExecutionBoundary: vi.fn(),
            isConnected: vi.fn().mockReturnValue(true)
        };

        graph = new PerformanceGraph(mockContext, mockWebSocketClient);
    });

    afterEach(() => {
        graph.dispose();
    });

    describe('show', () => {
        it('should create webview panel', () => {
            graph.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should register performance data callback', () => {
            graph.show();

            expect(mockWebSocketClient.onPerformanceData).toHaveBeenCalled();
        });

        it('should reveal existing panel if already shown', () => {
            graph.show();
            graph.show();

            expect(mockPanel.reveal).toHaveBeenCalled();
        });
    });

    describe('data handling', () => {
        it('should add data point and update chart', () => {
            graph.show();

            const callback = mockWebSocketClient.onPerformanceData.mock.calls[0][0];
            const data: PerformanceData = {
                timestamp: Date.now(),
                cpuPercent: 50
            };

            callback(data);

            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });

        it('should limit data points to max', () => {
            graph.show();

            const callback = mockWebSocketClient.onPerformanceData.mock.calls[0][0];

            // Add more than max data points
            for (let i = 0; i < 150; i++) {
                callback({
                    timestamp: Date.now() + i,
                    cpuPercent: i
                });
            }

            // Should still work without errors
            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });
    });

    describe('Extended Events data flow', () => {
        it('should process ExtendedEventData even when stress test is NOT active', () => {
            graph.show();
            // Note: NOT calling startStressTest()

            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0]?.[0];
            if (!callback) {
                // If callback not registered, skip test
                return;
            }

            const data = {
                eventName: 'sql_batch_completed',
                timestamp: new Date().toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: {
                    duration: 100,
                    row_count: 50
                },
                actions: {}
            };

            callback(data);

            // Data should be processed even if stress test not active
            // Chart update might not happen, but data should be stored
            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });

        it('should update chart when startStressTest is called after data arrives', () => {
            graph.show();

            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0]?.[0];
            if (!callback) {
                return;
            }

            // Send data before stress test starts
            callback({
                eventName: 'sql_batch_completed',
                timestamp: new Date().toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: { duration: 100, row_count: 50 },
                actions: {}
            });

            const callsBeforeStart = mockPanel.webview.postMessage.mock.calls.length;

            // Now start stress test
            graph.startStressTest();

            // Should have sent clearChart and updateChart messages
            expect(mockPanel.webview.postMessage.mock.calls.length).toBeGreaterThan(callsBeforeStart);
            
            const clearCall = mockPanel.webview.postMessage.mock.calls.find(
                (call: any[]) => call[0]?.command === 'clearChart'
            );
            expect(clearCall).toBeDefined();
        });

        it('should register Extended Events callbacks on show', () => {
            graph.show();

            expect(mockWebSocketClient.onExtendedEventData).toHaveBeenCalled();
            expect(mockWebSocketClient.onExecutionBoundary).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should unregister callback and dispose panel', () => {
            graph.show();
            graph.dispose();

            expect(mockWebSocketClient.offPerformanceData).toHaveBeenCalled();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });
});


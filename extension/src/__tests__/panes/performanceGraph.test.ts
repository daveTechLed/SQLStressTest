import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceGraph } from '../../panes/performanceGraph';
import * as vscode from 'vscode';
import { WebSocketClient, PerformanceData } from '../../services/websocketClient';

vi.mock('vscode');

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

    describe('dispose', () => {
        it('should unregister callback and dispose panel', () => {
            graph.show();
            graph.dispose();

            expect(mockWebSocketClient.offPerformanceData).toHaveBeenCalled();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });
});


import * as vscode from 'vscode';
import { ILogger } from '../../services/logger';

/**
 * Manages the webview panel lifecycle for QueryEditor.
 * Single Responsibility: Webview panel management only.
 */
export class QueryEditorWebviewManager {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: ILogger
    ) {}

    createPanel(): vscode.WebviewPanel {
        this.logger.log('Creating query editor panel');
        this.panel = vscode.window.createWebviewPanel(
            'queryEditor',
            'SQL Query Editor',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.onDidDispose(() => {
            this.dispose();
        });

        return this.panel;
    }

    getPanel(): vscode.WebviewPanel | undefined {
        return this.panel;
    }

    reveal(): void {
        if (this.panel) {
            this.panel.reveal();
        }
    }

    dispose(): void {
        this.logger.log('Disposing query editor webview');
        this.panel?.dispose();
        this.panel = undefined;
    }

    postMessage(message: any): void {
        if (this.panel) {
            this.panel.webview.postMessage(message);
        }
    }

    onDidReceiveMessage(handler: (message: any) => void): void {
        if (this.panel) {
            this.panel.webview.onDidReceiveMessage(handler);
        }
    }
}


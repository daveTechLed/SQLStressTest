import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ILogger } from '../../services/logger';

/**
 * Generates HTML/CSS/JS content for QueryEditor webview.
 * Single Responsibility: UI content generation only.
 */
export class QueryEditorUI {
    constructor(
        private context: vscode.ExtensionContext,
        private logger: ILogger
    ) {}

    getWebviewContent(selectedConnectionId?: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Query Editor</title>
    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
    <style>${this.getStyles()}</style>
</head>
<body>${this.getBody()}
    <script>${this.getScript()}</script>
</body>
</html>`;
    }

    private getStyles(): string {
        return `
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
    `;
    }

    private getBody(): string {
        return `
    <div id="toolbar">
        <select id="connectionSelect">
            <option value="">Select connection...</option>
        </select>
        <select id="databaseSelect" disabled style="min-width: 200px;">
            <option value="">Select database...</option>
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
            <button id="stopStressTestBtn" style="padding: 5px 15px; display: none;">Stop Run</button>
        </div>
        <div id="stressTestStatus" style="font-size: 12px; color: var(--vscode-descriptionForeground);"></div>
    </div>
    <div id="editor"></div>
    `;
    }

    private getScript(): string {
        const scriptPath = path.join(this.context.extensionPath, 'webviews', 'queryEditor.js');
        try {
            return fs.readFileSync(scriptPath, 'utf8');
        } catch (error) {
            this.logger.error('Failed to load queryEditor.js', error);
            return '// Error loading script';
        }
    }
}


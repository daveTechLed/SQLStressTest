// Mock VS Code API for testing
export const mockVscode = {
    window: {
        createStatusBarItem: jest.fn(),
        createTreeView: jest.fn(),
        createWebviewPanel: jest.fn(),
        showInputBox: jest.fn(),
        showQuickPick: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        withProgress: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceState: {
            get: jest.fn(),
            update: jest.fn()
        }
    },
    commands: {
        registerCommand: jest.fn()
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
    ExtensionContext: jest.fn()
};

// Mock module
jest.mock('vscode', () => mockVscode);


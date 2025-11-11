"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = __importDefault(require("path"));
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov', 'json'],
            exclude: [
                'node_modules/',
                'src/**/*.d.ts',
                'src/**/__tests__/**',
                'out/**',
                '.vscode-test/**'
            ],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80
            }
        },
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
    },
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src')
        }
    }
});
//# sourceMappingURL=vitest.config.js.map
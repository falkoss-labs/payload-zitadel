import {defineConfig} from 'vitest/config'

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'int',
                    include: ['test/int/**/*.test.ts'],
                    environment: 'node',
                    testTimeout: 30_000,
                    hookTimeout: 60_000,
                },
            },
        ],
    },
})

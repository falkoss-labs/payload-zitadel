import {withPayload} from '@payloadcms/tanstack-start'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc'
import path from 'node:path'
import {defineConfig} from 'vite'

export default defineConfig(
    withPayload(
        ({pluginOptions}) => ({
            plugins: [
                rsc(pluginOptions.rsc),
                tanstackStart(pluginOptions.tanstackStart),
                viteReact(pluginOptions.react),
            ],
            server: {
                port: 3000,
            },
        }),
        {payloadConfigPath: path.resolve(import.meta.dirname, 'src', 'payload.config.ts')},
    ),
)

import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'
import { socketHandlers } from './socketServer'

export const worker = setupWorker(...handlers, ...socketHandlers)

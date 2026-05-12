/**
 * Sub-Store Workers 入口文件
 */

import { getRequestId, initLogger, error as logError } from '../../utils/logger.js';
import { addRequestIdHeaderToResponse } from '../../atoms/http/httpAtoms.js';
import { handleHttp, handleCron } from '../../orchestration/commander/httpCommander.js';
import { createEntryGatewayForWorkers } from './runtime/createEntryGateway.js';
import './runtime/registerRuntimeLoaders.js';

/**
 * Workers Export
 */
export default {
    /**
     * HTTP Fetch Handler
     */
    async fetch(request, env, ctx) {
        // 初始化日志模块
        initLogger(env);
        const requestId = getRequestId(request);

        try {
            const entryGateway = createEntryGatewayForWorkers({ env });
            const response = await handleHttp({ request, env, ctx, requestId, entryGateway });
            return addRequestIdHeaderToResponse(response, requestId);
        } catch (err) {
            logError(`[Worker] [${requestId}] unhandled error:`, err?.stack || err?.message || err);
            const response = new Response(
                env?.DEBUG === true || env?.DEBUG === 'true'
                    ? JSON.stringify({
                        status: 'failed',
                        source: 'Worker',
                        message: err?.message || String(err),
                        stack: err?.stack || null,
                    })
                    : 'Internal Server Error',
                {
                    status: 500,
                    headers: env?.DEBUG === true || env?.DEBUG === 'true'
                        ? { 'Content-Type': 'application/json' }
                        : undefined,
                },
            );
            return addRequestIdHeaderToResponse(response, requestId);
        }
    },

    /**
     * Scheduled (Cron) Handler
     * 遍历所有用户执行定时任务
     */
    async scheduled(event, env, ctx) {
        // 初始化日志模块
        initLogger(env);

        try {
            const entryGateway = createEntryGatewayForWorkers({ env });
            await handleCron({ event, env, ctx, entryGateway });
        } catch (err) {
            logError('[Worker] [cron] unhandled error:', err?.stack || err?.message || err);
        }
    },
};

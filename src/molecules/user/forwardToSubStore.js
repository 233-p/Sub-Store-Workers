/**
 * L3 - Molecule
 * User 域：处理 Sub-Store HTTP 请求，并在成功下载时写入访问日志。
 */

import { errorResponse } from '../../atoms/http/httpAtoms.js';
import { flushDirtyGlobalUserData } from '../../atoms/user/flushDirtyGlobalUserData.js';
import { extractAvatarUrlFromUserDataString } from '../../atoms/user/extractAvatarUrlFromUserDataString.js';
import { runSubStoreHttpForUser } from '../../atoms/substore/runSubStoreHttpForUser.js';

export async function forwardToSubStore({ request, env, state, storage, requestId, route, userGateway, mmdbGateway, indexGateway }) {
    const headerUserId = request.headers.get('X-User-Id');
    const userId = parseInt(headerUserId || '0', 10) || 0;

    const username = request.headers.get('X-Username') || `user-${userId || 'unknown'}`;
    const role = request.headers.get('X-Role') || 'user';
    const userPath = request.headers.get('X-User-Path') || '';
    const userData = (await userGateway.getUserDataString(userId)) ?? '{}';
    const user = { id: userId, username, role, path: userPath, data: userData };

    const saveUserData = async (id, savedFromContext) => {
        const saved = savedFromContext || flushDirtyGlobalUserData();
        if (!saved) return;
        if (id) {
            await userGateway.putUserDataString(id, saved);
        }
        const avatarUrl = extractAvatarUrlFromUserDataString(saved);
        const prev = await userGateway.getUserStoreValue(id, 'avatar_url') ?? '';
        if (prev !== avatarUrl) {
            await userGateway.putUserStoreValue(id, 'avatar_url', avatarUrl);
            if (id) await indexGateway.updateAvatar(id, avatarUrl);
        }
    };

    const httpEnv = { ...env, __saveUserData: (id, savedFromContext) => saveUserData(id, savedFromContext), __mmdbGateway: mmdbGateway };

    const resp = await runSubStoreHttpForUser({
        user,
        env: httpEnv,
        state,
        request,
        subStorePath: route.substore.subStorePath,
    });

    if (!resp) return errorResponse('Internal Server Error', 500);

    // 仅记录成功下载（200/304）
    if (route.downloadLogCandidate) {
        const st = resp.status ?? 0;
        if (st === 200 || st === 304) {
            await userGateway.appendAccessLog(userId, { ...route.downloadLogCandidate, status: st });
        }
    }

    return resp;
}

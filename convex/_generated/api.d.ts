/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as engineeringPlans from '../engineeringPlans.js';
import type * as productSessionConversation from '../productSessionConversation.js';
import type * as productSessionTitle from '../productSessionTitle.js';
import type * as productSessions from '../productSessions.js';
import type * as realtime from '../realtime.js';
import type * as realtimeConversationItems from '../realtimeConversationItems.js';
import type * as viewer from '../viewer.js';

import type { ApiFromModules, FilterApi, FunctionReference } from 'convex/server';

declare const fullApi: ApiFromModules<{
	engineeringPlans: typeof engineeringPlans;
	productSessionConversation: typeof productSessionConversation;
	productSessionTitle: typeof productSessionTitle;
	productSessions: typeof productSessions;
	realtime: typeof realtime;
	realtimeConversationItems: typeof realtimeConversationItems;
	viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, 'public'>>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, 'internal'>>;

export declare const components: {};

import type { UserIdentity } from 'convex/server';
import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalQuery, mutation } from './_generated/server';
import {
	realtimeConversationItemValidator,
	type RealtimeConversationItem
} from './realtimeConversationItems';

type RealtimeMessageItem = Extract<RealtimeConversationItem, { type: 'message' }>;
export type ProductSessionConversationHistory = RealtimeConversationItem[];
export type ProductSessionConversationSnapshot = {
	history: ProductSessionConversationHistory;
	historyRevision: number;
};

function readConversationTextContent(content: RealtimeMessageItem['content']): string {
	const parts = content
		.map((entry): string => ('text' in entry ? entry.text : (entry.transcript ?? '')))
		.filter((value): boolean => value.trim().length > 0);

	return parts.join(' ').trim();
}

function getConversationPreview(history: RealtimeConversationItem[]): string {
	for (let index = history.length - 1; index >= 0; index -= 1) {
		const item = history[index];
		if (item.type !== 'message' || item.role !== 'user') {
			continue;
		}

		const preview = readConversationTextContent(item.content);
		if (!preview) {
			continue;
		}

		return preview.slice(0, 280);
	}

	return '';
}

async function requireOwnedProductSession(
	ctx: QueryCtx | MutationCtx,
	productSessionId: Id<'productSessions'>
) {
	const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error('Authentication required to load a product session conversation.');
	}

	const session = await ctx.db.get(productSessionId);
	if (!session) {
		throw new Error('Product session not found.');
	}

	if (session.ownerTokenIdentifier !== identity.tokenIdentifier) {
		throw new Error('You are not allowed to access this product session conversation.');
	}

	return session;
}

async function getConversationStateRecord(
	ctx: QueryCtx | MutationCtx,
	productSessionId: Id<'productSessions'>
) {
	return ctx.db
		.query('productSessionConversations')
		.withIndex('by_productSessionId', (q) => q.eq('productSessionId', productSessionId))
		.unique();
}

async function getConversationHistory(
	ctx: QueryCtx | MutationCtx,
	productSessionId: Id<'productSessions'>
): Promise<ProductSessionConversationHistory> {
	const conversationItems = await ctx.db
		.query('productSessionConversationItems')
		.withIndex('by_productSessionId_order', (q) => q.eq('productSessionId', productSessionId))
		.collect();

	return conversationItems.map((item) => item.item);
}

export const productSessionConversationSnapshotValidator = v.object({
	history: v.array(realtimeConversationItemValidator),
	historyRevision: v.number()
});

export const getOwnedProductSessionConversationSnapshot = internalQuery({
	args: {
		productSessionId: v.id('productSessions')
	},
	returns: productSessionConversationSnapshotValidator,
	handler: async (ctx, args): Promise<ProductSessionConversationSnapshot> => {
		await requireOwnedProductSession(ctx, args.productSessionId);
		const [history, conversationState] = await Promise.all([
			getConversationHistory(ctx, args.productSessionId),
			getConversationStateRecord(ctx, args.productSessionId)
		]);

		return {
			history,
			historyRevision: conversationState?.historyRevision ?? 0
		};
	}
});

export const syncProductSessionConversationHistory = mutation({
	args: {
		productSessionId: v.id('productSessions'),
		historyRevision: v.number(),
		history: v.array(realtimeConversationItemValidator)
	},
	returns: v.object({
		latestRevision: v.number()
	}),
	handler: async (ctx, args) => {
		await requireOwnedProductSession(ctx, args.productSessionId);

		const timestamp = Date.now();
		const conversationState = await getConversationStateRecord(ctx, args.productSessionId);
		if (conversationState && args.historyRevision <= conversationState.historyRevision) {
			return {
				latestRevision: conversationState.historyRevision
			};
		}

		const existingItems = await ctx.db
			.query('productSessionConversationItems')
			.withIndex('by_productSessionId', (q) => q.eq('productSessionId', args.productSessionId))
			.collect();
		const existingItemsById = new Map(existingItems.map((item) => [item.itemId, item]));
		const incomingItemIds = new Set<string>();

		for (let order = 0; order < args.history.length; order += 1) {
			const item = args.history[order];
			if (incomingItemIds.has(item.itemId)) {
				throw new Error(`Duplicate conversation history itemId "${item.itemId}".`);
			}

			incomingItemIds.add(item.itemId);
			const existingItem = existingItemsById.get(item.itemId);
			if (existingItem) {
				await ctx.db.patch(existingItem._id, {
					order,
					item: args.history[order]
				});
				continue;
			}

			await ctx.db.insert('productSessionConversationItems', {
				productSessionId: args.productSessionId,
				itemId: item.itemId,
				order,
				item: args.history[order]
			});
		}

		for (const existingItem of existingItems) {
			if (incomingItemIds.has(existingItem.itemId)) {
				continue;
			}

			await ctx.db.delete(existingItem._id);
		}

		const productSessionPatch: {
			productDescription?: string;
			updatedAt: number;
		} = {
			updatedAt: timestamp
		};
		const preview = getConversationPreview(args.history);
		if (preview) {
			productSessionPatch.productDescription = preview;
		}

		await ctx.db.patch(args.productSessionId, productSessionPatch);
		if (conversationState) {
			await ctx.db.patch(conversationState._id, {
				historyRevision: args.historyRevision,
				updatedAt: timestamp
			});
		} else {
			await ctx.db.insert('productSessionConversations', {
				productSessionId: args.productSessionId,
				historyRevision: args.historyRevision,
				updatedAt: timestamp
			});
		}

		return {
			latestRevision: args.historyRevision
		};
	}
});

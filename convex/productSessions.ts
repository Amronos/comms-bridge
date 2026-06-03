import type { UserIdentity } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internalQuery, mutation, query } from './_generated/server';
import {
	getEngineeringPlanForProductSession,
	resolveProductSessionTitle
} from './productSessionTitle';

export const ownedProductSessionValidator = v.object({
	id: v.id('productSessions'),
	productDescription: v.string(),
	productName: v.string()
});

export type OwnedProductSession = Infer<typeof ownedProductSessionValidator>;

export const listProductSessions = query({
	args: {},
	returns: v.array(
		v.object({
			id: v.id('productSessions'),
			productDescription: v.string(),
			productName: v.string(),
			updatedAt: v.number()
		})
	),
	handler: async (ctx) => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const sessions = await ctx.db
			.query('productSessions')
			.withIndex('by_ownerTokenIdentifier', (q) =>
				q.eq('ownerTokenIdentifier', identity.tokenIdentifier)
			)
			.collect();
		const sortedSessions = [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);

		return await Promise.all(
			sortedSessions.map(async (session) => {
				const engineeringPlan = await getEngineeringPlanForProductSession(ctx, session._id);

				return {
					id: session._id,
					productDescription: session.productDescription,
					productName: resolveProductSessionTitle(session.productName, engineeringPlan),
					updatedAt: session.updatedAt
				};
			})
		);
	}
});

export const createProductSession = mutation({
	args: {},
	returns: v.object({
		id: v.id('productSessions'),
		productDescription: v.string(),
		productName: v.string(),
		updatedAt: v.number()
	}),
	handler: async (ctx) => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Authentication required to create a product session.');
		}

		const now = Date.now();
		const productName = 'Untitled product';
		const productDescription = '';

		const id = await ctx.db.insert('productSessions', {
			ownerTokenIdentifier: identity.tokenIdentifier,
			ownerName: identity.name ?? '',
			ownerEmail: identity.email ?? '',
			productName,
			productDescription,
			updatedAt: now
		});

		return {
			id,
			productDescription,
			productName,
			updatedAt: now
		};
	}
});

export const deleteProductSession = mutation({
	args: {
		productSessionId: v.id('productSessions')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Authentication required to delete a product session.');
		}

		const session = await ctx.db.get(args.productSessionId);
		if (!session) {
			return null;
		}

		if (session.ownerTokenIdentifier !== identity.tokenIdentifier) {
			throw new Error('You are not allowed to delete this product session.');
		}

		const engineeringPlans = await ctx.db
			.query('engineeringPlans')
			.withIndex('by_productSessionId', (q) => q.eq('productSessionId', session._id))
			.collect();
		const conversationItems = await ctx.db
			.query('productSessionConversationItems')
			.withIndex('by_productSessionId', (q) => q.eq('productSessionId', session._id))
			.collect();

		await Promise.all(engineeringPlans.map((plan) => ctx.db.delete(plan._id)));
		await Promise.all(
			conversationItems.map((conversationItem) => ctx.db.delete(conversationItem._id))
		);
		await ctx.db.delete(session._id);

		return null;
	}
});

export const getOwnedProductSession = internalQuery({
	args: {
		productSessionId: v.id('productSessions')
	},
	returns: ownedProductSessionValidator,
	handler: async (ctx, args): Promise<OwnedProductSession> => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Authentication required to load a product session.');
		}

		const session = await ctx.db.get(args.productSessionId);
		if (!session) {
			throw new Error('Product session not found.');
		}

		if (session.ownerTokenIdentifier !== identity.tokenIdentifier) {
			throw new Error('You are not allowed to access this product session.');
		}

		const engineeringPlan = await getEngineeringPlanForProductSession(ctx, session._id);

		return {
			id: session._id,
			productDescription: session.productDescription,
			productName: resolveProductSessionTitle(session.productName, engineeringPlan)
		};
	}
});

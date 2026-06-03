import type { UserIdentity } from 'convex/server';
import { mutation } from './_generated/server';
import { v } from 'convex/values';

import { resolveProductSessionTitle } from './productSessionTitle';

export const saveEngineeringPlan = mutation({
	args: {
		productSessionId: v.id('productSessions'),
		title: v.string(),
		customerRequirements: v.array(v.string()),
		engineeringSummary: v.string(),
		implementationSteps: v.array(v.string()),
		assumptions: v.array(v.string()),
		risks: v.array(v.string()),
		openQuestions: v.array(v.string())
	},
	returns: v.object({
		planId: v.id('engineeringPlans'),
		productSessionId: v.id('productSessions'),
		status: v.union(v.literal('created'), v.literal('updated'))
	}),
	handler: async (ctx, args) => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Authentication required to save an engineering plan.');
		}

		const timestamp = Date.now();
		const productSession = await ctx.db.get(args.productSessionId);
		if (!productSession) {
			throw new Error('Product session not found.');
		}

		if (productSession.ownerTokenIdentifier !== identity.tokenIdentifier) {
			throw new Error('You are not allowed to update this product session.');
		}

		const existingPlan = await ctx.db
			.query('engineeringPlans')
			.withIndex('by_productSessionId', (q) => q.eq('productSessionId', args.productSessionId))
			.unique();

		const sessionTitle = resolveProductSessionTitle(productSession.productName, {
			title: args.title
		});

		if (existingPlan) {
			await ctx.db.patch(existingPlan._id, {
				title: args.title,
				customerRequirements: args.customerRequirements,
				engineeringSummary: args.engineeringSummary,
				implementationSteps: args.implementationSteps,
				assumptions: args.assumptions,
				risks: args.risks,
				openQuestions: args.openQuestions
			});

			await ctx.db.patch(args.productSessionId, {
				productName: sessionTitle,
				updatedAt: timestamp
			});

			return {
				planId: existingPlan._id,
				productSessionId: args.productSessionId,
				status: 'updated' as const
			};
		}

		const planId = await ctx.db.insert('engineeringPlans', {
			productSessionId: args.productSessionId,
			title: args.title,
			customerRequirements: args.customerRequirements,
			engineeringSummary: args.engineeringSummary,
			implementationSteps: args.implementationSteps,
			assumptions: args.assumptions,
			risks: args.risks,
			openQuestions: args.openQuestions
		});

		await ctx.db.patch(args.productSessionId, {
			productName: sessionTitle,
			updatedAt: timestamp
		});

		return {
			planId,
			productSessionId: args.productSessionId,
			status: 'created' as const
		};
	}
});

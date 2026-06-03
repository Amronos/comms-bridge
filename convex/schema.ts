import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { realtimeConversationItemValidator } from './realtimeConversationItems';

export default defineSchema({
	productSessions: defineTable({
		ownerTokenIdentifier: v.string(),
		ownerName: v.string(),
		ownerEmail: v.string(),
		productName: v.string(),
		productDescription: v.string(),
		updatedAt: v.number()
	}).index('by_ownerTokenIdentifier', ['ownerTokenIdentifier']),
	productSessionConversationItems: defineTable({
		productSessionId: v.id('productSessions'),
		itemId: v.string(),
		order: v.number(),
		item: realtimeConversationItemValidator
	})
		.index('by_productSessionId', ['productSessionId'])
		.index('by_productSessionId_order', ['productSessionId', 'order'])
		.index('by_productSessionId_itemId', ['productSessionId', 'itemId']),
	engineeringPlans: defineTable({
		productSessionId: v.id('productSessions'),
		title: v.string(),
		customerRequirements: v.array(v.string()),
		engineeringSummary: v.string(),
		implementationSteps: v.array(v.string()),
		assumptions: v.array(v.string()),
		risks: v.array(v.string()),
		openQuestions: v.array(v.string())
	}).index('by_productSessionId', ['productSessionId'])
});

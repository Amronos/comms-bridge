import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	productSessions: defineTable({
		ownerTokenIdentifier: v.string(),
		ownerName: v.string(),
		ownerEmail: v.string(),
		productName: v.string(),
		productDescription: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_ownerTokenIdentifier', ['ownerTokenIdentifier']),
	engineeringPlans: defineTable({
		productSessionId: v.id('productSessions'),
		title: v.string(),
		customerRequirements: v.array(v.string()),
		engineeringSummary: v.string(),
		implementationSteps: v.array(v.string()),
		assumptions: v.array(v.string()),
		risks: v.array(v.string()),
		openQuestions: v.array(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_productSessionId', ['productSessionId'])
});

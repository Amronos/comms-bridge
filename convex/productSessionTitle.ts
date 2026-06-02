import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

type DbCtx = QueryCtx | MutationCtx;

export function resolveProductSessionTitle(
	productName: string,
	engineeringPlan: Pick<Doc<'engineeringPlans'>, 'title'> | null
) {
	const planTitle = engineeringPlan?.title.trim();
	return planTitle ? planTitle : productName;
}

export async function getEngineeringPlanForProductSession(
	ctx: DbCtx,
	productSessionId: Id<'productSessions'>
) {
	return await ctx.db
		.query('engineeringPlans')
		.withIndex('by_productSessionId', (q) => q.eq('productSessionId', productSessionId))
		.unique();
}

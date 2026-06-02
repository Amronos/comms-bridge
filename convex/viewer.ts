import type { UserIdentity } from 'convex/server';
import { query } from './_generated/server';

export const current = query({
	args: {},
	handler: async (ctx): Promise<{ email: string; name: string } | null> => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();

		if (!identity) {
			return null;
		}

		return {
			email: identity.email ?? '',
			name: identity.name ?? identity.givenName ?? ''
		};
	}
});

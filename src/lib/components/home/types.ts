import type { Id } from '../../../../convex/_generated/dataModel.js';

export type ProductSession = {
	id: Id<'productSessions'>;
	productDescription: string;
	productName: string;
	updatedAt: number;
};

export type SessionContextMenu = {
	sessionId: Id<'productSessions'>;
	x: number;
	y: number;
};

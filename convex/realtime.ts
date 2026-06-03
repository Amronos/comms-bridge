'use node';

import { createHash } from 'node:crypto';

import type { RealtimeSessionConfig } from '@openai/agents/realtime';
import OpenAI from 'openai';
import type { ClientSecretCreateParams } from 'openai/resources/realtime/client-secrets';
import type { UserIdentity } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import type { ProductSessionConversationSnapshot } from './productSessionConversation';
import type { OwnedProductSession } from './productSessions';
import {
	realtimeConversationItemValidator,
	type RealtimeConversationItem
} from './realtimeConversationItems';

const REALTIME_MODEL: string = 'gpt-realtime-2';
const REALTIME_VOICE: string = 'marin';
const CLIENT_SECRET_TTL_SECONDS: number = 60;

type ProductSessionArgs = {
	productSessionId: Id<'productSessions'>;
};

type CreateRealtimeSessionResult = {
	agentName: string;
	clientSecret: string;
	config: Partial<RealtimeSessionConfig>;
	conversationHistory: RealtimeConversationItem[];
	conversationHistoryRevision: number;
	expiresAt: number | null;
	instructions: string;
	model: string;
	productDescription: string;
	productName: string;
	productSessionId: ProductSessionArgs['productSessionId'];
};

function buildVoiceAgentInstructions(signedInName: string, productName: string): string {
	return [
		'You are Comms Bridge, a helpful live voice assistant.',
		'Speak naturally, keep replies concise, and ask follow-up questions only when they help.',
		'Prefer short answers that sound good when spoken aloud.',
		'Help the customer turn product requirements into an actionable engineering plan.',
		'When the customer has shared enough detail, call the save_engineering_plan tool to create or update the engineering plan.',
		'Whenever you learn important new requirements or constraints, call the tool again with the full latest plan so the saved plan stays up to date.',
		'Keep asking focused follow-up questions when scope, constraints, or success criteria are missing.',
		'Do not mention the tool or that a plan was saved unless the user explicitly asks.',
		'If the user interrupts, stop cleanly and continue from their latest intent.',
		`The signed-in user is ${signedInName}.`,
		`The active product session is ${productName}.`
	].join('\n');
}

function hashSafetyIdentifier(tokenIdentifier: string) {
	return createHash('sha256').update(tokenIdentifier).digest('hex');
}

function buildSessionConfig() {
	return {
		outputModalities: ['audio'],
		reasoning: {
			effort: 'low'
		},
		audio: {
			input: {
				noiseReduction: {
					type: 'near_field'
				},
				turnDetection: {
					type: 'semantic_vad',
					createResponse: true,
					eagerness: 'low',
					interruptResponse: true
				}
			},
			output: {
				voice: REALTIME_VOICE
			}
		}
	} as const;
}

function buildRealtimeApiSessionPayload(): NonNullable<ClientSecretCreateParams['session']> {
	return {
		type: 'realtime',
		model: REALTIME_MODEL
	};
}

export const createRealtimeSession = action({
	args: {
		productSessionId: v.id('productSessions')
	},
	returns: v.object({
		agentName: v.string(),
		clientSecret: v.string(),
		config: v.any(),
		conversationHistory: v.array(realtimeConversationItemValidator),
		conversationHistoryRevision: v.number(),
		expiresAt: v.union(v.float64(), v.null()),
		instructions: v.string(),
		model: v.string(),
		productDescription: v.string(),
		productName: v.string(),
		productSessionId: v.id('productSessions')
	}),
	handler: async (ctx, args): Promise<CreateRealtimeSessionResult> => {
		const identity: UserIdentity | null = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Authentication required to create a realtime session.');
		}

		const apiKey: string | undefined = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error('OPENAI_API_KEY is not configured in Convex.');
		}

		const signedInName: string = identity.name ?? identity.givenName ?? 'Authenticated user';
		const productSession: OwnedProductSession = await ctx.runQuery(
			internal.productSessions.getOwnedProductSession,
			args
		);
		const conversationSnapshot: ProductSessionConversationSnapshot = await ctx.runQuery(
			internal.productSessionConversation.getOwnedProductSessionConversationSnapshot,
			args
		);
		const instructions: string = buildVoiceAgentInstructions(
			signedInName,
			productSession.productName
		);
		const config = buildSessionConfig();
		const realtimeApiSession = buildRealtimeApiSessionPayload();
		const openai: OpenAI = new OpenAI({
			apiKey,
			defaultHeaders: {
				'OpenAI-Safety-Identifier': hashSafetyIdentifier(identity.tokenIdentifier)
			}
		});

		const payload = await openai.realtime.clientSecrets.create({
			expires_after: {
				anchor: 'created_at',
				seconds: CLIENT_SECRET_TTL_SECONDS
			},
			session: realtimeApiSession
		});

		return {
			agentName: 'Comms Bridge',
			clientSecret: payload.value,
			config,
			conversationHistory: conversationSnapshot.history,
			conversationHistoryRevision: conversationSnapshot.historyRevision,
			expiresAt: payload.expires_at ?? null,
			instructions,
			model: REALTIME_MODEL,
			productDescription: productSession.productDescription,
			productName: productSession.productName,
			productSessionId: productSession.id
		};
	}
});

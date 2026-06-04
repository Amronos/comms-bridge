import type { RealtimeItem, RealtimeSessionConfig } from '@openai/agents/realtime';
import {
	OpenAIRealtimeWebRTC,
	RealtimeAgent,
	RealtimeSession,
	tool
} from '@openai/agents/realtime';
import type { ConvexClient } from 'convex/browser';
import { z } from 'zod';

import { api } from '../../../convex/_generated/api.js';
import type { Id } from '../../../convex/_generated/dataModel.js';

export type RealtimeSessionBootstrap = {
	agentName: string;
	clientSecret: string;
	config: Partial<RealtimeSessionConfig>;
	conversationHistory: RealtimeItem[];
	conversationHistoryRevision: number;
	expiresAt: number | null;
	instructions: string;
	model: string;
	productDescription: string;
	productName: string;
	productSessionId: Id<'productSessions'>;
};

export type PeerConnectionStateSnapshot = {
	connectionState: RTCPeerConnectionState;
	iceConnectionState: RTCIceConnectionState;
	iceGatheringState: RTCIceGatheringState;
	signalingState: RTCSignalingState;
};

export type RealtimeSessionDiagnostics = {
	onConversationHistorySyncError?: (error: unknown) => void;
	onPeerConnectionStateChange?: (state: PeerConnectionStateSnapshot) => void;
};

export type RealtimeConversationHistorySync = {
	dispose: () => void;
	flush: () => Promise<void>;
};

const engineeringPlanSchema = z.object({
	title: z.string().trim().min(1).max(120),
	customerRequirements: z.array(z.string().trim().min(1)).min(1),
	engineeringSummary: z.string().trim().min(1),
	implementationSteps: z.array(z.string().trim().min(1)).min(1),
	assumptions: z.array(z.string().trim().min(1)).default([]),
	risks: z.array(z.string().trim().min(1)).default([]),
	openQuestions: z.array(z.string().trim().min(1)).default([])
});

export function browserSupportsLiveAudio() {
	return (
		typeof navigator !== 'undefined' &&
		Boolean(navigator.mediaDevices?.getUserMedia) &&
		typeof RTCPeerConnection !== 'undefined'
	);
}

function createSaveEngineeringPlanTool(bootstrap: RealtimeSessionBootstrap, convex: ConvexClient) {
	return tool({
		name: 'save_engineering_plan',
		description:
			'Create or update the current structured engineering plan based on the latest customer product requirements. Always send the full current plan, not just the delta.',
		parameters: engineeringPlanSchema,
		execute: async (input) => {
			const result = await convex.mutation(api.engineeringPlans.saveEngineeringPlan, {
				productSessionId: bootstrap.productSessionId,
				...input
			});

			return result.status === 'created'
				? 'Engineering plan created.'
				: 'Engineering plan updated.';
		}
	});
}

function cloneHistory(history: RealtimeItem[]): RealtimeItem[] {
	return JSON.parse(JSON.stringify(history)) as RealtimeItem[];
}

function normalizeHistoryValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(normalizeHistoryValue);
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([key, nestedValue]) => [key, normalizeHistoryValue(nestedValue)])
	);
}

function serializeHistory(history: RealtimeItem[]): string {
	return JSON.stringify(normalizeHistoryValue(history));
}

export async function seedRealtimeConversationHistory(
	session: RealtimeSession,
	history: RealtimeItem[]
) {
	if (history.length === 0) {
		return;
	}

	const targetHistory = cloneHistory(history);
	const targetSignature = serializeHistory(targetHistory);
	if (serializeHistory(session.history) === targetSignature) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			session.off('history_updated', handleHistoryUpdated);
			reject(new Error('Timed out while restoring conversation history.'));
		}, 10000);

		const handleHistoryUpdated = (updatedHistory: RealtimeItem[]) => {
			if (serializeHistory(updatedHistory) !== targetSignature) {
				return;
			}

			clearTimeout(timeout);
			session.off('history_updated', handleHistoryUpdated);
			resolve();
		};

		session.on('history_updated', handleHistoryUpdated);
		session.updateHistory(targetHistory);
	});
}

export function persistRealtimeConversationHistory(
	session: RealtimeSession,
	convex: ConvexClient,
	bootstrap: RealtimeSessionBootstrap,
	diagnostics: RealtimeSessionDiagnostics = {}
): RealtimeConversationHistorySync {
	let latestSnapshot: {
		history: RealtimeItem[];
		historyRevision: number;
	} | null = null;
	let flushPromise: Promise<void> | null = null;
	let nextHistoryRevision = bootstrap.conversationHistoryRevision;
	const getLatestSnapshot = () => latestSnapshot;

	const runFlush = async () => {
		if (flushPromise) {
			return flushPromise;
		}

		flushPromise = (async () => {
			while (latestSnapshot) {
				const snapshotToPersist = latestSnapshot;
				latestSnapshot = null;

				try {
					const result = await convex.mutation(
						api.productSessionConversation.syncProductSessionConversationHistory,
						{
							productSessionId: bootstrap.productSessionId,
							historyRevision: snapshotToPersist.historyRevision,
							history: snapshotToPersist.history
						}
					);
					nextHistoryRevision = Math.max(nextHistoryRevision, result.latestRevision);
				} catch (error) {
					const queuedSnapshot = getLatestSnapshot();
					if (
						!queuedSnapshot ||
						queuedSnapshot.historyRevision < snapshotToPersist.historyRevision
					) {
						latestSnapshot = snapshotToPersist;
					}
					throw error;
				}
			}
		})().finally(() => {
			flushPromise = null;
		});

		return flushPromise;
	};

	const handleHistoryUpdated = (history: RealtimeItem[]) => {
		nextHistoryRevision += 1;
		latestSnapshot = {
			history: cloneHistory(history),
			historyRevision: nextHistoryRevision
		};
		void runFlush().catch((error) => {
			diagnostics.onConversationHistorySyncError?.(error);
		});
	};

	session.on('history_updated', handleHistoryUpdated);

	return {
		dispose: () => {
			session.off('history_updated', handleHistoryUpdated);
		},
		flush: async () => {
			await runFlush();
		}
	};
}

export async function createSpeechToSpeechSession(
	bootstrap: RealtimeSessionBootstrap,
	convex: ConvexClient,
	diagnostics: RealtimeSessionDiagnostics = {}
) {
	const agent = new RealtimeAgent({
		name: bootstrap.agentName,
		instructions: bootstrap.instructions,
		tools: [createSaveEngineeringPlanTool(bootstrap, convex)]
	});

	const mediaStream = await navigator.mediaDevices.getUserMedia({
		audio: {
			autoGainControl: true,
			echoCancellation: true,
			noiseSuppression: true
		}
	});

	return new RealtimeSession(agent, {
		model: bootstrap.model,
		config: bootstrap.config,
		transport: new OpenAIRealtimeWebRTC({
			mediaStream,
			changePeerConnection: (peerConnection) => {
				const emitPeerConnectionState = () => {
					diagnostics.onPeerConnectionStateChange?.({
						connectionState: peerConnection.connectionState,
						iceConnectionState: peerConnection.iceConnectionState,
						iceGatheringState: peerConnection.iceGatheringState,
						signalingState: peerConnection.signalingState
					});
				};

				peerConnection.addEventListener('connectionstatechange', emitPeerConnectionState);
				peerConnection.addEventListener('iceconnectionstatechange', emitPeerConnectionState);
				peerConnection.addEventListener('icegatheringstatechange', emitPeerConnectionState);
				peerConnection.addEventListener('signalingstatechange', emitPeerConnectionState);
				emitPeerConnectionState();

				return peerConnection;
			}
		})
	});
}

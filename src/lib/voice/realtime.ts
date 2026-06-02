import type { RealtimeSessionConfig } from '@openai/agents/realtime';
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
	onPeerConnectionStateChange?: (state: PeerConnectionStateSnapshot) => void;
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

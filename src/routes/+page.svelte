<script lang="ts">
	import type { RealtimeSession } from '@openai/agents/realtime';
	import { onDestroy } from 'svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';

	import { authState, signIn, signOut } from '$lib/auth';
	import AppSidebar from '$lib/components/home/AppSidebar.svelte';
	import SessionContextMenu from '$lib/components/home/SessionContextMenu.svelte';
	import type {
		ProductSession,
		SessionContextMenu as SessionContextMenuState
	} from '$lib/components/home/types.js';
	import VoiceAssistantPanel from '$lib/components/home/VoiceAssistantPanel.svelte';
	import {
		browserSupportsLiveAudio,
		createSpeechToSpeechSession,
		persistRealtimeConversationHistory,
		seedRealtimeConversationHistory
	} from '$lib/voice/realtime';
	import type { RealtimeConversationHistorySync } from '$lib/voice/realtime';
	import { api } from '../../convex/_generated/api.js';
	import type { Id } from '../../convex/_generated/dataModel.js';

	let activeRealtimeSession: RealtimeSession | null = null;
	let activeConversationHistorySync: RealtimeConversationHistorySync | null = null;
	let errorMessage = $state<string | null>(null);
	let realtimeStatusMessage = $state<string | null>(null);
	let isRealtimeConnecting = $state(false);
	let isRealtimeConnected = $state(false);
	let isAssistantSpeaking = $state(false);
	let isMicMuted = $state(true);
	let pendingProductSessionIds = $state<Id<'productSessions'>[]>([]);
	let realtimeRecoveryAttempts = 0;
	let realtimeRecoveryInProgress = false;
	let realtimeRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
	let realtimeStatusTimer: ReturnType<typeof setTimeout> | null = null;

	let selectedSessionId = $state<Id<'productSessions'> | null>(null);
	let contextMenu = $state<SessionContextMenuState | null>(null);
	let deletingSessionIds = $state<Id<'productSessions'>[]>([]);
	let hasAutoSelectedSession = false;

	const convex = useConvexClient();
	const productSessionsQuery = useQuery(api.productSessions.listProductSessions, () =>
		$authState.isAuthenticated ? {} : 'skip'
	);

	const productSessions = $derived.by<ProductSession[]>(() => productSessionsQuery.data ?? []);
	const selectedProductSession = $derived.by(
		() => productSessions.find((session) => session.id === selectedSessionId) ?? null
	);
	const voiceInputSupported = $derived.by(() => browserSupportsLiveAudio());
	const micButtonLabel = $derived.by(() => {
		if (isRealtimeConnecting) return 'Connecting...';
		if (isRealtimeConnected) return isMicMuted ? 'Enable microphone' : 'Mute microphone';
		return 'Enable microphone';
	});
	const micButtonHelpText = $derived.by(() => {
		if (!$authState.isAuthenticated) return 'Sign in to enable the live voice microphone.';
		if (!voiceInputSupported) return 'This browser cannot create the realtime microphone session.';
		if (isRealtimeConnecting) return 'Opening a low-latency audio session...';
		if (isRealtimeConnected) {
			return isMicMuted
				? 'The session is live, but your microphone is muted.'
				: 'The session is live and listening. Tap to mute your microphone.';
		}
		if (!selectedProductSession)
			return 'Tap to create a fresh product session and start the conversation.';
		return 'Tap to unmute your microphone and continue this conversation.';
	});

	$effect(() => {
		if (!$authState.isAuthenticated) {
			void stopRealtimeConversation();
			pendingProductSessionIds = [];
			selectedSessionId = null;
			hasAutoSelectedSession = false;
			return;
		}

		if (!selectedSessionId) return;
		if (!productSessionsQuery.data || productSessionsQuery.error) return;

		const selectedSessionExists = productSessions.some(
			(session) => session.id === selectedSessionId
		);
		if (selectedSessionExists) {
			if (pendingProductSessionIds.includes(selectedSessionId)) {
				pendingProductSessionIds = pendingProductSessionIds.filter(
					(sessionId) => sessionId !== selectedSessionId
				);
			}
			return;
		}

		if (!pendingProductSessionIds.includes(selectedSessionId)) {
			void stopRealtimeConversation();
			selectedSessionId = null;
		}
	});

	$effect(() => {
		if (!$authState.isAuthenticated) return;
		if (hasAutoSelectedSession || selectedSessionId || pendingProductSessionIds.length > 0) return;
		if (!productSessionsQuery.data || productSessionsQuery.error || productSessions.length === 0)
			return;

		selectedSessionId = productSessions[0].id;
		hasAutoSelectedSession = true;
	});

	onDestroy(() => {
		void stopRealtimeConversation();
	});

	function toErrorMessage(error: unknown) {
		if (error instanceof Error) return error.message;
		if (typeof error === 'string') return error;
		if (!error || typeof error !== 'object') return 'Something went wrong.';

		const record = error as Record<string, unknown>;
		if (record.error) return toErrorMessage(record.error);
		if (typeof record.message === 'string') return record.message;

		const parts = [record.type, record.code, record.status]
			.filter((part): part is string => typeof part === 'string' && part.length > 0)
			.join(': ');
		if (parts) return parts;

		return 'Something went wrong.';
	}

	function clearRealtimeStatusTimer() {
		if (!realtimeStatusTimer) return;
		clearTimeout(realtimeStatusTimer);
		realtimeStatusTimer = null;
	}

	function clearActiveRealtimeSession() {
		activeRealtimeSession = null;
	}

	function closeActiveRealtimeSession() {
		const session = activeRealtimeSession;
		clearActiveRealtimeSession();
		session?.close();
	}

	async function clearConversationHistorySync() {
		const conversationHistorySync = activeConversationHistorySync;
		activeConversationHistorySync = null;
		if (!conversationHistorySync) return;
		try {
			await conversationHistorySync.flush();
		} finally {
			conversationHistorySync.dispose();
		}
	}

	function setRealtimeStatusMessage(message: string, visibleMs = 10000) {
		clearRealtimeStatusTimer();
		realtimeStatusMessage = message;
		realtimeStatusTimer = setTimeout(() => {
			realtimeStatusMessage = null;
			realtimeStatusTimer = null;
		}, visibleMs);
	}

	function resetRealtimeConnectionState() {
		isRealtimeConnecting = false;
		isRealtimeConnected = false;
		isAssistantSpeaking = false;
	}

	async function stopRealtimeConversation() {
		clearRealtimeStatusTimer();
		clearRealtimeRecoveryTimer();
		await clearConversationHistorySync();
		closeActiveRealtimeSession();
		resetRealtimeConnectionState();
		isMicMuted = true;
		realtimeRecoveryAttempts = 0;
		realtimeRecoveryInProgress = false;
		realtimeStatusMessage = null;
	}

	async function markRealtimeDisconnected() {
		clearRealtimeRecoveryTimer();
		await clearConversationHistorySync();
		clearActiveRealtimeSession();
		resetRealtimeConnectionState();
	}

	function clearRealtimeRecoveryTimer() {
		if (!realtimeRecoveryTimer) return;
		clearTimeout(realtimeRecoveryTimer);
		realtimeRecoveryTimer = null;
	}

	async function closeRealtimeSessionForRecovery() {
		clearRealtimeRecoveryTimer();
		await clearConversationHistorySync();
		closeActiveRealtimeSession();
		resetRealtimeConnectionState();
	}

	function setRealtimeMicMuted(muted: boolean) {
		if (!activeRealtimeSession || !isRealtimeConnected) return;

		activeRealtimeSession.mute(muted);
		isMicMuted = muted;
	}

	async function recoverRealtimeConnection(
		productSessionId: Id<'productSessions'>,
		startMuted: boolean
	) {
		if (realtimeRecoveryInProgress || realtimeRecoveryAttempts >= 2) {
			errorMessage = 'Realtime connection lost. Tap the microphone to reconnect.';
			setRealtimeStatusMessage('Realtime recovery stopped.', 15000);
			return;
		}

		realtimeRecoveryInProgress = true;
		realtimeRecoveryAttempts += 1;
		setRealtimeStatusMessage('Realtime connection lost. Reconnecting...', 15000);
		await closeRealtimeSessionForRecovery();

		try {
			await startRealtimeConversation({
				isRecovery: true,
				productSessionId,
				startMuted
			});
		} finally {
			realtimeRecoveryInProgress = false;
		}
	}

	function scheduleRealtimeRecovery(
		session: RealtimeSession,
		productSessionId: Id<'productSessions'>
	) {
		if (realtimeRecoveryTimer || realtimeRecoveryInProgress) return;

		const startMuted = isMicMuted;
		realtimeRecoveryTimer = setTimeout(() => {
			realtimeRecoveryTimer = null;
			if (session !== activeRealtimeSession) return;
			void recoverRealtimeConnection(productSessionId, startMuted);
		}, 1000);
	}

	async function startRealtimeConversation(
		options: {
			isRecovery?: boolean;
			productSessionId?: Id<'productSessions'>;
			startMuted?: boolean;
		} = {}
	) {
		if (!$authState.isAuthenticated || isRealtimeConnecting || isRealtimeConnected) {
			return;
		}

		if (!voiceInputSupported) {
			errorMessage = 'Realtime voice is not supported in this browser.';
			return;
		}

		errorMessage = null;
		isRealtimeConnecting = true;
		if (!options.isRecovery) {
			realtimeRecoveryAttempts = 0;
		}

		try {
			let productSessionId = options.productSessionId ?? selectedProductSession?.id ?? null;
			if (!productSessionId) {
				const created = await convex.mutation(api.productSessions.createProductSession, {});
				productSessionId = created.id;
				pendingProductSessionIds = [...pendingProductSessionIds, created.id];
				selectedSessionId = created.id;
			}

			const bootstrap = await convex.action(api.realtime.createRealtimeSession, {
				productSessionId
			});
			const realtimeBootstrap = bootstrap;
			let session: RealtimeSession | null = null;
			session = await createSpeechToSpeechSession(realtimeBootstrap, convex, {
				onPeerConnectionStateChange: (state) => {
					if (!session || session !== activeRealtimeSession) return;

					if (
						state.connectionState === 'disconnected' ||
						state.connectionState === 'failed' ||
						state.iceConnectionState === 'disconnected' ||
						state.iceConnectionState === 'failed'
					) {
						setRealtimeStatusMessage('Realtime connection interrupted. Reconnecting...', 15000);
						scheduleRealtimeRecovery(session, realtimeBootstrap.productSessionId);
						return;
					}

					if (
						state.connectionState === 'connected' ||
						state.iceConnectionState === 'connected' ||
						state.iceConnectionState === 'completed'
					) {
						clearRealtimeRecoveryTimer();
						if (realtimeRecoveryInProgress) {
							setRealtimeStatusMessage('Realtime connection recovered.');
						}
					}
				}
			});

			session.on('audio_start', () => {
				if (session !== activeRealtimeSession) return;
				isAssistantSpeaking = true;
			});

			session.on('audio_stopped', () => {
				if (session !== activeRealtimeSession) return;
				isAssistantSpeaking = false;
			});

			session.on('audio_interrupted', () => {
				if (session !== activeRealtimeSession) return;
				isAssistantSpeaking = false;
			});

			session.on('error', (event) => {
				if (session !== activeRealtimeSession) return;
				errorMessage = toErrorMessage(event.error);
				if (session.transport.status === 'disconnected') {
					void stopRealtimeConversation();
				}
			});

			session.transport.on('disconnected', () => {
				if (session !== activeRealtimeSession) return;
				void markRealtimeDisconnected();
				errorMessage = 'Realtime voice session disconnected.';
				setRealtimeStatusMessage('Realtime transport disconnected.', 15000);
			});

			activeRealtimeSession = session;
			await session.connect({
				apiKey: realtimeBootstrap.clientSecret
			});

			if (session !== activeRealtimeSession) {
				session.close();
				return;
			}

			await seedRealtimeConversationHistory(session, realtimeBootstrap.conversationHistory);
			if (session !== activeRealtimeSession) {
				session.close();
				return;
			}

			activeConversationHistorySync = persistRealtimeConversationHistory(
				session,
				convex,
				realtimeBootstrap,
				{
					onConversationHistorySyncError: (error) => {
						errorMessage = `Failed to save conversation history. ${toErrorMessage(error)}`;
					}
				}
			);

			isRealtimeConnecting = false;
			isRealtimeConnected = true;
			session.mute(options.startMuted ?? false);
			isMicMuted = options.startMuted ?? false;
			setRealtimeStatusMessage(
				options.isRecovery ? 'Realtime reconnected.' : 'Realtime connected.'
			);
		} catch (error) {
			errorMessage = toErrorMessage(error);
			void stopRealtimeConversation();
		}
	}

	function toggleRealtimeConversation() {
		if (isRealtimeConnecting) {
			return;
		}

		if (isRealtimeConnected) {
			setRealtimeMicMuted(!isMicMuted);
			return;
		}

		void startRealtimeConversation();
	}

	function selectProductSession(sessionId: Id<'productSessions'>) {
		if (sessionId === selectedSessionId) {
			return;
		}

		void stopRealtimeConversation();
		selectedSessionId = sessionId;
	}

	function startNewSession() {
		void stopRealtimeConversation();
		errorMessage = null;
		selectedSessionId = null;
	}

	function openSessionContextMenu(event: MouseEvent, sessionId: Id<'productSessions'>) {
		event.preventDefault();
		contextMenu = { sessionId, x: event.clientX, y: event.clientY };
	}

	function closeSessionContextMenu() {
		contextMenu = null;
	}

	async function deleteProductSession(sessionId: Id<'productSessions'>) {
		closeSessionContextMenu();
		if (deletingSessionIds.includes(sessionId)) {
			return;
		}

		deletingSessionIds = [...deletingSessionIds, sessionId];
		errorMessage = null;

		try {
			if (sessionId === selectedSessionId) {
				void stopRealtimeConversation();
				selectedSessionId = null;
			}

			await convex.mutation(api.productSessions.deleteProductSession, {
				productSessionId: sessionId
			});

			pendingProductSessionIds = pendingProductSessionIds.filter((id) => id !== sessionId);
		} catch (error) {
			errorMessage = toErrorMessage(error);
		} finally {
			deletingSessionIds = deletingSessionIds.filter((id) => id !== sessionId);
		}
	}
</script>

<svelte:head>
	<title>Comms Bridge</title>
</svelte:head>

<div class="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-950">
	<AppSidebar
		isAuthenticated={$authState.isAuthenticated}
		isLoadingSessions={productSessionsQuery.isLoading}
		hasSessionLoadError={Boolean(productSessionsQuery.error)}
		{productSessions}
		{selectedSessionId}
		{deletingSessionIds}
		onStartNewSession={startNewSession}
		onSelectSession={selectProductSession}
		onOpenSessionContextMenu={openSessionContextMenu}
		onSignIn={() => void signIn()}
		onSignOut={() => void signOut()}
	/>

	<VoiceAssistantPanel
		{errorMessage}
		{realtimeStatusMessage}
		isAuthenticated={$authState.isAuthenticated}
		{voiceInputSupported}
		{isRealtimeConnecting}
		{isRealtimeConnected}
		{isAssistantSpeaking}
		{isMicMuted}
		{micButtonLabel}
		{micButtonHelpText}
		onToggleRealtimeConversation={toggleRealtimeConversation}
	/>
</div>

<SessionContextMenu
	{contextMenu}
	onClose={closeSessionContextMenu}
	onDeleteSession={(sessionId) => void deleteProductSession(sessionId)}
/>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') closeSessionContextMenu();
	}}
/>

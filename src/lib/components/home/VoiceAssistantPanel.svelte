<script lang="ts">
	type Props = {
		errorMessage: string | null;
		isAssistantSpeaking: boolean;
		isAuthenticated: boolean;
		isMicMuted: boolean;
		isRealtimeConnected: boolean;
		isRealtimeConnecting: boolean;
		micButtonHelpText: string;
		micButtonLabel: string;
		onToggleRealtimeConversation: () => void;
		realtimeStatusMessage: string | null;
		voiceInputSupported: boolean;
	};

	let {
		errorMessage,
		isAssistantSpeaking,
		isAuthenticated,
		isMicMuted,
		isRealtimeConnected,
		isRealtimeConnecting,
		micButtonHelpText,
		micButtonLabel,
		onToggleRealtimeConversation,
		realtimeStatusMessage,
		voiceInputSupported
	}: Props = $props();
</script>

<main class="flex flex-1 flex-col overflow-y-auto">
	<div class="flex flex-1 flex-col items-center justify-center px-6 py-10">
		<div class="w-full max-w-xl text-center">
			<h1 class="text-4xl font-semibold tracking-tight">Live speech-to-speech assistant</h1>

			{#if errorMessage}
				<p
					class="mx-auto mt-6 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
				>
					{errorMessage}
				</p>
			{/if}

			{#if realtimeStatusMessage}
				<p
					class="mx-auto mt-3 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
				>
					{realtimeStatusMessage}
				</p>
			{/if}

			<div class="mt-12 flex flex-col items-center gap-5">
				<button
					type="button"
					onclick={onToggleRealtimeConversation}
					disabled={!isAuthenticated || !voiceInputSupported || isRealtimeConnecting}
					class={`flex h-32 w-32 items-center justify-center rounded-full shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 md:h-36 md:w-36 ${
						isMicMuted
							? 'bg-white text-red-600 ring-4 ring-red-500/15 hover:ring-red-500/25'
							: isRealtimeConnected || isRealtimeConnecting
								? 'bg-[#0d3b3b] text-white ring-4 ring-[#0d3b3b]/15'
								: 'bg-white text-[#0d3b3b] ring-1 ring-slate-200 hover:ring-4 hover:ring-[#0d3b3b]/10'
					} ${isAssistantSpeaking ? 'animate-pulse' : ''}`}
					aria-label={micButtonLabel}
					aria-pressed={isMicMuted}
				>
					<svg
						viewBox="0 0 24 24"
						class="h-12 w-12"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 16a4 4 0 0 0 4-4V8a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm0 0v4m-5-4a5 5 0 0 0 10 0"
						/>
						{#if isMicMuted}
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 4l16 16" />
						{/if}
					</svg>
				</button>

				<div>
					<p class="text-base font-medium text-slate-950">{micButtonLabel}</p>
					<p class="mt-1 text-sm text-slate-500">{micButtonHelpText}</p>
				</div>
			</div>
		</div>
	</div>
</main>

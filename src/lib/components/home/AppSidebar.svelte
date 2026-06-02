<script lang="ts">
	import embLogo from '$lib/assets/emb-logo.svg';

	import type { Id } from '../../../../convex/_generated/dataModel.js';
	import type { ProductSession } from './types.js';

	type Props = {
		deletingSessionIds: Id<'productSessions'>[];
		hasSessionLoadError: boolean;
		isAuthenticated: boolean;
		isLoadingSessions: boolean;
		onOpenSessionContextMenu: (event: MouseEvent, sessionId: Id<'productSessions'>) => void;
		onSelectSession: (sessionId: Id<'productSessions'>) => void;
		onSignIn: () => void;
		onSignOut: () => void;
		onStartNewSession: () => void;
		productSessions: ProductSession[];
		selectedSessionId: Id<'productSessions'> | null;
	};

	let {
		deletingSessionIds,
		hasSessionLoadError,
		isAuthenticated,
		isLoadingSessions,
		onOpenSessionContextMenu,
		onSelectSession,
		onSignIn,
		onSignOut,
		onStartNewSession,
		productSessions,
		selectedSessionId
	}: Props = $props();
</script>

<aside class="flex w-72 shrink-0 flex-col bg-[#0d3b3b] text-white">
	<div class="flex items-center gap-3 px-6 py-6">
		<div class="rounded-xl bg-white/10 p-2 ring-1 ring-white/15">
			<img src={embLogo} alt="EMB Global" class="h-9 w-auto object-contain" loading="eager" />
		</div>
		<div>
			<p class="text-base font-semibold tracking-tight">Comms Bridge</p>
			<p class="text-xs text-white/60">Live voice assistant</p>
		</div>
	</div>

	<nav class="mt-2 flex-1 overflow-y-auto px-6 py-2">
		{#if isAuthenticated}
			<button
				type="button"
				onclick={onStartNewSession}
				aria-pressed={selectedSessionId === null}
				class={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
					selectedSessionId === null
						? 'bg-white text-[#0d3b3b]'
						: 'bg-white/10 text-white hover:bg-white/20'
				}`}
			>
				<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14m-7-7h14" />
				</svg>
				New session
			</button>
		{/if}

		<p class="mt-5 text-[11px] font-medium tracking-wide text-white/50 uppercase">Sessions</p>

		{#if !isAuthenticated}
			<p class="mt-3 text-sm text-white/55">Sign in to load your sessions.</p>
		{:else if isLoadingSessions}
			<p class="mt-3 text-sm text-white/55">Loading sessions...</p>
		{:else if hasSessionLoadError}
			<p class="mt-3 text-sm text-red-100">Unable to load sessions.</p>
		{:else if productSessions.length === 0}
			<p class="mt-3 text-sm text-white/55">No product sessions found.</p>
		{:else}
			<div class="mt-3 flex flex-col gap-2">
				{#each productSessions as session (session.id)}
					<button
						type="button"
						onclick={() => onSelectSession(session.id)}
						oncontextmenu={(event) => onOpenSessionContextMenu(event, session.id)}
						aria-pressed={selectedSessionId === session.id}
						class={`rounded-lg px-3 py-2.5 text-left transition ${
							selectedSessionId === session.id
								? 'bg-white text-[#0d3b3b]'
								: 'bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10'
						} ${deletingSessionIds.includes(session.id) ? 'pointer-events-none opacity-50' : ''}`}
					>
						<span class="block text-sm font-medium">{session.productName}</span>
						<span
							class={`mt-0.5 block text-xs ${
								selectedSessionId === session.id ? 'text-[#0d3b3b]/70' : 'text-white/50'
							}`}
						>
							{session.productDescription || 'No description yet.'}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</nav>

	<div class="border-t border-white/10 px-6 py-5">
		{#if isAuthenticated}
			<button
				type="button"
				onclick={onSignOut}
				class="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-medium transition hover:bg-white/20"
			>
				Sign out
			</button>
		{:else}
			<button
				type="button"
				onclick={onSignIn}
				class="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#0d3b3b] transition hover:bg-white/90"
			>
				Sign in
			</button>
		{/if}
	</div>
</aside>

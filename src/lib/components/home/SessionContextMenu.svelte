<script lang="ts">
	import type { SessionContextMenu } from './types.js';

	type Props = {
		contextMenu: SessionContextMenu | null;
		onClose: () => void;
		onDeleteSession: (sessionId: SessionContextMenu['sessionId']) => void;
	};

	let { contextMenu, onClose, onDeleteSession }: Props = $props();
</script>

{#if contextMenu}
	<button
		type="button"
		class="fixed inset-0 z-40 cursor-default"
		aria-label="Close menu"
		onclick={onClose}
		oncontextmenu={(event) => {
			event.preventDefault();
			onClose();
		}}
	></button>
	<div
		class="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
		style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
	>
		<button
			type="button"
			onclick={() => onDeleteSession(contextMenu.sessionId)}
			class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
		>
			<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"
				/>
			</svg>
			Delete session
		</button>
	</div>
{/if}

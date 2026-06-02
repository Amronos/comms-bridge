<script lang="ts">
	import './layout.css';
	import { browser } from '$app/environment';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import { setupConvex, useConvexClient } from 'convex-svelte';
	import favicon from '$lib/assets/emb-icon.svg';

	import { getAccessTokenOrNull, initAuth } from '$lib/auth';

	let { children }: { children: import('svelte').Snippet } = $props();

	setupConvex(PUBLIC_CONVEX_URL);

	const convex = useConvexClient();

	onMount(() => {
		if (!browser) {
			return;
		}

		convex.setAuth(async (args) => getAccessTokenOrNull(args.forceRefreshToken));
		void initAuth();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="shortcut icon" href={favicon} />
</svelte:head>
{@render children()}

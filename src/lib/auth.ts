import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { writable } from 'svelte/store';

import { createClient, type User, LoginRequiredError } from '@workos-inc/authkit-js';

export type AuthState = {
	isLoading: boolean;
	isAuthenticated: boolean;
	user: User | null;
};

const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined;

const defaultState: AuthState = {
	isLoading: browser,
	isAuthenticated: false,
	user: null
};

export const authState = writable<AuthState>(defaultState);

let authClientPromise: Promise<Awaited<ReturnType<typeof createClient>>> | null = null;

function updateAuthStateFromUser(user: User | null) {
	authState.set({
		isLoading: false,
		isAuthenticated: Boolean(user),
		user
	});
}

export async function initAuth() {
	if (!browser) {
		return null;
	}

	if (!clientId) {
		authState.set({
			isLoading: false,
			isAuthenticated: false,
			user: null
		});
		return null;
	}

	if (!authClientPromise) {
		authClientPromise = createClient(clientId, {
			redirectUri: new URL('/callback', window.location.origin).toString(),
			onRedirectCallback: async () => {
				const client = await authClientPromise;
				updateAuthStateFromUser(client?.getUser() ?? null);
				await goto(resolve('/'));
			},
			onRefresh: (response) => {
				updateAuthStateFromUser(response.user);
			},
			onRefreshFailure: () => {
				updateAuthStateFromUser(null);
			}
		}).then((client) => {
			updateAuthStateFromUser(client.getUser());
			return client;
		});
	}

	try {
		return await authClientPromise;
	} catch (error) {
		updateAuthStateFromUser(null);
		throw error;
	}
}

export async function signIn() {
	const client = await initAuth();
	await client?.signIn();
}

export async function signOut() {
	const client = await initAuth();
	if (!client) {
		return;
	}

	updateAuthStateFromUser(null);
	client.signOut({ returnTo: window.location.origin });
}

export async function getAccessTokenOrNull(forceRefresh = false) {
	const client = await initAuth();
	if (!client) {
		return null;
	}

	try {
		const token = await client.getAccessToken({ forceRefresh });
		updateAuthStateFromUser(client.getUser());
		return token;
	} catch (error) {
		if (error instanceof LoginRequiredError) {
			updateAuthStateFromUser(null);
			return null;
		}

		throw error;
	}
}

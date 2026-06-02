import { existsSync } from 'node:fs';

import { defineConfig } from '@playwright/test';

const systemChromeExecutable = [
	'/run/current-system/sw/bin/google-chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser'
].find((candidate) => existsSync(candidate));

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}',
	use: systemChromeExecutable
		? {
				browserName: 'chromium',
				launchOptions: {
					args: ['--no-sandbox'],
					executablePath: systemChromeExecutable
				}
			}
		: {
				browserName: 'chromium',
				launchOptions: {
					args: ['--no-sandbox']
				}
			}
});

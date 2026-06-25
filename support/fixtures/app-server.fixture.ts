import { test as base } from 'playwright-bdd';
import { env } from '@config';

export type AppServerFixture = {
  baseURL: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart?: () => Promise<void>;
};

export const appServerFixture = base.extend<{ appServer: AppServerFixture }>({
  appServer: async ({}, use) => {
    await use({
      // Use envalid config so the default base URL matches the rest of the framework
      baseURL: env.E2E_BASE_URL,
      start: async () => {},
      stop: async () => {},
    });
  },
});

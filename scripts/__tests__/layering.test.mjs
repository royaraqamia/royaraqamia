import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
import babelParser from '@babel/eslint-parser';
import layering from '../../eslint-rules/layering.mjs';

const linter = new Linter();

const config = [
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { presets: ['@babel/preset-typescript'] },
      },
    },
    plugins: { layers: layering },
    rules: { 'layers/no-cross-layer-import': 'error' },
  },
];

function violations(code, filename) {
  return linter.verify(code, config, { filename });
}

const controller = 'backend/controllers/push.ts';

describe('layers/no-cross-layer-import', () => {
  it('fails a controller that value-imports a repository by alias', () => {
    const messages = violations(
      "import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';",
      controller
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe('layers/no-cross-layer-import');
  });

  it('fails a controller that value-imports a repository by relative path', () => {
    const messages = violations(
      "import { createPushSubscriptionsRepository } from '../repositories/push/supabase-repository';",
      controller
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe('layers/no-cross-layer-import');
  });

  it('fails a relative walk that names the backend root explicitly', () => {
    const messages = violations(
      "import { createDevicePushTokensRepository } from '../../backend/clients/push/fcm';",
      controller
    );

    expect(messages).toHaveLength(1);
  });

  it('fails a controller that re-exports a client', () => {
    const messages = violations(
      "export { createDevicePushTokensRepository } from '@/backend/repositories/push/supabase-device-tokens-repository';",
      controller
    );

    expect(messages).toHaveLength(1);
  });

  it('still allows a type-only import in a controller', () => {
    const messages = violations(
      "import type { PushSubscriptionRepository } from '@/backend/repositories/push/push-subscriptions-repository';",
      controller
    );

    expect(messages).toHaveLength(0);
  });

  it('applies the same boundary to a service using a relative repository import', () => {
    const messages = violations(
      "import { createSupabaseNotificationRepository } from '../../repositories/notifications/supabase-repository';",
      'backend/services/push/webhook-service.ts'
    );

    expect(messages).toHaveLength(1);
  });

  it('does not mistake a frontend folder named services for the data layer', () => {
    const messages = violations(
      "import { ServiceCard } from './services/ServiceCard';",
      'frontend/ui/Services.tsx'
    );

    expect(messages).toHaveLength(0);
  });

  it('keeps the other boundaries enforced', () => {
    const messages = violations(
      "import { profile } from '@/frontend/profile';",
      'backend/controllers/push.ts'
    );

    expect(messages).toHaveLength(1);
  });
});

import { request } from '@/frontend/transport/http';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

/**
 * Replays SpendTrack Outbox intents against the existing endpoints. `id` is the
 * client-minted row id (adopted as the server primary key for expenses,
 * categories and recurring), so a replayed write is an idempotent upsert.
 */
export function createSpendtrackHttpSyncTransport(): SyncTransport {
  return {
    async send(entry) {
      switch (entry.type) {
        case 'expense.create':
          await request('/spendtrack/api/expenses', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'expense.update': {
          const { id } = entry.payload as { id: string };
          await request(`/spendtrack/api/expenses/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(entry.payload),
          });
          return;
        }
        case 'expense.delete': {
          const { id, updatedAt } = entry.payload as { id: string; updatedAt?: string };
          await request(`/spendtrack/api/expenses/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        case 'category.create':
          await request('/spendtrack/api/categories', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'category.update': {
          const { id } = entry.payload as { id: string };
          await request(`/spendtrack/api/categories/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(entry.payload),
          });
          return;
        }
        case 'category.delete': {
          const { id, updatedAt } = entry.payload as { id: string; updatedAt?: string };
          await request(`/spendtrack/api/categories/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        case 'budget.set':
          await request('/spendtrack/api/budget', {
            method: 'PUT',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'budget.delete': {
          const { month, categoryId, updatedAt } = entry.payload as {
            month: string;
            categoryId: string | null;
            updatedAt?: string;
          };
          const params = new URLSearchParams({ month });
          if (categoryId) params.set('categoryId', categoryId);
          await request(`/spendtrack/api/budget?${params.toString()}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        case 'recurring.create':
          await request('/spendtrack/api/recurring', {
            method: 'POST',
            body: JSON.stringify(entry.payload),
          });
          return;
        case 'recurring.update': {
          const { id } = entry.payload as { id: string };
          await request(`/spendtrack/api/recurring/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(entry.payload),
          });
          return;
        }
        case 'recurring.delete': {
          const { id, updatedAt } = entry.payload as { id: string; updatedAt?: string };
          await request(`/spendtrack/api/recurring/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        default:
          throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);
      }
    },
  };
}

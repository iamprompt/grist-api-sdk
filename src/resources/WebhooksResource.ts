import { HttpTransport } from '../transport/HttpTransport';
import {
  CreateWebhookPayload,
  UpdateWebhookPayload,
  WebhookSummary,
} from '../types/rest';

/**
 * Resource client for Grist Document Webhooks.
 *
 * Provides methods for listing, creating, modifying, and deleting outgoing webhooks.
 */
export class WebhooksResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Lists all webhooks registered in a document.
   *
   * @param docId - The unique document ID.
   * @returns An array of webhook summaries.
   */
  async list(docId: string): Promise<WebhookSummary[]> {
    const encodedDocId = encodeURIComponent(docId);
    const res = await this.transport.request<
      { webhooks?: WebhookSummary[] } | WebhookSummary[]
    >(`/docs/${encodedDocId}/webhooks`);

    if (Array.isArray(res)) {
      return res;
    }
    if (res && typeof res === 'object' && Array.isArray(res.webhooks)) {
      return res.webhooks;
    }
    return [];
  }

  /**
   * Registers a new outgoing webhook in a document.
   *
   * @param docId - The unique document ID.
   * @param payload - Webhook settings such as target URL, event types, and table ID.
   * @returns An object containing the generated webhook ID (`{ id: string }`).
   */
  async create(
    docId: string,
    payload: CreateWebhookPayload
  ): Promise<{ id: string }> {
    const encodedDocId = encodeURIComponent(docId);
    const res = await this.transport.request<
      | { id?: string | number; webhooks?: { id: string | number }[] }
      | { id: string | number }[]
      | string
      | number
    >(`/docs/${encodedDocId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (typeof res === 'string' || typeof res === 'number') {
      return { id: String(res) };
    }
    if (Array.isArray(res)) {
      if (res.length > 0 && res[0] && 'id' in res[0]) {
        return { id: String(res[0].id) };
      }
      return { id: '' };
    }
    if (res && typeof res === 'object') {
      if ('id' in res && res.id !== undefined && res.id !== null) {
        return { id: String(res.id) };
      }
      if (
        'webhooks' in res &&
        Array.isArray(res.webhooks) &&
        res.webhooks.length > 0 &&
        res.webhooks[0]?.id !== undefined &&
        res.webhooks[0]?.id !== null
      ) {
        return { id: String(res.webhooks[0].id) };
      }
    }
    return { id: String(res) };
  }

  /**
   * Modifies an existing webhook's configuration or enabled status.
   *
   * @param docId - The unique document ID.
   * @param webhookId - The unique identifier of the webhook to update.
   * @param payload - Updated configuration fields (e.g. `{ enabled: false }`).
   */
  async update(
    docId: string,
    webhookId: string,
    payload: UpdateWebhookPayload
  ): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedWebhookId = encodeURIComponent(webhookId);
    await this.transport.request<void>(
      `/docs/${encodedDocId}/webhooks/${encodedWebhookId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Deletes a webhook from a document.
   *
   * @param docId - The unique document ID.
   * @param webhookId - The unique identifier of the webhook to remove.
   */
  async delete(docId: string, webhookId: string): Promise<void> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedWebhookId = encodeURIComponent(webhookId);
    await this.transport.request<void>(
      `/docs/${encodedDocId}/webhooks/${encodedWebhookId}`,
      {
        method: 'DELETE',
      }
    );
  }
}

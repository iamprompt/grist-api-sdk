import { HttpTransport } from '../transport/HttpTransport';
import { AttachmentMetadata, UploadFileInput } from '../types/rest';

/**
 * Resource client for Grist Document Attachments.
 *
 * Provides methods for uploading, downloading, and inspecting attachment metadata.
 */
export class AttachmentsResource {
  constructor(private readonly transport: HttpTransport) {}

  /**
   * Uploads one or more files to a document.
   *
   * @param docId - The unique document ID.
   * @param file - Single file object or array of file objects to upload.
   * @returns Array of newly created attachment integer IDs.
   */
  async upload(
    docId: string,
    file: UploadFileInput | UploadFileInput[]
  ): Promise<number[]> {
    const encodedDocId = encodeURIComponent(docId);
    const files = Array.isArray(file) ? file : [file];
    const form = new FormData();

    for (const f of files) {
      let blob: Blob;
      if (typeof Blob !== 'undefined' && f.data instanceof Blob) {
        blob = f.contentType ? new Blob([f.data], { type: f.contentType }) : f.data;
      } else {
        blob = new Blob([f.data as unknown as BlobPart], f.contentType ? { type: f.contentType } : undefined);
      }
      form.append('upload', blob, f.filename);
    }

    const res = await this.transport.request<
      number[] | { attachments?: number[]; ids?: number[] } | number
    >(`/docs/${encodedDocId}/attachments`, {
      method: 'POST',
      body: form,
    });

    if (Array.isArray(res)) {
      return res.map(Number);
    }
    if (res && typeof res === 'object') {
      if (Array.isArray(res.attachments)) {
        return res.attachments.map(Number);
      }
      if (Array.isArray(res.ids)) {
        return res.ids.map(Number);
      }
    }
    if (typeof res === 'number') {
      return [res];
    }
    return [];
  }

  /**
   * Downloads the raw binary data of an attachment.
   *
   * @param docId - The unique document ID.
   * @param attachmentId - The unique integer attachment ID.
   * @returns The raw attachment contents as an ArrayBuffer.
   */
  async download(docId: string, attachmentId: number): Promise<ArrayBuffer> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedAttachmentId = encodeURIComponent(String(attachmentId));
    const response = await this.transport.requestRaw(
      `/docs/${encodedDocId}/attachments/${encodedAttachmentId}/download`
    );
    return await response.arrayBuffer();
  }

  /**
   * Retrieves metadata for a specific attachment.
   *
   * @param docId - The unique document ID.
   * @param attachmentId - The unique integer attachment ID.
   * @returns Metadata including fileName, fileSize, timeUploaded, etc.
   */
  async getMetadata(
    docId: string,
    attachmentId: number
  ): Promise<AttachmentMetadata> {
    const encodedDocId = encodeURIComponent(docId);
    const encodedAttachmentId = encodeURIComponent(String(attachmentId));
    return await this.transport.request<AttachmentMetadata>(
      `/docs/${encodedDocId}/attachments/${encodedAttachmentId}`
    );
  }
}

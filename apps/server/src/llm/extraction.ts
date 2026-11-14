import { randomUUID } from 'node:crypto';
import {
  extractionEnvelopeSchema,
  type Extraction,
  type ExtractionEnvelope,
} from '@ledgerbox/contracts';
import { AppError } from '../errors.js';
import type { SourceService } from '../sources/service.js';
import type { VaultRepository } from '../vault/store.js';
import { DeepSeekClient, parseJsonLoose, type ChatMessage } from './deepseek.js';
import {
  buildExtractionUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from './prompts.js';

const CONTACT_REQUIRED_TYPES = new Set([
  'lend',
  'borrow',
  'repayment_received',
  'repayment_paid',
]);

export class ExtractionService {
  constructor(
    private readonly vault: VaultRepository,
    private readonly sources: SourceService,
    private readonly client: DeepSeekClient,
  ) {}

  async run(sourceId: string, ledgerId: string): Promise<Extraction> {
    const source = this.sources.require(sourceId);
    if (source.ledgerId !== ledgerId) {
      throw new AppError('FORBIDDEN', '来源不属于该账本');
    }
    const { buffer, mimeType } = await this.sources.image(sourceId);
    const base64 = buffer.toString('base64');

    const messages: ChatMessage[] = [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildExtractionUserPrompt(source.note) },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ];

    let raw: string;
    try {
      raw = await this.client.chat(messages, { jsonMode: true, maxTokens: 2048 });
    } catch (error) {
      await this.persistFailure(sourceId, ledgerId, error);
      throw error;
    }

    const parsed = parseJsonLoose<Partial<ExtractionEnvelope>>(raw);
    if (!parsed || !parsed.candidate) {
      await this.persistFailure(
        sourceId,
        ledgerId,
        new AppError('MODEL_RESPONSE_INVALID', '模型返回的结构无法解析'),
      );
      throw new AppError('MODEL_RESPONSE_INVALID', '模型返回的结构无法解析');
    }

    const candidate = {
      type: parsed.candidate.type,
      amount: parsed.candidate.amount,
      currency: parsed.candidate.currency ?? 'CNY',
      occurredOn: parsed.candidate.occurredOn ?? null,
      contactName: parsed.candidate.contactName ?? null,
      accountHint: parsed.candidate.accountHint ?? null,
      paymentMethod: parsed.candidate.paymentMethod ?? null,
      merchant: parsed.candidate.merchant ?? null,
      category: parsed.candidate.category ?? null,
      remark: parsed.candidate.remark ?? null,
    };

    const envelope = extractionEnvelopeSchema.safeParse({
      schemaVersion: 1,
      ledgerId,
      sourceId,
      candidate,
      requiresReview: parsed.requiresReview ?? [],
      evidence: parsed.evidence ?? [],
    });
    if (!envelope.success) {
      await this.persistFailure(
        sourceId,
        ledgerId,
        new AppError('MODEL_RESPONSE_INVALID', '模型返回的字段不合法'),
      );
      throw new AppError('MODEL_RESPONSE_INVALID', '模型返回的字段不合法');
    }

    const requiresReview = [...new Set(envelope.data.requiresReview)];
    if (!candidate.occurredOn) requiresReview.push('occurredOn');
    requiresReview.push('accountId');
    if (CONTACT_REQUIRED_TYPES.has(candidate.type) && !candidate.contactName) {
      requiresReview.push('contactId');
    }

    const extraction: Extraction = {
      id: randomUUID(),
      sourceId,
      ledgerId,
      model: this.client.model,
      promptVersion: PROMPT_VERSION,
      candidate: envelope.data.candidate,
      evidence: envelope.data.evidence,
      requiresReview: [...new Set(requiresReview)],
      state: 'validated',
      createdAt: new Date().toISOString(),
    };

    await this.vault.commit(null, (draft) => {
      draft.extractions.push(extraction);
      draft.auditEvents.push({
        id: randomUUID(),
        ledgerId,
        action: 'extraction.create',
        targetId: extraction.id,
        revision: draft.revision,
        createdAt: extraction.createdAt,
      });
    });
    return extraction;
  }

  private async persistFailure(
    sourceId: string,
    ledgerId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : '识别失败';
    const extraction: Extraction = {
      id: randomUUID(),
      sourceId,
      ledgerId,
      model: this.client.model,
      promptVersion: PROMPT_VERSION,
      candidate: null,
      evidence: [],
      requiresReview: [],
      state: 'failed',
      createdAt: new Date().toISOString(),
    };
    await this.vault.commit(null, (draft) => {
      draft.extractions.push(extraction);
      draft.auditEvents.push({
        id: randomUUID(),
        ledgerId,
        action: `extraction.failed:${message.slice(0, 60)}`,
        targetId: extraction.id,
        revision: draft.revision,
        createdAt: extraction.createdAt,
      });
    });
  }

  list(ledgerId: string): Extraction[] {
    return this.vault.manifest.extractions.filter((e) => e.ledgerId === ledgerId);
  }

  get(id: string): Extraction {
    const extraction = this.vault.manifest.extractions.find((e) => e.id === id);
    if (!extraction) throw new AppError('NOT_FOUND', '识别任务不存在');
    return extraction;
  }
}

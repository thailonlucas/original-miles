import { getVoucherTypeBySlug } from '../../services/travel-db';
import { classifyVoucherTypeFromText } from '../voucher-type/voucher-type-agent';
import { extractStructuredVoucherData } from './extraction-agent';
import { extractRawTextFromDocument } from './text-extraction-agent';

const FALLBACK_VOUCHER_TYPE_SLUG = 'other';

export interface VoucherExtractionResult {
  rawContent: string;
  voucherTypeSlug: string;
  voucherTypeConfidence: number;
  // Objeto extraído inteiro (inclui `document_name`/`content`/`confidence` no nível raiz, em todo
  // voucher_type visto até agora — ver `routes/voucher-routes.ts` pra como isso vira
  // `voucher.title`/`voucher.content`).
  extractedData: Record<string, unknown>;
}

// Pipeline completo de extração de um voucher (documento -> texto -> tipo -> dados
// estruturados), sem gravar nada no Supabase — quem chama decide o que fazer com o resultado
// (ver `routes/voucher-routes.ts`, que persiste na tabela `voucher`).
export async function extractVoucher(fileBytes: Uint8Array, mediaType: string, tenantId: string): Promise<VoucherExtractionResult> {
  const rawContent = await extractRawTextFromDocument(fileBytes, mediaType);
  return extractVoucherFromText(rawContent, tenantId);
}

// Mesmo pipeline, mas pulando o passo de OCR — usado quando quem chama já manda o texto extraído
// (`text` no lugar de `file`, ver `routes/voucher-routes.ts`), por exemplo quando a extração já
// veio pronta de outro lugar.
export async function extractVoucherFromText(rawContent: string, tenantId: string): Promise<VoucherExtractionResult> {
  const classification = await classifyVoucherTypeFromText(rawContent, tenantId);

  let voucherType = await getVoucherTypeBySlug(tenantId, classification.voucher_type_slug);
  let voucherTypeSlug = classification.voucher_type_slug;
  if (!voucherType) {
    // O classificador só recebeu os slugs ativos do tenant, então isso não deveria acontecer —
    // mas se acontecer (tipo desativado entre a classificação e aqui, resposta fora do enum
    // esperado etc.), cai no fallback "other" em vez de derrubar a extração inteira.
    voucherType = await getVoucherTypeBySlug(tenantId, FALLBACK_VOUCHER_TYPE_SLUG);
    voucherTypeSlug = FALLBACK_VOUCHER_TYPE_SLUG;
  }
  if (!voucherType) {
    throw new Error(`Nenhum voucher_type "${classification.voucher_type_slug}" nem fallback "other" encontrado para o tenant ${tenantId}.`);
  }

  const extractedData = await extractStructuredVoucherData(rawContent, voucherType);

  return {
    rawContent,
    voucherTypeSlug,
    voucherTypeConfidence: classification.confidence,
    extractedData,
  };
}

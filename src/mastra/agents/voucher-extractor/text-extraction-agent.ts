import { Agent } from '@mastra/core/agent';
import type { FilePart, ImagePart } from 'ai';
import { buildTextExtractionPrompt } from './prompts/text-extraction-prompt';

// Primeira etapa do pipeline de extração de vouchers ("Extração em texto" no fluxo antigo de
// n8n): transcreve o documento (bytes crus, ainda sem estar hospedado em nenhuma URL — o arquivo
// chega via multipart no upload, ver `routes/voucher-routes.ts`) em texto (`raw_content`). Esse
// texto alimenta tanto a classificação de tipo (`agents/voucher-type/`) quanto a extração
// estruturada (`extraction-agent.ts`) — o documento em si só é "visto" pelo model aqui, uma única vez.
export const textExtractionAgent = new Agent({
  id: 'voucher-text-extraction',
  name: 'Voucher Text Extraction',
  description: 'Transcreve o conteúdo de um documento de voucher (imagem/PDF) em texto, para classificação e extração estruturada.',
  instructions: buildTextExtractionPrompt(),
  model: 'openai/gpt-4.1-mini',
});

function buildMediaPart(fileBytes: Uint8Array, mediaType: string): ImagePart | FilePart {
  if (mediaType.startsWith('image/')) {
    return { type: 'image', image: fileBytes, mediaType };
  }
  return { type: 'file', data: fileBytes, mediaType };
}

export async function extractRawTextFromDocument(fileBytes: Uint8Array, mediaType: string): Promise<string> {
  const { text } = await textExtractionAgent.generate([
    {
      role: 'user',
      content: [buildMediaPart(fileBytes, mediaType), { type: 'text', text: 'Transcreva o conteúdo deste documento.' }],
    },
  ]);

  return text;
}

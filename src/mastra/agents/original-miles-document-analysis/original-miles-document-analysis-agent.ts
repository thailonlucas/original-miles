import { createMediaAnalysisAgent } from '../shared/media-analysis-agent';
import { buildDocumentAnalysisPrompt } from './prompts/system-prompt';

const { agent: documentAnalysisAgent, analyze: analyzeDocument } = createMediaAnalysisAgent({
  id: 'original-miles-document-analysis',
  name: 'OriginalMiles Document Analysis',
  description: 'Descreve documentos/arquivos enviados pelo cliente para servir de input pra OriginalMiles.',
  instructions: buildDocumentAnalysisPrompt(),
  model: [{ model: 'openai/gpt-4.1-mini', maxRetries: 1, modelSettings: { timeout: { stepMs: 30_000 } } }],
  buildMediaPart: (mediaUrl, mediaType) => ({ type: 'file', data: mediaUrl, mediaType: mediaType ?? 'application/pdf' }),
});

export { documentAnalysisAgent, analyzeDocument };

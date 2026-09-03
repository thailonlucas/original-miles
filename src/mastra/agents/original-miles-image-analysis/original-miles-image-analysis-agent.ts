import { createMediaAnalysisAgent } from '../shared/media-analysis-agent';
import { buildSystemPrompt } from './prompts/system-prompt';

const { agent: imageAnalysisAgent, analyze: analyzeImage } = createMediaAnalysisAgent({
  id: 'original-miles-image-analysis',
  name: 'OriginalMiles Image Analysis',
  description: 'Descreve imagens enviadas pelo cliente para servir de input pra OriginalMiles.',
  instructions: buildSystemPrompt(),
  model: [{ model: 'openai/gpt-4.1-mini', maxRetries: 1, modelSettings: { timeout: { stepMs: 30_000 } } }],
  buildMediaPart: (mediaUrl, mediaType) => ({ type: 'image', image: mediaUrl, mediaType: mediaType ?? 'image/jpeg' }),
});

export { imageAnalysisAgent, analyzeImage };

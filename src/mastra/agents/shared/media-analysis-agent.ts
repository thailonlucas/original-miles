import { Agent } from '@mastra/core/agent';
import type { FilePart, ImagePart } from 'ai';

interface MediaAnalysisAgentConfig {
  id: string;
  name: string;
  description: string;
  model: ConstructorParameters<typeof Agent>[0]['model'];
  instructions: string;
  /** Builds the multimodal content part for the media being analyzed (image vs file, mime type, etc). */
  buildMediaPart: (mediaUrl: URL, mediaType: string | undefined) => ImagePart | FilePart;
}

/**
 * Shared shape behind OriginalMiles's media-analysis agents (image, document): a single-purpose
 * agent with no tools/schema whose only job is turning one piece of media + the user's
 * message into a text description that OriginalMiles can process as if it were the original message.
 */
export function createMediaAnalysisAgent(config: MediaAnalysisAgentConfig) {
  const agent = new Agent({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    model: config.model,
  });

  async function analyze(mediaUrl: string, mediaType: string | undefined, userMessage: string): Promise<string> {
    const { text } = await agent.generate([
      {
        role: 'user',
        content: [config.buildMediaPart(new URL(mediaUrl), mediaType), { type: 'text', text: `Mensagem do usuário: ${userMessage || 'nada'}` }],
      },
    ]);

    return text;
  }

  return { agent, analyze };
}

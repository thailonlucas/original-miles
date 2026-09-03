import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getHiveOps } from '../../../hiveops';

export const buscarHabilidadeTool = createTool({
  id: 'buscar_habilidade',
  description: `Utilize essa ferramenta para buscar a habilidade e obter um passo a passo de como você deve conduzir o atendimento.

Você sempre deve consultar a F.A.Q após utilizar uma Habilidade. Uma sempre complementa a outra`,
  inputSchema: z.object({
    slug: z.string().describe('Slug da habilidade, retornado na lista de habilidades disponíveis.'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    message: z.string().optional(),
    name: z.string().optional(),
    intent: z.string().optional(),
    slots: z.unknown().optional(),
    rules: z.unknown().optional(),
    fallback: z.unknown().optional(),
    notes: z.string().nullable().optional(),
  }),
  execute: async ({ slug }) => {
    const skill = await getHiveOps().getSkillBySlug(slug);
    if (!skill) {
      return { found: false, message: 'Skill indisponível, siga o que diz na base de conhecimento.' };
    }
    return { found: true, ...skill };
  },
});

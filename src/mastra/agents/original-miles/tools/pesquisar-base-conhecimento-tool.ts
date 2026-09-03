import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchKnowledgeOnVectorDB } from '../../../knowledge/knowledge-search';

export const pesquisarBaseConhecimentoTool = createTool({
  id: 'pesquisar_base_conhecimento',
  description: `Use obrigatoriamente esta ferramenta para buscar informações antes de responder qualquer pergunta. Você pode e deve chamá-la múltiplas vezes se a dúvida do usuário envolver mais de um contexto.

Exemplos de quando usar múltiplas bases:
- Usuário pergunta sobre segurança na compra → consulte "comprador" + "fraudes-e-golpes"
- Usuário quer comprar E vender → consulte "comprador" + "vendedor"

Passe como query a dúvida central do usuário reformulada de forma objetiva.
Pesquise em mais de uma base para ter uma resposta bem fundamentada.
Consulte esta base obrigatoriamente antes de responder. Se nenhuma base retornar informação suficiente, informe que não tem essa informação disponível e que irá encaminhar para um especialista.`,
  inputSchema: z.object({
    query: z.string().describe('A dúvida central do usuário, reformulada de forma objetiva.'),
    knowledge_base_slug: z.string().describe('Slug da base de conhecimento a consultar.'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        score: z.number(),
        title: z.string(),
        text: z.string(),
      }),
    ),
  }),
  execute: async ({ query, knowledge_base_slug }) => {
    const results = await searchKnowledgeOnVectorDB(query, knowledge_base_slug);
    return { results };
  },
});

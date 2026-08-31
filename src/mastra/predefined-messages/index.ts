// Textos fixos usados em mais de um lugar, organizados por categoria — em vez de constantes
// soltas espalhadas pelos arquivos que as usam.
export const PREDEFINED_MESSAGES = {
  business: {
    high_volume:
      'Atenção: devido ao alto volume de solicitações neste momento, nosso tempo de resposta pode ser maior do que o normal. Contamos com sua compreensão e não se preocupe: garantimos que vamos responder você assim que possível.',
    outside_hours:
      'Como sua solicitação precisa do suporte do nosso time, peço que aguarde o início do horário de atendimento. Estaremos de volta a partir das 10h para dar continuidade ao seu caso, combinado?',
  },
  media: {
    video_unsupported: '[Usuário enviou um vídeo, confirme o recebimento]',
    sticker_unsupported: '[Cliente enviou uma figurinha ou emoji]',
    file_placeholder: 'usuário enviou um arquivo',
    processing_failed: '[Cliente enviou uma mídia que não conseguimos processar, confirme o recebimento]',
  },
  error: {
    technical_issue: 'Estou transferindo o seu chamado para um especialista.',
  },
} as const;

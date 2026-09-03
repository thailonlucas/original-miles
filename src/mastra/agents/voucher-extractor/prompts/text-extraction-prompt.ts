export function buildTextExtractionPrompt(): string {
  return `Você transcreve o conteúdo de um documento de viagem (voucher, comprovante, e-ticket, reserva) enviado como imagem ou PDF.

Extraia o MÁXIMO de texto possível do documento, com fidelidade total ao que está escrito — não resuma, não interprete, não omita nada.

Inclua, na ordem em que aparecem no documento:
1. Todos os textos, rótulos e valores visíveis (cabeçalhos, tabelas, rodapé).
2. Códigos, números de reserva/localizador, números de bilhete/voucher.
3. Nomes de pessoas, empresas e locais.
4. Datas, horários e valores monetários exatamente como escritos no documento.
5. Políticas, avisos e condições (cancelamento, bagagem, documentos exigidos etc.), se houver.

Não invente, não corrija nem complete informação que não esteja no documento. Se algum trecho estiver ilegível, indique isso no texto (ex: "[ilegível]") em vez de adivinhar.

Retorne apenas o texto transcrito — sem comentários, sem formatação markdown, sem resumo.`;
}

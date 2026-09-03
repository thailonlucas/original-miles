import type { VoucherType } from '../../../services/travel-db';

function formatVoucherTypesList(voucherTypes: VoucherType[]): string {
  return voucherTypes
    .map((t) => `- slug: "${t.slug}" | nome: ${t.name ?? t.slug}${t.description ? ` | descrição: ${t.description}` : ''}`)
    .join('\n');
}

export function buildSystemPrompt(voucherTypes: VoucherType[]): string {
  return `Você classifica o tipo de um voucher/comprovante de viagem (passagem aérea, hospedagem, seguro viagem, transfer, aluguel de carro, reserva de restaurante, experiência/passeio, ferry, etc.) a partir do documento enviado (imagem ou PDF).

Tipos de voucher cadastrados para este tenant:
${formatVoucherTypesList(voucherTypes)}

Regras:
1. Escolha o "slug" que melhor descreve o conteúdo PRINCIPAL do documento.
2. Se o documento não corresponder com segurança a nenhum tipo listado acima, use o slug "other".
3. Nunca invente um slug que não esteja na lista acima.
4. "confidence" reflete sua certeza na classificação, de 0 a 1 — não infle a confiança quando o documento for ambíguo, tiver baixa qualidade/legibilidade, ou misturar mais de um tipo.
5. Retorne apenas a classificação — não descreva nem extraia os dados do documento aqui.`;
}

import { customerTypeCategories, type CustomerTypeCategory } from './schema';

// Fonte única da descrição de cada tipo de cliente — chave é o valor exato do enum
// (`customerTypeCategories`), então o texto nunca fica fora de sincronia com o schema. Editar uma
// categoria é editar só aqui. Compartilhada por `agents/luna-customer-type/` (classifica o tipo),
// `agents/luna-working-memory/` (decide `tipo_cliente` na working memory) e `agents/tags/` (já sabe
// o `tipo_cliente` e só precisa da descrição de UM tipo, via `customerTypeCategoryDescriptions[tipo]`).
export const customerTypeCategoryDescriptions: Record<CustomerTypeCategory, string> = {
  vendedor:
    'Usuário que realizou uma venda pela plataforma, vendeu um ingresso, quer sacar o dinheiro, enviou o ingresso ao comprador ou está com problemas relacionados ao recebimento. Também inclui solicitações de cadastro de evento para vender ingressos.',
  comprador:
    'Usuário que realizou uma compra pela plataforma, comprou um ingresso, quer recebê-lo ou não o recebeu do vendedor. Também inclui problemas relacionados à compra, falta de resposta do vendedor, solicitações de cadastro de evento para comprar ingressos e criação de conta.',
  improdutivo:
    'Contato de alguém que não é cliente ou cujo assunto não possui relação com a Buyticket, como marketing de outras empresas, assuntos aleatórios ou dúvidas não relacionadas à empresa.',
  parceiro_afiliado:
    'Contato relacionado a parcerias com a Buyticket, incluindo comissão, divulgação de ingressos, taxa de conversão, cupons, UGC, influenciadores e ações de marketing.',
  imprensa:
    'Contato de veículos ou profissionais de mídia interessados em divulgar a Buyticket, incluindo Instagram, revistas, jornais, televisão, YouTube, manchetes, anúncios e outros canais de comunicação.',
  funcionario: 'Contato realizado por um funcionário interno da Buyticket para tratar de assuntos relacionados à empresa.',
};

// Bloco "categoria — descrição" com todos os tipos, um por linha — pra quem ainda não sabe o
// `tipo_cliente` e precisa mostrar a lista completa pro modelo escolher (classificador e working
// memory). Quem já sabe o tipo usa `customerTypeCategoryDescriptions[tipo]` direto.
export function renderCustomerTypeCategoryDescriptions(): string {
  return customerTypeCategories.map((category) => `${category} — ${customerTypeCategoryDescriptions[category]}`).join('\n  ');
}

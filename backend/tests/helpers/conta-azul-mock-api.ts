import {
  ContaAzulApiError,
  type ContaAzulApiClient,
} from '../../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';

export type MockContaAzulApiOptions = {
  readonly categoryName?: string;
  readonly receivableStatus?: string;
  readonly receivableTotal?: string;
  readonly failReceivablesOnPage?: number;
  readonly twoReceivablePages?: boolean;
  readonly hangCategoriesMs?: number;
  readonly onCall?: (resource: string) => void;
};

function categoryItem(name: string) {
  return { id: 'cat-1', nome: name, tipo: 'RECEITA' };
}

function receivableItem(input: {
  readonly id: string;
  readonly dueDate: string;
  readonly status: string;
  readonly total: string;
}) {
  return {
    id: input.id,
    descricao: 'Venda',
    data_vencimento: input.dueDate,
    status: input.status,
    status_traduzido: input.status,
    total: input.total,
    pago: '0',
    nao_pago: input.total,
    cliente: { id: 'p-1' },
    categorias: [{ id: 'cat-1' }],
  };
}

export function createMockContaAzulApiClient(
  options: MockContaAzulApiOptions = {},
): ContaAzulApiClient {
  const categoryName = options.categoryName ?? 'Receitas';
  const receivableStatus = options.receivableStatus ?? 'EM_ABERTO';
  const receivableTotal = options.receivableTotal ?? '10.00';

  return {
    getConnectedCompany: async () => ({}),
    getCategories: async () => {
      options.onCall?.('categories');
      if (options.hangCategoriesMs && options.hangCategoriesMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, options.hangCategoriesMs);
        });
      }
      return {
        itens_totais: 1,
        itens: [categoryItem(categoryName)],
      };
    },
    getFinancialAccounts: async () => {
      options.onCall?.('accounts');
      return {
        itens_totais: 1,
        itens: [{ id: 'acc-1', nome: 'Caixa', tipo: 'CONTA_CORRENTE', ativo: true }],
      };
    },
    getFinancialAccountCurrentBalance: async () => {
      options.onCall?.('accountBalance');
      return { saldo_atual: 100 };
    },
    getPeople: async () => {
      options.onCall?.('people');
      return {
        totalItems: 1,
        items: [{ id: 'p-1', nome: 'Maria', ativo: true, perfis: ['CLIENTE'] }],
      };
    },
    getCostCenters: async () => {
      options.onCall?.('costCenters');
      return {
        itens_totais: 0,
        itens: [],
      };
    },
    searchReceivables: async (_token, query) => {
      options.onCall?.('receivables');
      if (options.failReceivablesOnPage === query.pagina) {
        throw new ContaAzulApiError('unavailable', 'falha', { httpStatus: 500 });
      }
      if (options.twoReceivablePages && query.pagina === 1) {
        return {
          itens_totais: 101,
          itens: Array.from({ length: 100 }, (_, index) =>
            receivableItem({
              id: `r-${index}`,
              dueDate: query.dataVencimentoDe,
              status: receivableStatus,
              total: receivableTotal,
            }),
          ),
        };
      }
      if (query.pagina > 1) {
        if (options.twoReceivablePages) {
          return {
            itens_totais: 101,
            itens: [
              receivableItem({
                id: 'r-100',
                dueDate: query.dataVencimentoDe,
                status: receivableStatus,
                total: receivableTotal,
              }),
            ],
          };
        }
        return { itens_totais: 1, itens: [] };
      }
      return {
        itens_totais: 1,
        itens: [
          receivableItem({
            id: 'r-1',
            dueDate: query.dataVencimentoDe,
            status: receivableStatus,
            total: receivableTotal,
          }),
        ],
      };
    },
    searchPayables: async (_token, query) => {
      options.onCall?.('payables');
      if (query.pagina > 1) {
        return { itens_totais: 0, itens: [] };
      }
      return {
        itens_totais: 1,
        itens: [
          {
            id: 'ap-1',
            descricao: 'Aluguel',
            data_vencimento: query.dataVencimentoDe,
            status_traduzido: 'EM_ABERTO',
            total: '20.00',
            pago: '0',
            nao_pago: '20.00',
            fornecedor: { id: 'p-1' },
          },
        ],
      };
    },
    getInstallmentDetail: async () => {
      options.onCall?.('installmentDetail');
      return { id: 'r-1', evento: { rateio: [] } };
    },
    getInstallmentSettlements: async () => {
      options.onCall?.('installmentSettlements');
      return [];
    },
    getSettlementById: async () => {
      options.onCall?.('settlementById');
      return { kind: 'not_found' as const };
    },
    searchTransfers: async () => {
      options.onCall?.('transfers');
      return { itens_totais: 0, itens: [] };
    },
  };
}

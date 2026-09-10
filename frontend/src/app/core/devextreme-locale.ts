import { loadMessages, locale } from 'devextreme/localization';
import ptMessages from 'devextreme/localization/messages/pt.json';

/**
 * Traduz os textos internos do DevExtreme (botões do popup de edição, paginador,
 * filtros, confirmações). Sem isto o widget cai no inglês embutido e a tela fica
 * meio em português, meio em inglês — "Save"/"Cancel" no rodapé dos popups.
 *
 * O dicionário oficial `pt.json` é português EUROPEU em alguns termos. Os que
 * aparecem nesta aplicação são corrigidos para pt-BR logo abaixo; o resto do
 * dicionário serve como está.
 */
const PT_BR_OVERRIDES = {
  // "Confirmar" em vez de "Salvar": o botão fecha o popup e confirma a operação
  // inteira (inclusive a criação), não só uma gravação de rascunho.
  'dxDataGrid-editingSaveRowChanges': 'Confirmar',
  'dxDataGrid-editingDeleteRow': 'Excluir',
  'dxDataGrid-editingUndeleteRow': 'Restaurar',
  'dxDataGrid-editingConfirmDeleteMessage': 'Tem certeza que deseja excluir este registro?',
  'dxDataGrid-editingAddRow': 'Adicionar',
  'dxDataGrid-searchPanelPlaceholder': 'Buscar…',
  'Search': 'Buscar…',
  'Loading': 'Carregando…',
  'Select': 'Selecione…',
};

/** Chamado uma única vez, antes do bootstrap da aplicação. */
export function setupDevExtremeLocale(): void {
  loadMessages(ptMessages);
  // Segunda carga: o loadMessages mescla, então isto sobrepõe as chaves acima.
  loadMessages({ pt: PT_BR_OVERRIDES });
  locale('pt');
}

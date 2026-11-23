# Correção de usabilidade e indicadores de progresso do Knowledge Hub

## Problema e objetivo
A seleção de até 80 páginas no mapeador estava invisível na interface porque a lista tinha uma segunda rolagem dentro de um modal flexível, que comprimia sua altura. O usuário também precisava visualizar o andamento de importações e cadastros.

## Correções
- O modal **Mapear site completo** mantém título, barra de progresso e rodapé fixos; a área central usa apenas uma rolagem, com altura apropriada à tela. A lista nunca utiliza uma segunda rolagem ou limite artificial de 350 px.
- Seções expansíveis por área e subdomínio, com as primeiras seções abertas; botões de expandir/recolher todas, busca por título, URL, área ou subdomínio e contador de resultados.
- Indicador de atividade para mapeamento (uma chamada remota, duração indeterminada). Na extração das páginas selecionadas e no cadastro de documentos, o progresso usa a quantidade real de itens concluídos sobre o total, inclusive para itens com erro.
- Arquivos TXT, MD, CSV, JSON, PDF e DOCX exibem a leitura do arquivo via FileReader.onprogress (bytes) quando suportado. Depois, PDF/DOCX passa à etapa de extração remota, de duração indeterminada.
- Importação de link ou vídeo, registro de novo conhecimento, atualização de permissões e alteração de status exibem a etapa em execução e a confirmação de conclusão/falha. A barra nunca estima porcentagens de rede quando o servidor não informa progresso.
- Os materiais importados continuam passando pelo cadastro em revisão e pela aprovação humana pré-existente. Nenhuma modificação em banco, RAGs, prompts, MegaBrain, agentes ou integração Junior.

## Verificação
Testes estruturais de UI e de integridade do contrato, mais regressão completa no build Vercel. A validação visual final em navegadores reais requer acesso à interface autenticada.

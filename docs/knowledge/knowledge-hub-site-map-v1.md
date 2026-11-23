# Phoenix ONE — Knowledge Hub | Mapear site completo (sob demanda)

## Escopo
- Novo botão **Mapear site completo**, complementar ao atual **Importar site ou vídeo**.
- O usuário com permissão de edição de conhecimento cola uma URL HTTPS pública; a API /api/phoenix-map-site encontra páginas por links HTML, robots.txt (referências de sitemaps), sitemap.xml e índices XML acessíveis.
- Inclui subdomínios relacionados à mesma base registrável (por exemplo, phoenixseg.com.br, www.phoenixseg.com.br e lp.phoenixseg.com.br) quando forem vinculados por links ou sitemaps. Quando o endereço inicial é um subdomínio, consulta também a raiz pública.
- Não faz enumeração de DNS, busca de subdomínios ocultos, nem rastreamento de outros domínios ou TLDs. Links para domínios diferentes são excluídos.
- Limites: 80 URLs listadas, 12 requisições de descoberta, 18 segundos de descoberta, profundidade máxima 2 para áreas acessadas pelo HTML, 12 páginas selecionadas por lote de importação.
- O mapa é uma lista de URLs encontradas, não um inventário completo de tudo que existe sob o domínio. Para aumentar a cobertura, executar em seções específicas ou sitemaps oficiais.

## Importação e aprovação
1. Selecionar uma ou várias páginas do mapa, organizadas por domínio e seção.
2. Clicar **Preparar páginas para revisão**: a interface consulta cada página via rota autenticada /api/phoenix-import-source, apresenta texto e título editáveis, sem gravação.
3. Conferir cada documento, desmarcar os que não interessam, escolher categoria, sensibilidade e agente(s).
4. Confirmar explicitamente **Cadastrar documentos em revisão**. A gravação aproveita somente a ação existente create_document; cada documento entra com status review, e o conteúdo só se torna fonte de RAG após aprovação humana no fluxo publish_document.
5. Páginas que falharem não impedem o preparo de outras. No cadastro, progresso por documento e controle para não salvar duas vezes os já confirmados na sessão.

## Segurança
- Mesma autenticação Supabase e papéis owner/admin/editor, mesmo Origin e host do Phoenix ONE oficial.
- HTTPS obrigatório; somente nomes DNS públicos, IPs públicos verificados e fixados na conexão. Bloqueia recursos administrativos, arquivos binários, links externos, IPs privados e redirecionamentos para fora da base do site.
- Para cada URL visitada na descoberta, os redirecionamentos são validados novamente. Sem login, cookies ou execução de JavaScript do site. Não executa scripts ou comandos contidos em conteúdo importado.
- Não há alteração de banco, prompts, RAGs, MegaBrain, integrações ou sistema do Junior.

## Monitoramento futuro
Sem cron, agendamento ou atualização periódica. Acompanhamento contínuo dependerá de novo projeto e autorização separada.

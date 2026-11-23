# Knowledge Hub — transcrição de vídeos grandes (V2)

Status: **arquitetura preparada para implementação, não habilitada em produção**.

## Progresso de infraestrutura — 23/11/2026

- Bucket privado `phoenix-hub-large-media-temp` criado no projeto Supabase `cxyxrhmpjehrqhwihxul` com `file_size_limit=500000000` bytes; tipos de vídeo/áudio explicitamente permitidos.
- Políticas `phoenix_hub_large_media_upload`, `phoenix_hub_large_media_read` e `phoenix_hub_large_media_delete` aplicadas a `storage.objects` para usuários autenticados que passem na função existente de autorização Phoenix, limitados a caminhos sob seu próprio UID.
- Bucket legado de 24 MB não modificado.
- **Ainda não verificados:** limite global do Storage, TUS com 500 MB, processamento via worker, política efetiva de limpeza e integração de revisão; nenhuma funcionalidade de 500 MB liberada no frontend.

## Objetivo
Aceitar gravações MP4/WebM de até 500 MB por usuário autorizado, com upload retomável, extração de áudio em worker isolado, segmentação por tempo com sobreposição, transcrição de partes, reconstituição ordenada e revisão humana antes de qualquer inserção no RAG.

## Por que o fluxo de 24 MB não é suficiente
- `phoenix-hub-transcription-temp` tem limite **24.000.000 bytes**; não mudar a configuração do bucket legado.
- A API de transcrição possui limite por requisição; aumentar o armazenamento não elimina esse limite.
- Vercel Functions não são destino adequado para receber/uploadar 500 MB por request, executar FFmpeg longo e aguardar todas as partes síncronas.
- Separar bytes arbitrariamente de MP4 não produz arquivos de áudio válidos.

## Infraestrutura necessária
1. **Bucket separado** `phoenix-hub-large-media-temp`, privado, tamanho configurado conforme limite global contratado do Storage, política restrita ao proprietário autenticado e gestores autorizados. Não reutilizar buckets do CRM de leads.
2. **TUS resumable upload** direto para Supabase Storage, `chunkSize=6 MiB`; progresso de bytes, retomada e cancelamento. Nunca passar o binário pela Vercel.
3. **Fila de trabalhos** privada em `phoenix_one`: job ID UUID, owner UID, caminho validado, tamanho declarado, status, progresso, chunks finalizados, erros sanitizados, tentativas e expiração. Autorização por owner/admin; sem acesso de `anon`.
4. **Worker de mídia** separado com FFmpeg, memória e execução próprias para extrair áudio mono 16 kHz com bitrate limitado; dividir por tempo em segmentos de no máximo ~15 MB e adicionar sobreposição breve para preservar frases.
5. **Orquestração idempotente**: processar segmentos na ordem, retry limitado, deduplicar somente o trecho sobreposto sem suprimir falas, guardar artefatos temporários sob expiração, publicar progresso consultável e evitar resposta pronta antes de concluir todos os segmentos.
6. **Revisão**: resultado consolidado editável; marcar origem, modelo, timestamps, idioma, pontos incertos e política LGPD. Somente o fluxo existente `create_document` + revisão humana pode disponibilizar o material aos agentes.

## Máquina de estados
`created → uploading → uploaded → extracting → chunking → transcribing → assembling → review_ready`.

Erros: `failed`, `expired`, `cancelled`. Para cada estado registrar timestamps, progresso real e etapa; não exibir progresso simulado. Estados finais não permitem reinício sem novo job.

## Segurança e custos
- Exigir sessão Auth e papel `owner/admin/editor` validado no backend antes de criar job; consentimento de processamento explícito.
- Validar assinatura binária, extensão, MIME, duração, tamanho, número máximo de segmentos e quotas por usuário; proteger contra zip/decompression bombs.
- Não gerar signed URL de leitura pública nem enviar credenciais ou conteúdo pessoal para logs.
- Remover mídia, segmentos e transcrições temporárias após prazo contratado, inclusive em falha; verificação periódica.
- Limitar concorrência, duração e custo por trabalho. Cancelamento precisa interromper processamento e eliminar artefatos.
- Não tocar no CRM LEADS; manter isolamento do schema `phoenix_one`.

## Critérios de homologação
- 24 MB legado permanece funcional.
- MP4 100 MB e 500 MB: retomada depois de conexão interrompida, upload autenticado e progresso correto.
- Transcrição fiel com fala atravessando divisões; segmentos montados na ordem, sem duplicação.
- Rejeição de usuário sem autorização, path de outro usuário e formato inválido.
- Timeout/falha de worker com retry e limpeza; cancelamento confirmado.
- Teste de custo, retenção e RLS; publicação somente após aprovação.

## Gate de publicação
**Não habilitar botão de 500 MB** antes da configuração do bucket, implantação do worker, testes de RLS, carga e verificação de fim-a-fim. O teste de 21,4 MB validou o fluxo legado; não é evidência de que a V2 esteja operacional.

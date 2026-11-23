# Knowledge Hub — Transcrição de áudio e vídeo sob demanda

## Escopo
O painel Phoenix ONE ganha o botão **Transcrever áudio ou vídeo**:
1. Usuário owner/admin/editor seleciona áudio ou vídeo compatível: MP3, MPGA, MPEG, M4A, MP4, WAV, OGG, WebM ou FLAC, até 24.000.000 bytes.
2. Confirma autorização para enviar o conteúdo à API da OpenAI e escolhe idioma automático ou português.
3. O navegador envia o arquivo diretamente ao bucket **privado e temporário** do Supabase, com JWT autenticado. A barra de progresso acompanha bytes reais de upload.
4. A função Vercel autentica a sessão, confere a autorização Phoenix ONE, valida a propriedade do caminho, recupera a gravação como o usuário autenticado e valida tamanho e assinatura do arquivo.
5. Chama a API OpenAI /v1/audio/transcriptions com o modelo gpt-transcribe, que substitui o whisper-1 anunciado para descontinuação em fevereiro de 2027. OPENAI_API_KEY é mantida exclusivamente no servidor.
6. A função tenta remover o objeto temporário no bloco finally, mesmo em falhas de processamento. Em erro do pedido, o navegador também tenta excluir o objeto. Falhas abruptas de navegador/conexão podem deixar objetos órfãos; a limpeza periódica será evolução futura.
7. Devolve somente o texto e seus metadados de proveniência à interface para edição no formulário Novo conhecimento, sem salvar automaticamente.
8. O registro só é gravado mediante ação explícita **Cadastrar no banco**, em status review; a publicação para RAGs exige aprovação humana no fluxo atual.

## Segurança e limites
- Bucket privado phoenix-hub-transcription-temp, com tamanho máximo de 24 MB e tipos MIME permitidos.
- RLS em storage.objects com INSERT/SELECT/DELETE restritos a usuário autenticado autorizado na tabela phoenix_one.admin_users e caminho privado auth.uid()/uuid.ext. Não permite upsert e não publica URLs.
- Função storage.phoenix_hub_transcription_editor com SECURITY DEFINER, busca totalmente qualificada e schema storage fora da Data API pública.
- API Vercel confere Origin/Host, token, papel, propriedade do arquivo e formato binário. Nenhum envio é feito ao sistema do Junior.
- O modelo pode errar coberturas, nomes, valores ou condições contratuais. Revisão humana e autorização para tratar dados pessoais são obrigatórias.
- Arquivos acima de 24 MB devem ser comprimidos ou divididos; longos vídeos podem esgotar o tempo de execução.
- A barra mostra progresso por bytes reais no upload e atividade indeterminada durante transcrição remota. Não apresenta porcentagem estimada sem medição.
- RAGs, prompts mestres, MegaBrain e demais agentes são preservados. Não há diarização, identificação de palestrantes, leitura de imagens de vídeo ou transcrição automática de links protegidos.

## Verificações
Validar schema e políticas de armazenamento em transação, testes de serviço e regressão da interface no preview da Vercel. Realizar teste manual autenticado com gravação autorizada após publicação oficial.

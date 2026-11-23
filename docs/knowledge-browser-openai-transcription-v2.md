# Knowledge Hub — transcrição de vídeos grandes no navegador (V2)

## Objetivo

Transcrever vídeo ou áudio **diretamente pelo Phoenix ONE**, sem instalar programas no Windows e sem hospedar um contêiner FFmpeg. A chave da OpenAI permanece **exclusivamente** no servidor. O usuário escolhe o modelo de transcrição, com `gpt-transcribe` como padrão e `whisper-1` como alternativa legada.

## Arquitetura

1. O usuário autenticado seleciona um arquivo no Knowledge Hub e confirma autorização/cobrança.
2. `ffmpeg.wasm` é carregado no navegador e converte o arquivo em MP3 mono, 16 kHz, 48 kbps, em partes de aproximadamente oito minutos.
3. **O vídeo inteiro não é enviado ao Supabase**. Cada MP3 menor que 24 MB utiliza o bucket privado legado `phoenix-hub-transcription-temp`, com nome UUID e caminho sob o usuário autenticado.
4. A Vercel recebe somente o caminho da parte, valida a sessão e papel, baixa a parte do bucket, chama `/v1/audio/transcriptions` e devolve o texto. A parte é excluída ao final.
5. Os textos são montados em ordem, com marcadores de início dos trechos, e entregues ao formulário de **revisão humana**. Nenhum conhecimento é cadastrado/publicado automaticamente.

## Isolamento e custo

- A chave da OpenAI jamais vai ao navegador.
- Não dependemos de Railway, worker separado ou banco/fila de vídeos grandes.
- A API de transcrição **não é gratuita**; a cobrança é conforme o modelo e uso.
- O código em `server/knowledge-transcription.js` aceita apenas `gpt-transcribe` e `whisper-1`.
- O bucket legado de 24 MB, a triagem, os agentes, RAGs e prompts existentes permanecem inalterados.
- O `whisper-1` é uma opção legada com desligamento anunciado para fevereiro de 2027. Manter `gpt-transcribe` como padrão.

## Limitações importantes

- O limite de arquivo de entrada no código é **500 milhões de bytes**, mas isso **não garante** processamento de 500 MB em qualquer computador: `ffmpeg.wasm` usa RAM/CPU do navegador e pode falhar em máquinas com pouca memória.
- Não foi executado teste de ponta a ponta real com vídeo de 100/500 MB. Os testes atuais verificam validações, divisão lógica, montagem do texto, API simulada e o build.
- A primeira execução exige baixar o núcleo FFmpeg WebAssembly de CDN com versão fixada `@ffmpeg/core@0.12.10`; requer acesso à internet e é uma dependência externa.
- A aplicação deve permanecer aberta enquanto processa; o fluxo não tem retomada de transcrição se fechar o navegador.
- O recurso não cria filas ou monitoramento no Supabase; para arquivos maiores e estabilidade em escala, poderá ser necessário um processador dedicado.
- A entrega para revisão se limita a um documento de até 140 mil caracteres.
- A função de backend só permite requisições da origem oficial, portanto prévias Vercel podem não conseguir chamar o endpoint privado sem implantação controlada.

## Release

A interface está condicionada a `VITE_KNOWLEDGE_BROWSER_TRANSCRIPTION_ENABLED=true`, **não ativada por padrão**. Homologar primeiro em ambiente oficial protegido com vídeo fictício de 21,4 MB, 50 MB, 100 MB e, se o navegador suportar, 500 MB. Testar tanto `gpt-transcribe` quanto `whisper-1`, verificar custos, exclusão do arquivo temporário e revisão antes de liberar amplamente.

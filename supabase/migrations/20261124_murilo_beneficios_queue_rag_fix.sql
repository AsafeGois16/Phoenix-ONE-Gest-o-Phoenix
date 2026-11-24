-- Phoenix ONE / Gestão Phoenix — corrigir fila de cotações Murilo (24/11/2026)
-- Atualiza somente a orientação de DESTINO nas RAGs 06 e 08.
-- Mantém versões anteriores arquivadas para reversão; não modifica prompts.
-- Executar somente após o código da API confirmar department=beneficios.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('phoenix-one-murilo-benefits-queue-rag'));
DO $$
DECLARE
 item record;
 original phoenix_one.knowledge_documents%ROWTYPE;
 new_document_id uuid;
 existing_count int;
 replaced_count int;
BEGIN
 FOR item IN
  SELECT * FROM (VALUES
   (
    'Murilo 06 — Equipe e encaminhamentos comerciais',
    'Para novo lead de Benefícios, enviar departamento lógico comercial + produto de Benefícios, que Junior traduz para fila beneficios; para Auto/RE, departamento patrimonio e fila patrimonio.',
    'Para cotação de Benefícios autorizada com o Murilo, enviar diretamente department=beneficios, handoff.intent=nova_cotacao e handoff.product do produto; não utilizar department=comercial. Para cotação Auto/RE autorizada, enviar department=patrimonio, handoff.intent=nova_cotacao e handoff.product correspondente.'
   ),
   (
    'Murilo 08 — Integração comercial com o Sistema de Gestão Phoenix',
    'O departamento lógico comercial com product de Benefícios corresponde à fila beneficios; Auto/RE usa patrimonio;',
    'Na cotação confirmada com Murilo, Saúde, Odonto, Vida, Pet e Previdência seguem diretamente com department=beneficios, handoff.intent=nova_cotacao e handoff.product válido; Auto/RE segue com department=patrimonio e os mesmos metadados;'
   )
  ) AS v(doc_title,legacy_text,revised_text)
 LOOP
  SELECT count(*) INTO existing_count
  FROM phoenix_one.knowledge_documents d
  JOIN phoenix_one.document_agents da ON da.document_id=d.id AND da.agent_id='murilo'
  WHERE d.title=item.doc_title AND d.status='published';
  IF existing_count<>1 THEN
   RAISE EXCEPTION 'Unexpected active Murilo RAG % count %',item.doc_title,existing_count;
  END IF;

  SELECT d.* INTO original
  FROM phoenix_one.knowledge_documents d
  JOIN phoenix_one.document_agents da ON da.document_id=d.id AND da.agent_id='murilo'
  WHERE d.title=item.doc_title AND d.status='published'
  FOR UPDATE OF d;

  SELECT count(*) INTO replaced_count
  FROM phoenix_one.knowledge_chunks
  WHERE document_id=original.id AND strpos(content,item.legacy_text)>0;
  IF replaced_count<>1 THEN
   RAISE EXCEPTION 'Expected exactly one legacy route in %, found %',item.doc_title,replaced_count;
  END IF;

  UPDATE phoenix_one.knowledge_documents
  SET status='archived',updated_at=now()
  WHERE id=original.id;

  INSERT INTO phoenix_one.knowledge_documents
   (title,source_kind,category,version,status,sensitivity,reviewed_at,updated_at)
  VALUES
   (original.title,original.source_kind,original.category,original.version+1,'published',original.sensitivity,now(),now())
  RETURNING id INTO new_document_id;

  INSERT INTO phoenix_one.document_agents(document_id,agent_id)
  SELECT new_document_id,agent_id
  FROM phoenix_one.document_agents WHERE document_id=original.id;

  INSERT INTO phoenix_one.knowledge_chunks(document_id,chunk_index,content)
  SELECT new_document_id,chunk_index,replace(content,item.legacy_text,item.revised_text)
  FROM phoenix_one.knowledge_chunks WHERE document_id=original.id;
 END LOOP;
END
$$;
COMMIT;

-- Verificação:
SELECT d.title,d.version,d.status,count(c.id) AS chunks
FROM phoenix_one.knowledge_documents d
JOIN phoenix_one.document_agents da ON da.document_id=d.id AND da.agent_id='murilo'
LEFT JOIN phoenix_one.knowledge_chunks c ON c.document_id=d.id
WHERE d.title LIKE 'Murilo 06%' OR d.title LIKE 'Murilo 08%'
GROUP BY d.id,d.title,d.version,d.status ORDER BY d.title,d.version;

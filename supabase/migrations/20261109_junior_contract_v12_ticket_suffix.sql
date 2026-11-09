-- Contrato Junior v1.2 (06/11/2026)
-- Aceitar protocolo AAAAMMDD-NNNN e AAAAMMDD-NNNN-N no estado privado do Phoenix ONE.
-- Não altera prompts, RAG, histórico de clientes ou filas do Junior.
BEGIN;
ALTER TABLE phoenix_one.protocol_agent_state
  DROP CONSTRAINT IF EXISTS protocol_agent_state_external_ticket_id_check;
ALTER TABLE phoenix_one.protocol_agent_state
  ADD CONSTRAINT protocol_agent_state_external_ticket_id_check
  CHECK (external_ticket_id ~ '^[0-9]{8}-[0-9]{4}(-[1-9][0-9]*)?$');
COMMIT;

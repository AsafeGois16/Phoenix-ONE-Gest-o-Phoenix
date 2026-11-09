/**
 * Identificador do protocolo do Junior: AAAAMMDD-NNNN, opcionalmente -N
 * após vinculação a um caso anterior. Nunca usar o número citado pelo cliente
 * em vez do protocolo recebido na requisição atual.
 */
export const validJuniorProtocol = value =>
 typeof value==='string' && /^\d{8}-\d{4}(?:-[1-9]\d*)?$/.test(value)

/** Matriz de capacidade do Phoenix ONE.
 * Política declarativa; NÃO é interface de execução de tickets ou 4Zapy.
 * Novas ações exigem contrato Junior, permissão e homologação separada.
 */
export const ACTION_CAPABILITIES=Object.freeze([
 {id:'general_guidance',name:'Orientações e conhecimento publicado',agents:['clara','murilo'],kind:'read',scopes:[],identity:'none',state:'enabled'},
 {id:'policy_lookup',name:'Consultar apólices do titular',agents:['clara'],kind:'read',scopes:['identity:resolve','policies:read'],identity:'verified',state:'enabled'},
 {id:'installment_lookup',name:'Consultar parcelas autorizadas',agents:['clara'],kind:'read',scopes:['identity:resolve','installments:read'],identity:'verified',state:'enabled'},
 {id:'pending_lookup',name:'Consultar pendências de movimentações',agents:['clara'],kind:'read',scopes:['identity:resolve','clients:read'],identity:'verified',state:'forbidden'},
 {id:'movement_requirements',name:'Consultar documentos de movimentação (GET /requirements)',agents:['clara'],kind:'read',scopes:['identity:resolve','requirements:read'],identity:'verified',state:'pending_junior'},
 {id:'movement_status',name:'Consultar andamento de movimentação interna',agents:['clara'],kind:'read',scopes:['identity:resolve'],identity:'verified',state:'forbidden'},
 {id:'ticket_handoff_proposal',name:'Propor encaminhamento para fila humana',agents:['clara','murilo'],kind:'proposal',scopes:[],identity:'none',state:'enabled'},
 {id:'ticket_comment',name:'Registrar comentário no ticket',agents:['clara'],kind:'write',scopes:['tickets:comment'],identity:'verified',state:'pending_junior'},
 {id:'second_copy',name:'Solicitar segunda via e envio de boleto',agents:['clara'],kind:'write',scopes:['installments:read'],identity:'verified',state:'pending_junior'},
 {id:'movement_request',name:'Criar ou alterar movimentação de beneficiário',agents:['clara'],kind:'write',scopes:['tickets:create'],identity:'verified',state:'forbidden'},
 {id:'new_quote',name:'Registrar oportunidade de cotação',agents:['murilo'],kind:'write',scopes:[],identity:'none',state:'pending_junior'},
 {id:'send_whatsapp',name:'Enviar WhatsApp diretamente pelo Phoenix ONE',agents:[],kind:'write',scopes:[],identity:'none',state:'forbidden'}
])
export function checkCapability(id,{agent,identityVerified=false,scopes=[]}={}){
 const item=ACTION_CAPABILITIES.find(x=>x.id===id)
 if(!item)return {allowed:false,reason:'unknown_capability'}
 if(item.state==='forbidden')return {allowed:false,reason:'system_junior_exclusive'}
 if(item.state!=='enabled')return {allowed:false,reason:'not_homologated'}
 if(!item.agents.includes(agent))return {allowed:false,reason:'agent_not_permitted'}
 if(item.identity==='verified'&&!identityVerified)return {allowed:false,reason:'identity_not_verified'}
 if(!item.scopes.every(s=>scopes.includes(s)))return {allowed:false,reason:'scope_missing'}
 return {allowed:true,reason:'permitted'}
}

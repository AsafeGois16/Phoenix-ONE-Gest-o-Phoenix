import {createHash} from 'node:crypto'
import {secureMatch,uuidValid} from './junior-v1.js'
import {protocolBase} from './orchestration-protocol-strategy.js'
export const JOINT_BRANCH='feat/orquestracao-agentes-fase5-joint'
const forbidden=['PHOENIX_ONE_TOKEN','PHOENIX_ONE_WEBHOOK_SECRET','PHOENIX_ONE_INTERNAL_BRIDGE_TOKEN','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','OPENAI_API_KEY','PHOENIX_ONE_LAB_ACCESS_CODE']
const formerRefs=new Set(['cxyxrhmpjehrqhwihxul','pbdufunpvpzkneqkpkil'])
const md5=t=>createHash('md5').update(t).digest('hex')
const strong=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43,128}$/.test(s)&&new Set(s).size>=16
// Candidate configuration: deliberately not wired to public HTTP yet.
export function jointConfig(env){
 if(env.VERCEL_GIT_COMMIT_REF!==JOINT_BRANCH||env.VERCEL_ENV!=='preview'||env.PHX_JOINT_ENABLED!=='true'||forbidden.some(k=>env[k]))return null
 const {PHX_JOINT_TOKEN:token,PHX_JOINT_EVENT_SECRET:eventSecret,PHX_JOINT_PHONE:phone,PHX_JOINT_ACTIVATION_DATE:activationDate,PHX_JOINT_DB_URL:dbUrl,PHX_JOINT_DB_KEY:dbKey,PHX_JOINT_DB_JWT:dbJwt,PHX_JOINT_MODEL_KEY:modelKey,PHX_JOINT_CLARA_PROMPT:clara,PHX_JOINT_MURILO_PROMPT:murilo}=env
 if(!strong(token)||!strong(eventSecret)||token===eventSecret||!(/^\+55[1-9]\d{9,10}$/).test(phone||'')||!(/^\d{8}$/).test(activationDate||''))return null
 try{protocolBase(activationDate+'-0001')}catch{return null}
 const dbRef=/^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(dbUrl||'')?.[1]
 if(!dbRef||formerRefs.has(dbRef)||dbRef!==env.PHX_JOINT_ALLOWED_DB_REF||!dbKey?.startsWith('sb_publishable_')||typeof dbJwt!=='string'||!modelKey?.startsWith('sk-'))return null
 try{const claim=JSON.parse(Buffer.from(dbJwt.split('.')[1],'base64url').toString());if(claim.role!=='authenticated'||!uuidValid(claim.sub)||claim.ref!==dbRef||!(claim.exp>Date.now()/1000))return null}catch{return null}
 if(md5(clara||'')!=='cd2737e43d54a29a517bb51fbe5f5d93'||md5(murilo||'')!=='2525f67fae1ad46a698bc1e4639c9f86')return null
 return Object.freeze({token,eventSecret,phone,activationDate,dbUrl,dbKey,dbJwt,modelKey,prompts:Object.freeze({clara,murilo})})
}
export function authorizeJointRequest(req,cfg){
 const value=req.headers?.authorization
 return typeof value==='string'&&value.startsWith('Bearer ')&&secureMatch(value.slice(7),cfg.token)&&req.body?.contact?.phone_e164===cfg.phone
}
// Remote adapter contract; provisioning and real database verification pending.
export function makeJointStore(cfg,transport=fetch){
 async function rpc(name,args){
  const res=await transport(cfg.dbUrl+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3500),headers:{apikey:cfg.dbKey,Authorization:'Bearer '+cfg.dbJwt,'Content-Type':'application/json'},body:JSON.stringify(args)})
  if(!res.ok)throw Error('joint_store_unavailable')
  const row=await res.json()
  if(!row||row.environment!=='phoenix_joint_v1')throw Error('joint_store_mismatch')
  return row
 }
 return {
  async pin(body){
   const {base,date,derived}=protocolBase(body.protocolo)
   const row=await rpc('phx_joint_pin',{p_conversation:body.conversation_id,p_protocol:body.protocolo,p_base:base,p_eligible:!derived&&date>=cfg.activationDate,p_cutoff:cfg.activationDate})
   if(!['clara_only','clara_murilo'].includes(row.mode)||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.blocked!=='boolean')throw Error('joint_invalid_pin')
   return row
  },
  intro:p=>rpc('phx_joint_intro',{p_conversation:p.conversationId,p_protocol:p.protocolo,p_clara:p.observedClara===true,p_murilo:p.observedMurilo===true}),
  event:event=>rpc('phx_joint_event',{p_event:{event_id:event.event_id,event_type:event.event_type,ticket:{id:event.ticket.id,conversation_id:event.ticket.conversation_id,status:event.ticket.status}}})
 }
}
const fixtures=Object.freeze([
 {title:'[TESTE] Atendimento',content:'Na homologação, nenhuma transferência, cobertura, pagamento ou alteração é confirmada pela IA. Gestão executa encaminhamentos.'},
 {title:'[TESTE] Auto/RE',content:'Nova cotação de Auto, Moto, Frota, Residencial ou Empresarial usa Patrimônio. Não inventar valores.'},
 {title:'[TESTE] Benefícios',content:'Nova cotação é comercial; movimentações após verificação são Backoffice. Apólices e operadoras de exemplo são fictícias.'}
])
export function makeJointRuntime(cfg,store,state,transport=fetch){
 return Object.freeze({
  async bridge(action,params){
   if(action==='intro_status')return store.intro(params)
   if(!['context','prompt_only'].includes(action)||!['clara','murilo'].includes(params.agent))throw Error('joint_bridge_action_denied')
   if(state.mode==='clara_only'&&params.agent!=='clara')throw Error('joint_agent_mismatch')
   return {agent:params.agent,prompt:cfg.prompts[params.agent],sources:action==='prompt_only'?[]:fixtures}
  },
  async identity(conversation,protocol,document,proof){
   if(!uuidValid(conversation)||!document||document.status!=='valid')return {status:'unavailable'}
   if(document.type!=='cpf'||document.number!=='11144477735')return {status:'not_found'}
   if(!proof?.birth_date)return {status:'verification_required',method:'birth_date',attemptsLeft:null}
   if(proof.birth_date!=='1990-01-01')return {status:'verification_failed'}
   return {status:'verified',policies:[{ramo:'Auto',linha:'Auto',product_code:'auto',seguradora:'Seguradora Fictícia Teste',numero:'TESTE-AUTO-01'},{ramo:'Saúde',linha:'Saúde',product_code:'saude',seguradora:'Operadora Fictícia Teste',numero:'TESTE-SAUDE-01'}],installments:[],pending:[]}
  },
  async model(options){
   const body=JSON.parse(options.body)
   if(body.store!==false||body.tools||body.previous_response_id||body.model!=='gpt-4.1-mini')throw Error('joint_model_contract_denied')
   return transport('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:options.signal,headers:{Authorization:'Bearer '+cfg.modelKey,'Content-Type':'application/json'},body:options.body})
  }
 })
}

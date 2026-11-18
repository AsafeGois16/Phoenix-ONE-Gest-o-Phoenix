import {createClient} from '@supabase/supabase-js'
import {MODES} from './orchestration-preview.js'

const PRODUCTION_REF='cxyxrhmpjehrqhwihxul'
const BRANCH='feat/orquestracao-agentes-fase2-preview'
export const uuidOk=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
// Usa apenas a chave publicável existente e o JWT do administrador.
export function isolatedConfig(env){
 const url='https://'+PRODUCTION_REF+'.supabase.co'
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BRANCH||
    env.PHX_ORCH_TEST_ENABLED!=='true'||env.VITE_SUPABASE_URL?.replace(/\/$/,'')!==url||
    !env.VITE_SUPABASE_PUBLISHABLE_KEY)return null
 const key=env.VITE_SUPABASE_PUBLISHABLE_KEY
 // Não aceitar uma chave secreta ou JWT de service_role no adaptador.
 if(typeof key!=='string'||key.startsWith('sb_secret_'))return null
 if(!key.startsWith('sb_publishable_')){
  try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role!=='anon')return null}
  catch{return null}
 }
 return {url,key}
}
export function isolatedClient(env=process.env,authorization){
 const cfg=isolatedConfig(env)
 if(!cfg||typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return null
 return {cfg,client:createClient(cfg.url,cfg.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:authorization}}})}
}
export async function authorizedAdmin(client,authorization){
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer ')||authorization.length>8192)return null
 const {data,error}=await client.auth.getUser(authorization.slice(7))
 if(error||!uuidOk(data?.user?.id))return null
 // O RLS da allowlist exclusiva decide o acesso. Não consultar dados operacionais.
 const check=await client.rpc('phx_orch_test_get',{})
 return !check.error&&validConfig(check.data)?data.user.id:null
}
function validConfig(row){
 return row&&Object.values(MODES).includes(row.mode)&&Number.isSafeInteger(row.revision)&&row.revision>=1
}
export function centralStore(client){
 const rpc=async(name,args)=>{
  const {data,error}=await client.rpc(name,args)
  if(error||!validConfig(data))throw Error('central_store_unavailable')
  return data
 }
 return {
  get:()=>rpc('phx_orch_test_get',{}),
  set:(mode,revision,actor)=>{
   if(!Object.values(MODES).includes(mode)||!Number.isSafeInteger(revision)||revision<1||!uuidOk(actor))throw Error('invalid_configuration')
   return rpc('phx_orch_test_set',{p_mode:mode,p_expected_revision:revision,p_actor:actor})
  },
  pin:async(ref,isNew)=>{
   if(!uuidOk(ref)||typeof isNew!=='boolean')throw Error('invalid_protocol')
   const row=await rpc('phx_orch_test_pin',{p_protocol_ref:ref,p_new_protocol:isNew})
   if(row.protocol_ref!==ref)throw Error('invalid_protocol_pin')
   return row
  }
 }
}

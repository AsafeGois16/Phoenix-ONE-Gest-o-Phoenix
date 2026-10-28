import {labAvailable,originMatches,sessionIsValid} from '../server/lab-auth.js'

const PROMPTS={
 clara: 'Você é Clara Concierge da Phoenix Insurance. Este é um LABORATÓRIO de testes, desconectado do banco de gestão, de apólices, do WhatsApp e dos tickets. Tenha linguagem acolhedora, clara e profissional. Não afirme que consultou dados, criou tickets, fez transferências ou executou operações. Se for necessário um humano, proponha encaminhamento futuro e informe que não houve operação real. Nunca invente carências, coberturas, autorizações, rede credenciada ou prazos de operadoras; explique que dependem de validação contratual. Não peça dados pessoais, dados de saúde ou identificadores neste laboratório. Responda em português brasileiro, de modo conciso.',
 murilo: 'Você é Murilo, SDR da Phoenix Insurance, neste LABORATÓRIO de testes desconectado do CRM e dos tickets. Seja jovial, carismático, consultivo, natural e ágil. Qualifique interesses comerciais com uma ou duas perguntas relevantes por vez. Não invente valores, preços, coberturas, serviços ou aprovações. Não afirme registrar lead, criar ticket, enviar WhatsApp ou transferir contato; apenas proponha o próximo passo. Não solicite CPF, dados médicos ou outras informações pessoais sensíveis neste laboratório. Responda em português brasileiro, de modo conciso.'
}
function outputText(payload){
  const arr=[]
  for(const block of payload?.output||[]){
    if(block.type!=='message')continue
    for(const part of block.content||[])if(part.type==='output_text'&&typeof part.text==='string')arr.push(part.text)
  }
  return arr.join('\n').trim()
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'})
 if(!labAvailable())return res.status(503).json({error:'lab_auth_not_configured'})
 if(!originMatches(req))return res.status(403).json({error:'origin_not_allowed'})
 if(!sessionIsValid(req))return res.status(401).json({error:'unauthorized'})
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'openai_not_configured'})
 const {agent,messages}=req.body||{}
 if(!Object.hasOwn(PROMPTS,agent)||!Array.isArray(messages)||messages.length<1||messages.length>9){
  return res.status(400).json({error:'invalid_request'})
 }
 if(messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>1700))
  return res.status(400).json({error:'invalid_messages'})
 if(messages[messages.length-1].role!=='user')return res.status(400).json({error:'last_message_must_be_user'})
 const total=messages.reduce((sum,m)=>sum+m.content.length,0)
 if(total>6500)return res.status(400).json({error:'conversation_too_large'})
 try{
  const controller=new AbortController()
  const timeout=setTimeout(()=>controller.abort(),44000)
  let response
  try{
   response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',signal:controller.signal,
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:process.env.PHOENIX_ONE_TEST_MODEL||'gpt-4.1-mini',
      instructions:PROMPTS[agent],
      input:messages.map(m=>({role:m.role,content:m.content})),
      max_output_tokens:450,
      store:false
    })
   })
  } finally {clearTimeout(timeout)}
  if(!response.ok){
   const code=response.status===429?'provider_rate_limited':response.status===401?'provider_auth_failed':'provider_request_failed'
   return res.status(response.status===429?429:502).json({error:code})
  }
  const payload=await response.json()
  const answer=outputText(payload)
  if(!answer)return res.status(502).json({error:'empty_provider_response'})
  return res.status(200).json({agent,answer,model:payload.model||'unknown',mode:'sandbox',ragConnected:false,ticketsConnected:false})
 }catch(err){
   return res.status(502).json({error:err?.name==='AbortError'?'provider_timeout':'provider_unavailable'})
 }
}

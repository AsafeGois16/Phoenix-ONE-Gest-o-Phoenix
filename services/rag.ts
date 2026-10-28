/**
 * Núcleo RAG desacoplado (referência de implementação para o backend autenticado).
 * Nunca importar este módulo no navegador; nenhum segredo é guardado aqui.
 * O adaptador de banco aplica ACL por agente + cliente/tenant ANTES da recuperação.
 */
export type AgentId = 'clara' | 'murilo'
export type Identity = { userId: string; tenantId: string; agent: AgentId; scopes: string[] }
export type DocumentPart = { documentId: string; version: number; text: string; sourceTitle: string; page?: number }
export type RetrievedChunk = DocumentPart & { score: number; citation: string }

export interface KnowledgeRepository {
  /** Implementar com consulta server-side parametrizada e filtro por publicações + ACL. */
  searchAuthorized(input: {
    actor: Identity; embedding: number[]; query: string; limit: number
  }): Promise<RetrievedChunk[]>
  /** Ingestão somente após aprovação e classificação de sensibilidade. */
  upsertApprovedParts(input: { actor: Identity; parts: DocumentPart[]; embeddings: number[][] }): Promise<void>
}

export interface AnswerGenerator {
  respond(input: {
    agent: AgentId; promptVersion: string; question: string;
    context: Array<{ citation: string; text: string }>;
  }): Promise<string>
}

export function chunkText(text: string, maxChars=1100, overlap=140): string[] {
  if(maxChars<=overlap || overlap<0) throw new Error('Invalid segmentation parameters')
  const normalized=text.replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').trim()
  if(!normalized) return []
  const chunks: string[]=[]
  for(let start=0;start<normalized.length;start+=maxChars-overlap){
    const part=normalized.slice(start,start+maxChars).trim()
    if(part)chunks.push(part)
    if(start+maxChars>=normalized.length)break
  }
  return chunks
}

/** Embeddings must only run on server side with permitted data and secret key. */
export async function embedText(text: string, apiKey: string): Promise<number[]> {
  if(!apiKey) throw new Error('Embedding provider is not configured')
  const resp=await fetch('https://api.openai.com/v1/embeddings',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:'text-embedding-3-small',input:text})
  })
  if(!resp.ok)throw new Error(`Embedding request failed (${resp.status})`)
  const payload=await resp.json() as {data?:Array<{embedding:number[]}>}
  if(!Array.isArray(payload.data?.[0]?.embedding))throw new Error('Embedding response invalid')
  return payload.data[0].embedding
}

export async function retrieveContext(args:{
  actor:Identity;question:string;repository:KnowledgeRepository;embeddingKey:string
}): Promise<RetrievedChunk[]>{
  if(!args.question.trim())return []
  const vector=await embedText(args.question,args.embeddingKey)
  // Important: searchAuthorized is responsible for tenant, agent, sensitivity and expiration ACL.
  return args.repository.searchAuthorized({actor:args.actor,embedding:vector,query:args.question,limit:5})
}

export async function answerWithEvidence(args:{
  actor:Identity;question:string;repository:KnowledgeRepository;
  generator:AnswerGenerator;embeddingKey:string;promptVersion:string;
}):Promise<{answer:string;citations:RetrievedChunk[];humanHandoff:boolean}> {
  const chunks=await retrieveContext(args)
  if(!chunks.length){return {answer:'Não tenho uma orientação validada para esta situação. Vou encaminhar à equipe responsável.',citations:[],humanHandoff:true}}
  const answer=await args.generator.respond({agent:args.actor.agent,question:args.question,
    promptVersion:args.promptVersion,
    context:chunks.map(c=>({citation:c.citation,text:c.text}))})
  return {answer,citations:chunks,humanHandoff:false}
}

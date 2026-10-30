import React,{useState} from 'react'
import {BrainCircuit,FlaskConical,Play,ShieldCheck,X} from 'lucide-react'
import {buildMegaBrainObservation} from '../server/megabrain-observation.js'
import './megabrain-sandbox.css'

/**
 * Homologação local e determinística. Não transmite mensagens ou dados.
 * Usa o MESMO classificador do modo shadow, mas não chama shadowObserveMegaBrain.
 */
const scenarios={
 vida:{name:'Cotação de Seguro de Vida',agent:'murilo',text:'Quero uma cotação de seguro de vida.',reply:'Posso fazer algumas perguntas para entender o que você procura?',humanHandoff:false},
 inclusao:{name:'Inclusão no plano Saúde',agent:'clara',text:'Quero incluir um dependente no plano de saúde.',reply:'Pode informar o CPF do titular para validação?',humanHandoff:false},
 boleto:{name:'Boleto do Seguro Auto',agent:'clara',text:'Preciso da segunda via do boleto do meu seguro auto.',reply:'Qual é o vencimento que deseja consultar?',humanHandoff:false},
 reembolso:{name:'Reembolso Odontológico',agent:'clara',text:'Quero solicitar reembolso do meu plano odontológico.',reply:'Vou encaminhar para a equipe autorizada.',humanHandoff:true},
 saudacao:{name:'Apenas saudação',agent:'clara',text:'Oi, bom dia!',reply:'Olá! Como posso ajudar?',humanHandoff:false},
}
const topicLabels={cotacao:'Cotação',inclusao:'Inclusão',exclusao:'Exclusão',boleto:'Boleto / fatura',reembolso:'Reembolso',sinistro:'Sinistro',rede_credenciada:'Rede credenciada',alteracao_cadastral:'Alteração cadastral',nao_identificado:'Não identificado'}
const productLabels={vida:'Vida',saude:'Saúde',auto:'Auto',odontologico:'Odontológico',residencial:'Residencial',empresarial:'Empresarial',viagem:'Viagem',nao_identificado:'Não identificado'}
const stepLabels={validar_titular:'Validar titular',aguardar_cliente:'Aguardar resposta',acompanhar_encaminhamento:'Acompanhar encaminhamento',continuar_atendimento:'Continuar atendimento'}
const pendingLabels={validacao_pendente:'Validação pendente',resposta_pendente:'Resposta pendente',encaminhamento_proposto:'Encaminhamento proposto',nao_identificada:'Sem pendência identificada'}
const factLabels={assunto_identificado:'Assunto identificado',produto_mencionado:'Produto mencionado'}

export default function MegaBrainSandbox({onClose}){
 const [choice,setChoice]=useState('vida')
 const [result,setResult]=useState(undefined)
 const scenario=scenarios[choice]
 const execute=()=>{
  setResult(buildMegaBrainObservation({
   agent:scenario.agent,reply:scenario.reply,humanHandoff:scenario.humanHandoff,
   messages:[{direction:'inbound',author:'contact',text:scenario.text}]
  }))
 }
 return <section className="mbs-panel" aria-label="Teste seguro do MegaBrain">
  <div className="mbs-header">
   <div className="mbs-title"><FlaskConical size={22}/><div><strong>Laboratório de testes — MegaBrain</strong><p>Simule a classificação com mensagens fictícias, sem usar protocolos reais.</p></div></div>
   <button type="button" className="mbs-close" onClick={onClose} aria-label="Fechar laboratório"><X size={17}/></button>
  </div>
  <div className="mbs-safety"><ShieldCheck size={17}/> Modo simulado. Nenhum dado será gravado; os agentes e a captura automática permanecem inalterados.</div>
  <div className="mbs-workspace">
   <div className="mbs-chooser">
    <label htmlFor="mbs-scenario">Cenário fictício para testar</label>
    <select id="mbs-scenario" value={choice} onChange={e=>{setChoice(e.target.value);setResult(undefined)}}>
     {Object.entries(scenarios).map(([id,s])=><option key={id} value={id}>{s.name}</option>)}
    </select>
   </div>
   <div className="mbs-example">
    <small>Mensagem fictícia enviada pelo cliente</small>
    <p>“{scenario.text}”</p>
    <small>Resposta simulada da {scenario.agent==='clara'?'Clara':'equipe comercial (Murilo)'}</small>
    <p>“{scenario.reply}”</p>
   </div>
   <button type="button" className="mbs-run" onClick={execute}><Play size={15}/> Executar simulação</button>
  </div>
  {result===null&&<div className="mbs-output"><BrainCircuit size={19}/><p>Correto: uma saudação isolada não produz memória contextual artificial.</p></div>}
  {result&&<div className="mbs-output"><div className="mbs-output-title"><BrainCircuit size={20}/><strong>Resultado do classificador</strong><span>Inferido · não verificado</span></div>
   <div className="mbs-result-grid">
    <div><small>Assunto</small><b>{topicLabels[result.topic]||result.topic}</b></div>
    <div><small>Produto</small><b>{productLabels[result.product]||result.product}</b></div>
    <div><small>Pendência</small><b>{pendingLabels[result.pending]||result.pending}</b></div>
    <div><small>Próximo passo</small><b>{stepLabels[result.next_step]||result.next_step}</b></div>
   </div>
   <div className="mbs-facts"><small>Marcadores de contexto</small><p>{result.facts.map(f=>factLabels[f]||f).join(' · ')||'Nenhum'}</p></div>
  </div>}
  <p className="mbs-footnote">Este laboratório usa o classificador do MegaBrain V2 em modo local. Não testa a persistência no Supabase nem ativa a observação de mensagens reais. Para isso, será necessário homologar o controle de captura por protocolo.</p>
 </section>
}

/**
 * Roteiro SDR aprovado pela Phoenix, recebido em 24/11/2026.
 * Fonte: documento "Perguntas SDR", 20 produtos específicos / 2 linhas.
 * Apenas perguntas de qualificação: não substitui segurança, consentimento,
 * gestão do Junior, nem a necessidade de um consultor para dados sensíveis.
 * Perguntas originais com dois campos foram desdobradas em etapas naturais.
 */
const freeze=parts=>Object.freeze(Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,Object.freeze(v)])))
const QUESTIONNAIRES=Object.freeze({
 saude:freeze({
  principal:[
   'O plano seria somente para você ou para mais vidas?',
   'Seria pelo CPF ou CNPJ?',
   'Qual é seu plano atual, caso possua um?'
  ],
  cpf:[
   'Pode me informar as idades das pessoas que entrarão no plano?',
   'Em qual cidade você mora?',
   'Você tem alguma formação acadêmica? Dependendo da formação, podem existir opções de planos diferentes.'
  ],
  cnpj:[
   'Pode me informar o CNPJ da empresa?',
   'Quais são as idades das pessoas que entrarão no plano?',
   'Em qual cidade as pessoas utilizarão o plano?'
  ],
  geral:[
   'Está buscando melhor custo-benefício ou uma rede credenciada maior?',
   'Você tem preferência por algum hospital ou laboratório?'
  ]
 }),
 odonto:freeze({
  principal:[
   'O plano seria somente para você ou para mais vidas?',
   'Seria pelo CPF ou CNPJ?',
   'Qual é seu plano odontológico atual, caso possua um?'
  ],
  cpf:['Você gostaria do odonto básico ou de coberturas como clareamento, aparelho ou prótese?'],
  cnpj:[
   'Pode me informar o CNPJ da empresa?',
   'Quais são as idades das pessoas que entrarão no plano?',
   'Em qual cidade as pessoas utilizarão o plano?',
   'Você gostaria do odonto básico ou de coberturas como clareamento, aparelho ou prótese?'
  ]
 }),
 vida:freeze({
  principal:[
   'O seguro seria somente para você ou para mais vidas?',
   'Seria pelo CPF ou CNPJ?',
   'Qual é seu seguro de vida atual, caso possua um?'
  ],
  cpf:[
   'Qual é a sua data de nascimento?',
   'Qual é a sua profissão?',
   'Você é tabagista?',
   'Qual esporte radical pratica, caso pratique algum?',
   'Tem alguma doença grave ou preexistente?'
  ],
  cnpj:[
   'Pode me informar o CNPJ da empresa?',
   'Qual seria a quantidade de vidas seguradas?',
   'Você possui uma base de vidas para a cotação?',
   'Quantas pessoas estão afastadas na base de vidas, caso haja alguma?',
   'A empresa segue alguma Convenção Coletiva de Trabalho (CCT)?'
  ],
  geral_cpf:[
   'O seguro de vida seria voltado à proteção financeira ou familiar?',
   'Qual capital segurado você gostaria de contratar?'
  ],
  geral_cnpj:['Qual capital coletivo segurado você gostaria de contratar?']
 }),
 pet:freeze({
  principal:[
   'O plano de saúde seria para um pet?',
   'Qual é o nome do seu pet?'
  ],
  geral:[
   'Qual é a idade ou data de nascimento do pet?',
   'Qual é a raça do pet?',
   'Qual é o nome do tutor?',
   'Qual é o CPF do tutor?',
   'Qual é o endereço do tutor?',
   'Qual é o e-mail de contato?',
   'Qual é o celular para contato?'
  ]
 }),
 previdencia:freeze({
  principal:[
   'A previdência privada seria para você ou para outra pessoa?',
   'Qual é o seu principal objetivo: aposentadoria, formação de patrimônio, planejamento para os filhos ou sucessão?',
   'Você já possui algum plano de previdência privada atualmente?'
  ],
  sem_plano:[
   'Qual é a sua data de nascimento?',
   'Com qual idade pretende começar a utilizar o recurso acumulado?',
   'Qual valor pretende investir mensalmente?',
   'Qual valor pretende aportar inicialmente, caso queira fazer um aporte?',
   'Qual renda mensal gostaria de receber no futuro?'
  ],
  com_plano:[
   'Qual é a instituição financeira ou seguradora atual?',
   'Seu plano é PGBL ou VGBL?',
   'Qual é o saldo acumulado atualmente?',
   'Qual é o valor da sua contribuição mensal?',
   'Seu regime de tributação é progressivo ou regressivo?',
   'Está buscando portabilidade ou deseja contratar um novo plano?'
  ],
  outra_pessoa:[
   'Qual é o seu vínculo com essa pessoa?',
   'Qual é a data de nascimento dela?',
   'Qual valor pretende investir mensalmente?',
   'Com qual idade essa pessoa deverá ter acesso ao recurso?'
  ],
  tributarias:[
   'Você declara Imposto de Renda pelo modelo completo, simplificado ou é isento?',
   'Você contribui atualmente para o INSS ou algum regime próprio de previdência?'
  ],
  geral:[
   'Qual é seu perfil de investidor: conservador, moderado ou arrojado?',
   'Pretende manter o investimento a longo prazo ou pode precisar realizar resgates antecipados?',
   'Tem preferência por alguma seguradora ou instituição financeira?',
   'Está buscando rentabilidade, menor risco ou benefícios fiscais?'
  ]
 }),
 auto:freeze({
  principal:[
   'Qual é a marca, modelo e ano do veículo?',
   'Seria um seguro novo ou renovação?',
   'O veículo está no nome de pessoa física (CPF) ou jurídica (CNPJ)?',
   'Para localizar seu cadastro, pode informar o número do CPF ou CNPJ do titular, por favor?',
   'Pode me informar a placa do veículo? Se for zero-quilômetro sem placa, basta informar.'
  ],
  novo:[
   'Qual é a data de nascimento do principal condutor?',
   'Qual é o CEP onde o veículo pernoita?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Qual é a classe de bônus atual?',
   'Pode me encaminhar a apólice atual, por favor?'
  ],
  geral:[
   'O veículo é utilizado para fins particulares, comerciais ou transporte por aplicativo?',
   'Está buscando melhor custo-benefício ou proteção mais completa, com terceiros, vidros, carro reserva e assistência?'
  ]
 }),
 frota:freeze({
  principal:[
   'Pode me informar o CNPJ da empresa?',
   'Quantos veículos fazem parte da frota?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Pode me encaminhar a relação dos veículos com placa, marca, modelo e ano?',
   'Qual é o CEP da base principal onde os veículos permanecem?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual e a relação dos veículos?',
   'Houve algum sinistro nos últimos 12 meses?'
  ],
  geral:[
   'A frota é usada para transporte de cargas, serviços, passageiros ou uso administrativo?',
   'Está buscando redução de custos ou cobertura mais completa, com terceiros, vidros e assistência?'
  ]
 }),
 residencial:freeze({
  principal:[
   'O imóvel é uma casa ou apartamento?',
   'O imóvel é próprio ou alugado?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Pode me informar o CEP do imóvel?',
   'Qual é o valor aproximado de reconstrução do imóvel e dos bens que deseja proteger?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve algum sinistro nos últimos 12 meses?'
  ],
  geral:[
   'O imóvel é de residência habitual, veraneio ou está desocupado?',
   'Está buscando custo-benefício ou proteção mais completa, incluindo incêndio, roubo e danos elétricos?'
  ]
 }),
 fianca:freeze({
  principal:[
   'O imóvel é residencial ou comercial?',
   'A locação será por pessoa física (CPF) ou jurídica (CNPJ)?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Qual é o valor mensal do aluguel, condomínio e IPTU?',
   'Pode me informar o CEP do imóvel que pretende alugar?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve alteração nos valores do aluguel, condomínio ou IPTU?'
  ],
  geral:[
   'Qual é a renda mensal aproximada do locatário ou o faturamento da empresa?',
   'Haverá composição de renda?',
   'A imobiliária exige alguma cobertura específica, como pintura, multas ou encargos?'
  ]
 }),
 viagem:freeze({
  principal:[
   'Quantas pessoas vão viajar?',
   'Há viajantes acima de 70 anos?',
   'Qual é o destino da viagem?',
   'Qual é a data de ida?',
   'Qual é a data de volta?',
   'Vai praticar esportes radicais ou andar de moto durante a viagem?'
  ]
 }),
 bike:freeze({
  principal:[
   'Qual é a marca, modelo e ano da bicicleta?',
   'Qual é o valor aproximado da bicicleta?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'A bicicleta é convencional ou elétrica?',
   'Pode me encaminhar a nota fiscal ou comprovante de aquisição da bicicleta, caso tenha?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve algum sinistro nos últimos 12 meses?'
  ],
  geral:[
   'A bicicleta é utilizada para lazer, deslocamento, trabalho ou competições?',
   'Está buscando melhor custo-benefício ou proteção mais completa, incluindo roubo, danos e responsabilidade civil?'
  ]
 }),
 empresarial:freeze({
  principal:[
   'Pode me informar o CNPJ da empresa?',
   'Qual é o ramo de atividade da empresa?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Pode me informar o CEP do estabelecimento?',
   'O imóvel é próprio ou alugado?',
   'Qual é o valor aproximado do patrimônio a proteger, incluindo estrutura, equipamentos, máquinas e estoque?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve algum sinistro nos últimos 12 meses?'
  ],
  geral:[
   'A empresa tem proteção como alarme, câmeras, vigilância, extintores ou sprinklers?',
   'Está buscando custo-benefício ou coberturas mais completas, como incêndio, roubo e lucros cessantes?'
  ]
 }),
 equipamentos:freeze({
  principal:[
   'Qual tipo de equipamento deseja segurar: eletrônico, fotográfico, médico, industrial ou agrícola?',
   'O seguro será contratado por pessoa física (CPF) ou jurídica (CNPJ)?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Pode informar marca, modelo, ano e valor aproximado dos equipamentos?',
   'Possui nota fiscal ou comprovante de aquisição dos equipamentos?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve algum sinistro nos últimos 12 meses?'
  ],
  geral:[
   'Os equipamentos são utilizados em local fixo ou transportados para outros locais?',
   'Está buscando custo-benefício ou proteção mais completa, incluindo roubo, danos e transporte?'
  ]
 }),
 rc:freeze({
  principal:[
   'O seguro será contratado por pessoa física (CPF) ou jurídica (CNPJ)?',
   'Qual é sua profissão ou o ramo de atividade da empresa?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Quais atividades ou serviços são realizados e quais riscos deseja proteger?',
   'Qual é o valor da cobertura desejada?',
   'Existe alguma exigência contratual de valor mínimo?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve reclamação, sinistro ou processo relacionado à atividade?'
  ],
  geral:[
   'Qual é o faturamento anual aproximado da atividade ou da empresa?',
   'Está buscando melhor custo-benefício ou proteção mais completa para danos e despesas de defesa?'
  ]
 }),
 cyber:freeze({
  principal:[
   'Pode me informar o CNPJ da empresa?',
   'Qual é o ramo de atividade da empresa?',
   'Qual é o faturamento anual aproximado da empresa?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'A empresa armazena ou processa dados pessoais, financeiros ou sensíveis?',
   'A empresa utiliza antivírus, firewall, backups ou autenticação em dois fatores?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'A empresa já sofreu ataque cibernético, vazamento de dados ou incidente?'
  ],
  geral:[
   'A empresa depende de sistemas digitais, plataformas ou comércio eletrônico?',
   'Está buscando melhor custo-benefício ou proteção mais completa contra incidentes digitais?'
  ]
 }),
 garantia:freeze({
  principal:[
   'Pode me informar o CNPJ da empresa?',
   'Qual é o ramo de atividade da empresa?',
   'Qual modalidade de Seguro Garantia necessita: licitação, execução, judicial ou adiantamento?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Pode me encaminhar o contrato, edital ou documento que exige a garantia?',
   'Qual é o valor da garantia exigida?',
   'Qual é o prazo de vigência necessário?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'Houve alguma alteração no valor, prazo ou condições do contrato original?'
  ],
  geral:[
   'A garantia será para órgão público, empresa privada ou processo judicial?',
   'Existe prazo limite para apresentar ou emitir a apólice?'
  ]
 }),
 credito:freeze({
  principal:[
   'Pode me informar o CNPJ da empresa?',
   'Qual é o ramo de atividade da empresa?',
   'Qual é o faturamento anual aproximado da empresa?',
   'Seria um seguro novo ou renovação?'
  ],
  novo:[
   'Qual é o volume mensal aproximado de vendas a prazo?',
   'As vendas são nacionais, internacionais ou ambas?'
  ],
  renovacao:[
   'Qual é a seguradora atual?',
   'Qual é a data de vencimento da apólice?',
   'Pode me encaminhar a apólice atual, por favor?',
   'A empresa teve perdas por inadimplência nos últimos 12 meses?'
  ],
  geral:[
   'Qual é o prazo médio de pagamento concedido aos clientes?',
   'Deseja proteger toda a carteira ou determinados compradores contra inadimplência?'
  ]
 })
})
export const SDR_PRODUCT_CODES=Object.freeze([
 'saude','saude_empresarial','odonto','odonto_empresarial','vida','vida_grupo',
 'pet','previdencia','auto','frota','residencial','fianca','viagem','bike',
 'empresarial','equipamentos','rc','cyber','garantia','credito'
])
export const SDR_QUESTIONNAIRES=QUESTIONNAIRES
const ALIASES=Object.freeze({
 saude_empresarial:'saude',odonto_empresarial:'odonto',vida_grupo:'vida'
})
export function approvedQuestionsFor(product,{type=null,renewal=null,hasPlan=null,thirdParty=false}={}){
 const base=QUESTIONNAIRES[ALIASES[product]||product]
 if(!base)return []
 const groups=['principal']
 if(product==='previdencia'){
  if(thirdParty)groups.push('outra_pessoa')
  else if(hasPlan===true)groups.push('com_plano')
  else if(hasPlan===false)groups.push('sem_plano')
  groups.push('tributarias','geral')
 }else{
  if(type==='cpf'&&base.cpf)groups.push('cpf')
  if(type==='cnpj'&&base.cnpj)groups.push('cnpj')
  if(renewal===true&&base.renovacao)groups.push('renovacao')
  if(renewal===false&&base.novo)groups.push('novo')
  if(base.geral_cpf&&type==='cpf')groups.push('geral_cpf')
  if(base.geral_cnpj&&type==='cnpj')groups.push('geral_cnpj')
  if(base.geral)groups.push('geral')
 }
 return groups.flatMap(group=>(base[group]||[]).map((text,i)=>({
  id:product+':'+group+':'+(i+1),text,group,
  sensitive: /(?:doenca grave|preexistente|cpf do tutor|endereco do tutor)/i.test(text)
 })))
}

/** Contrato EXCLUSIVO com o sistema de gestão do Junior.
 * O CRM LEADS não participa dessa integração. O 4Zapy pertence ao Junior.
 */
export type ActorContext = {tenantId:string;userId:string;agent:'clara'|'murilo';scopes:string[]}
export type ContactSummary = {id:string;displayName?:string;clientId?:string;phoneE164:string}
export type ClientSummary = {id:string;displayName:string;companyId?:string}
export type PolicySummary = {id:string;product:string;status:string;clientId:string}
export type TicketSummary = {id:string;subject:string;status:string;updatedAt:string;resolutionSummary?:string}
export type NewTicket = {clientId:string;subject:string;category:string;summary:string;requestId:string}
export type TicketTransfer = {ticketId:string;destination:{type:'department'|'user'|'agent';id:string};reason:string;summary:string;requestId:string}
export type TicketTransferResult = {ticketId:string;status:'transferred'|'pending_approval'|'rejected';assignedTo?:string}
export type AgentDecision = {agent:'clara'|'murilo';reply:string;citations:string[];humanHandoff:boolean;proposedAction?:{type:'ticket.create'|'ticket.transfer'|'ticket.comment';arguments:unknown}}
export interface ManagementAdapter {
  resolveContact(phoneE164:string,context:ActorContext):Promise<ContactSummary|null>
  getClient(clientId:string,context:ActorContext):Promise<ClientSummary>
  getPolicies(clientId:string,context:ActorContext):Promise<PolicySummary[]>
  createTicket(input:NewTicket,context:ActorContext):Promise<TicketSummary>
  transferTicket(input:TicketTransfer,context:ActorContext):Promise<TicketTransferResult>
  listResolvedTickets(since:string,context:ActorContext):Promise<TicketSummary[]>
}
export class DisconnectedManagementAdapter implements ManagementAdapter {
  private unavailable():never{throw new Error('A API de gestão do Junior ainda não foi conectada')}
  async resolveContact():Promise<ContactSummary|null>{return this.unavailable()}
  async getClient():Promise<ClientSummary>{return this.unavailable()}
  async getPolicies():Promise<PolicySummary[]>{return this.unavailable()}
  async createTicket():Promise<TicketSummary>{return this.unavailable()}
  async transferTicket():Promise<TicketTransferResult>{return this.unavailable()}
  async listResolvedTickets():Promise<TicketSummary[]>{return this.unavailable()}
}

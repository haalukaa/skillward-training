/** @typedef {{email:string, role:string, departmentId?:string}} InvitationRequest */
/** @typedef {{ok:boolean, message:string}} InvitationResponse */
export class InvitationService {
  /** @param {InvitationRequest} _request @returns {Promise<InvitationResponse>} */
  async invite(_request) {
    return { ok: false, message: "Staff invitations are not available in this development integration. A protected Management service must be deployed first." };
  }
}

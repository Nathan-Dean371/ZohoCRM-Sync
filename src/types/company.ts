// DEPRECATED: Company UI/management removed — retained only for DB relations and internal scripts.
// Provisioning and edits should be performed via admin/migration scripts; no in-app create/edit flows.
export interface Company {
  name: string;
  website?: string;
  primary_contact_phone: string;
  primary_contact_email: string;
}
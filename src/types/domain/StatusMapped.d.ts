import { DBStatusCatalog } from "../db/status_catalog";

export interface StatusMapped {
  [key: string]: DBStatusCatalog[];
}

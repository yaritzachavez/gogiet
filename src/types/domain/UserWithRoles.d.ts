import { DBUser } from "../db/users";
import { DBRole } from "../db/roles";

export interface UserWithRoles extends DBUser {
  roles: DBRole[];
}

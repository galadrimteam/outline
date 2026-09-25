import { Database, User } from "@server/models";
import { allow, can } from "./cancan";
import { and, isTeamModel, isTeamMutable } from "./utils";

// A database has no rights of its own: it follows its anchor, the home document
// when there is one, else the collection. A deleted home document is not
// loaded by `Database.findByPkForUser`, which leaves the database unreadable
// rather than falling back to the collection.

allow(User, "read", Database, (actor, database) =>
  and(
    isTeamModel(actor, database),
    database?.documentId
      ? can(actor, "read", database.document)
      : can(actor, "readDocument", database?.collection)
  )
);

allow(User, "update", Database, (actor, database) =>
  and(
    isTeamModel(actor, database),
    isTeamMutable(actor),
    database?.documentId
      ? can(actor, "update", database.document)
      : can(actor, "updateDocument", database?.collection)
  )
);

allow(User, "delete", Database, (actor, database) =>
  and(
    //
    !actor.isGuest,
    can(actor, "update", database)
  )
);

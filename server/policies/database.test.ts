import {
  CollectionPermission,
  DocumentPermission,
  UserRole,
} from "@shared/types";
import { Database, UserMembership } from "@server/models";
import {
  buildAdmin,
  buildCollection,
  buildDatabase,
  buildDocument,
  buildTeam,
  buildUser,
} from "@server/test/factories";
import { withAPIContext } from "@server/test/support";
import { serialize } from "./index";

async function loadFor(database: Database, userId: string) {
  return Database.findByPkForUser(database.id, userId);
}

describe("database policy", () => {
  describe("anchored on a document", () => {
    it("gives a reader read access only", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.Read,
      });
      const document = await buildDocument({
        teamId: team.id,
        collectionId: collection.id,
      });
      const database = await buildDatabase({
        teamId: team.id,
        documentId: document.id,
      });

      const abilities = serialize(user, await loadFor(database, user.id));
      expect(abilities.read).toBeTruthy();
      expect(abilities.update).toBeFalsy();
      expect(abilities.delete).toBeFalsy();
    });

    it("gives an editor every right", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.ReadWrite,
      });
      const document = await buildDocument({
        teamId: team.id,
        collectionId: collection.id,
      });
      const database = await buildDatabase({
        teamId: team.id,
        documentId: document.id,
      });

      const abilities = serialize(user, await loadFor(database, user.id));
      expect(abilities.read).toBeTruthy();
      expect(abilities.update).toBeTruthy();
      expect(abilities.delete).toBeTruthy();
    });

    it("follows a guest's membership of the home document", async () => {
      const team = await buildTeam();
      const guest = await buildUser({ teamId: team.id, role: UserRole.Guest });
      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.ReadWrite,
      });
      const document = await buildDocument({
        teamId: team.id,
        collectionId: collection.id,
      });
      const database = await buildDatabase({
        teamId: team.id,
        documentId: document.id,
      });

      expect(serialize(guest, await loadFor(database, guest.id)).read).toBe(
        false
      );

      const membership = await UserMembership.create({
        documentId: document.id,
        userId: guest.id,
        createdById: guest.id,
        permission: DocumentPermission.Read,
      });
      let abilities = serialize(guest, await loadFor(database, guest.id));
      expect(abilities.read).toEqual([membership.id]);
      expect(abilities.update).toBe(false);

      membership.permission = DocumentPermission.ReadWrite;
      await membership.save();
      abilities = serialize(guest, await loadFor(database, guest.id));
      expect(abilities.read).toBeTruthy();
      expect(abilities.update).toBeTruthy();
      expect(abilities.delete).toBe(false);
    });

    it("gives nothing to a member outside a private collection", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const collection = await buildCollection({
        teamId: team.id,
        permission: null,
      });
      const document = await buildDocument({
        teamId: team.id,
        collectionId: collection.id,
      });
      const database = await buildDatabase({
        teamId: team.id,
        documentId: document.id,
      });

      const abilities = serialize(user, await loadFor(database, user.id));
      expect(abilities.read).toBe(false);
      expect(abilities.update).toBe(false);
      expect(abilities.delete).toBe(false);
    });

    it("gives nothing to a user of another team, even an admin", async () => {
      const admin = await buildAdmin();
      const database = await buildDatabase();

      const abilities = serialize(admin, await loadFor(database, admin.id));
      expect(abilities.read).toBe(false);
      expect(abilities.update).toBe(false);
    });

    it("gives nothing once the home document is deleted", async () => {
      const team = await buildTeam();
      const user = await buildUser({ teamId: team.id });
      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.ReadWrite,
      });
      const document = await buildDocument({
        teamId: team.id,
        collectionId: collection.id,
      });
      const database = await buildDatabase({
        teamId: team.id,
        documentId: document.id,
      });
      await withAPIContext(user, (ctx) => document.destroyWithCtx(ctx));

      const loaded = await loadFor(database, user.id);
      expect(loaded?.document).toBeNull();
      const abilities = serialize(user, loaded);
      expect(abilities.read).toBe(false);
      expect(abilities.update).toBe(false);
      expect(abilities.delete).toBe(false);
    });
  });

  describe("anchored on a collection", () => {
    it("follows the collection's document rights", async () => {
      const team = await buildTeam();
      const member = await buildUser({ teamId: team.id });
      const viewer = await buildUser({
        teamId: team.id,
        role: UserRole.Viewer,
      });
      const collection = await buildCollection({
        teamId: team.id,
        permission: CollectionPermission.ReadWrite,
      });
      const database = await buildDatabase({
        teamId: team.id,
        collectionId: collection.id,
      });

      const memberAbilities = serialize(
        member,
        await loadFor(database, member.id)
      );
      expect(memberAbilities.read).toBeTruthy();
      expect(memberAbilities.update).toBeTruthy();
      expect(memberAbilities.delete).toBeTruthy();

      const viewerAbilities = serialize(
        viewer,
        await loadFor(database, viewer.id)
      );
      expect(viewerAbilities.read).toBeTruthy();
      expect(viewerAbilities.update).toBe(false);
    });

    it("gives nothing to a guest without membership", async () => {
      const team = await buildTeam();
      const guest = await buildUser({ teamId: team.id, role: UserRole.Guest });
      const database = await buildDatabase({ teamId: team.id });

      const abilities = serialize(guest, await loadFor(database, guest.id));
      expect(abilities.read).toBe(false);
      expect(abilities.update).toBe(false);
    });
  });
});

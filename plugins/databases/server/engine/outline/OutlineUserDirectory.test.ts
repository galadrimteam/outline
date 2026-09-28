import { buildTeam, buildUser } from "@server/test/factories";
import { engineEmailFor } from "../../utils/actor";
import { OutlineUserDirectory } from "./OutlineUserDirectory";

describe("OutlineUserDirectory", () => {
  const directory = new OutlineUserDirectory();

  it("gives team members their Outline id and others an email id", async () => {
    const team = await buildTeam();
    const member = await buildUser({ teamId: team.id });
    const stranger = await buildUser();

    const ids = await directory.ensureUsers(team.id, [
      { email: engineEmailFor(member).toUpperCase(), name: member.name },
      { email: engineEmailFor(stranger), name: stranger.name },
      { email: "Guest@Example.com", name: "Guest" },
    ]);

    expect(ids.get(engineEmailFor(member))).toBe(member.id);
    expect(ids.get(engineEmailFor(stranger))).toBe(
      `email:${engineEmailFor(stranger)}`
    );
    expect(ids.get("guest@example.com")).toBe("email:guest@example.com");
  });

  it("names engine users, members of the team or not", async () => {
    const team = await buildTeam();
    const member = await buildUser({ teamId: team.id });
    const other = await buildUser();

    const people = await directory.describe(team.id, [
      member.id,
      other.id,
      "email:guest@example.com",
    ]);

    expect(people.get(member.id)).toEqual({
      id: member.id,
      title: member.name,
      email: engineEmailFor(member),
    });
    expect(people.has(other.id)).toBe(false);
    expect(people.get("email:guest@example.com")).toEqual({
      id: "email:guest@example.com",
      title: "guest@example.com",
      email: "guest@example.com",
    });
  });
});

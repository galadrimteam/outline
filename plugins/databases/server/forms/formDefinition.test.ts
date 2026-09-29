import type { DatabaseView } from "@shared/databases/types";
import { DatabaseLayout } from "@shared/databases/types";
import { Database } from "@server/models";
import env from "../env";
import { formDefinition } from "./formDefinition";

const view: DatabaseView = {
  id: "viwForm",
  name: "Feedback",
  type: "form",
  layout: DatabaseLayout.Form,
  order: 0,
  filter: null,
  sort: null,
  group: null,
  columnMeta: {},
  options: {
    coverUrl: "/api/attachments/read/public/table/cover",
    logoUrl: "https://cdn.example.com/logo.png",
  },
  overrides: {},
  isLocked: false,
};

const audience = { canSubmit: true, allowPeople: false };

describe("formDefinition", () => {
  const previous = env.TEABLE_PUBLIC_URL;

  beforeEach(() => {
    env.TEABLE_PUBLIC_URL = "https://teable.example.com";
  });

  afterEach(() => {
    env.TEABLE_PUBLIC_URL = previous;
  });

  it("points the paths of a Teable database at Teable", () => {
    const database = Database.build({ title: "Feedback", engine: "teable" });

    const definition = formDefinition(database, view, [], {}, audience);

    expect(definition.coverUrl).toEqual(
      "https://teable.example.com/api/attachments/read/public/table/cover"
    );
    expect(definition.logoUrl).toEqual("https://cdn.example.com/logo.png");
  });

  it("leaves the paths of an Outline engine database to Outline", () => {
    const database = Database.build({ title: "Feedback", engine: "outline" });

    const definition = formDefinition(
      database,
      { ...view, options: { coverUrl: "/api/attachments.redirect?id=1" } },
      [],
      {},
      audience
    );

    expect(definition.coverUrl).toEqual("/api/attachments.redirect?id=1");
    expect(definition.logoUrl).toBeNull();
  });
});

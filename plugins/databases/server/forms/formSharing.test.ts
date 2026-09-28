import { presentFormSharing, withFormSharing } from "./formSharing";

describe("withFormSharing", () => {
  it("gives a form its address when it is made public, keeping the view's overrides", () => {
    const settings = withFormSharing(
      { viewOverrides: { viwForm: { cardSize: "large" } } },
      "viwForm",
      { public: true, successMessage: "Merci !" }
    );
    const overrides = settings.viewOverrides?.viwForm;
    expect(overrides?.cardSize).toEqual("large");
    expect(overrides?.form?.public).toBe(true);
    expect(overrides?.form?.slug).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(overrides?.form?.successMessage).toEqual("Merci !");
  });

  it("keeps the address when sharing stops, and replaces it on demand", () => {
    const shared = withFormSharing({}, "viwForm", { public: true });
    const slug = shared.viewOverrides?.viwForm?.form?.slug;
    const stopped = withFormSharing(shared, "viwForm", { public: false });
    expect(stopped.viewOverrides?.viwForm?.form?.slug).toEqual(slug);
    const reset = withFormSharing(stopped, "viwForm", { resetLink: true });
    expect(reset.viewOverrides?.viwForm?.form?.slug).not.toEqual(slug);
  });

  it("presents the public address only while the form is public", () => {
    expect(
      presentFormSharing("viwForm", { public: true, slug: "abcdefgh" }).url
    ).toEqual("/f/abcdefgh");
    expect(
      presentFormSharing("viwForm", { public: false, slug: "abcdefgh" }).url
    ).toBeNull();
  });
});

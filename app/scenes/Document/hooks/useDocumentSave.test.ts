import {
  incomingTitleAction,
  shouldAutoDeleteDraftOnUnmount,
} from "./useDocumentSave";

describe("shouldAutoDeleteDraftOnUnmount", () => {
  const baseOptions = {
    title: "",
    createdById: "user-1",
    currentUserId: "user-1",
    isDraft: true,
    isActive: true,
    hasEmptyTitle: true,
    isPersistedOnce: true,
  };

  it("does not auto delete drafts with non-empty editor content", () => {
    expect(
      shouldAutoDeleteDraftOnUnmount({
        ...baseOptions,
        isEditorEmpty: false,
      })
    ).toBe(false);
  });

  it("auto deletes drafts that are still empty and untitled", () => {
    expect(
      shouldAutoDeleteDraftOnUnmount({
        ...baseOptions,
        isEditorEmpty: true,
      })
    ).toBe(true);
  });
});

describe("incomingTitleAction", () => {
  it("shows a title renamed elsewhere when nothing typed is waiting", () => {
    expect(
      incomingTitleAction({
        incoming: "Renamed from the table",
        typed: "My card",
        saved: "My card",
      })
    ).toBe("adopt");
  });

  it("keeps and saves what is typed while the server still answers an older title", () => {
    expect(
      incomingTitleAction({ incoming: "My ca", typed: "My card", saved: "My" })
    ).toBe("keepAndSave");
  });

  it("keeps the spaces typed at the ends, which the server trims", () => {
    expect(
      incomingTitleAction({ incoming: "My", typed: "My ", saved: "My " })
    ).toBe("keep");
  });

  it("ignores its own title", () => {
    expect(
      incomingTitleAction({ incoming: "My card", typed: "My card", saved: "" })
    ).toBe("ignore");
  });
});

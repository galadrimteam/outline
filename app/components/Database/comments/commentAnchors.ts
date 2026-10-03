import type { JSONValue, ProsemirrorData } from "@shared/types";

/**
 * The passages the comment threads of a page are anchored to, read from its stored content
 * (where no editor holds it): the text under each thread's comment mark, empty for a mark on an
 * image.
 *
 * @param data the content of the page.
 * @returns the anchored text by thread id; the threads absent are page discussions.
 */
export function commentAnchors(
  data: ProsemirrorData | undefined
): Map<string, string> {
  const anchors = new Map<string, string>();
  const visit = (node: ProsemirrorData) => {
    const marks = [
      ...(node.marks ?? []),
      ...markList(node.attrs?.marks),
    ].filter((mark) => mark.type === "comment");
    for (const mark of marks) {
      const id = mark.attrs?.id;
      if (typeof id === "string") {
        anchors.set(id, (anchors.get(id) ?? "") + (node.text ?? ""));
      }
    }
    node.content?.forEach(visit);
  };
  if (data) {
    visit(data);
  }
  return anchors;
}

/** The marks an image keeps in its attributes. */
function markList(
  value: JSONValue
): { type: string; attrs?: { id?: JSONValue } }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((mark) =>
    mark &&
    typeof mark === "object" &&
    !Array.isArray(mark) &&
    typeof mark.type === "string"
      ? [
          {
            type: mark.type,
            attrs: isObject(mark.attrs) ? mark.attrs : undefined,
          },
        ]
      : []
  );
}

function isObject(value: JSONValue): value is { [x: string]: JSONValue } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

import { findNodes, parser, serializer } from "../../test/editor";

// galadrim: tests for the hardened label parsing of attachment links.
const href =
  "/api/attachments.redirect?id=a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const parse = (label: string) => {
  const ast = parser.parse(`[${label}](${href})`);
  const json = ast?.toJSON();
  return {
    ast,
    attachments: findNodes(json, "attachment"),
    videos: findNodes(json, "video"),
  };
};

describe("attachment links", () => {
  it("parses a title followed by a size in bytes", () => {
    const { attachments, videos } = parse("Annual report.pdf 5991");

    expect(videos).toHaveLength(0);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].attrs?.title).toBe("Annual report.pdf");
    expect(attachments[0].attrs?.size).toBe("5991");
    expect(attachments[0].attrs?.href).toBe(href);
  });

  it("parses a title followed by dimensions as a video", () => {
    const { attachments, videos } = parse("Demo recording.mp4 1280x720");

    expect(attachments).toHaveLength(0);
    expect(videos).toHaveLength(1);
    expect(videos[0].attrs?.title).toBe("Demo recording.mp4");
    expect(videos[0].attrs?.width).toBe(1280);
    expect(videos[0].attrs?.height).toBe(720);
  });

  it("parses a video written without dimensions", () => {
    const { attachments, videos } = parse("Demo recording.mp4 x");

    expect(attachments).toHaveLength(0);
    expect(videos).toHaveLength(1);
    expect(videos[0].attrs?.title).toBe("Demo recording.mp4");
  });

  it.each([
    "report.docx",
    "Budget 2024.xlsx",
    "Slides final.pptx",
    "export.txt",
  ])("keeps %s a file with its whole name", (label) => {
    const { attachments, videos } = parse(label);

    expect(videos).toHaveLength(0);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].attrs?.title).toBe(label);
    expect(attachments[0].attrs?.size).toBe("0");
  });

  it("keeps the last word of a name that is not a size", () => {
    const { attachments } = parse("Compte rendu final");

    expect(attachments[0].attrs?.title).toBe("Compte rendu final");
  });

  it("survives a round trip through the serializer", () => {
    const { ast } = parse("Budget 2024.xlsx 1024");
    const again = parser.parse(serializer.serialize(ast))?.toJSON();
    const [attachment] = findNodes(again, "attachment");

    expect(attachment.attrs?.title).toBe("Budget 2024.xlsx");
    expect(attachment.attrs?.size).toBe("1024");
  });
});

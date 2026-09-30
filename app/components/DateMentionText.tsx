import styled from "styled-components";
import { s } from "@shared/styles";
import { splitDateMentions } from "@shared/utils/dateMention";

interface Props {
  /** A page or row title. */
  text: string;
}

/**
 * A title with its date mentions in grey, as Notion draws « Point de suivi @25 août 2026 ».
 *
 * @param props the title.
 * @returns the title.
 */
export function DateMentionText({ text }: Props) {
  return (
    <>
      {splitDateMentions(text).map((part, index) =>
        part.isDate ? (
          <DateMention key={index}>{part.text}</DateMention>
        ) : (
          part.text
        )
      )}
    </>
  );
}

const DateMention = styled.span`
  color: ${s("textTertiary")};
`;

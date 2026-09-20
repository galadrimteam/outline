import styled from "styled-components";
import DocumentMeta from "~/components/DocumentMeta";
import { headerMetaStyles } from "~/components/HeaderMeta";

/**
 * The meta line of a document — who edited it and when.
 *
 * galadrim: it no longer sits under the title of a document, where Notion
 * shows nothing (see HeaderInfo for the discreet "Edited <time>" of the top
 * bar). Only the viewer of a past revision still renders it, the component
 * that wrapped it with comment and viewer counts is gone with the meta line.
 */
export const Meta = styled(DocumentMeta)<{ $rtl?: boolean }>`
  ${headerMetaStyles}
`;

import { IconTitleWrapper } from "@shared/components/Icon";
import breakpoint from "styled-components-breakpoint";
import { first } from "es-toolkit/compat";
import { Suspense, useCallback } from "react";
import styled from "styled-components";
import { CollectionValidation } from "@shared/validations";
import { isRTL } from "@shared/utils/rtl";
import Heading from "~/components/Heading";
import ContentEditable from "~/components/ContentEditable";
import CollectionIcon from "~/components/Icons/CollectionIcon";
import type Collection from "~/models/Collection";
import { colorPalette } from "@shared/constants";
import usePolicy from "~/hooks/usePolicy";
import { observer } from "mobx-react";
import lazyWithRetry from "~/utils/lazyWithRetry";
import {
  pageIconSize,
  pageTitleStyles,
} from "~/scenes/Document/components/pageTitle";

const IconPicker = lazyWithRetry(() => import("~/components/IconPicker"));

type Props = {
  /** The collection for which to render a header */
  collection: Collection;
  /** Whether the header is in editing mode */
  isEditing?: boolean;
};

export const Header = observer(function Header_({
  collection,
  isEditing,
}: Props) {
  const can = usePolicy(collection);
  const canEdit = can.update && isEditing;
  const handleIconChange = useCallback(
    (icon: string | null, color: string | null) =>
      collection?.save({ icon, color }),
    [collection]
  );

  const handleTitleChange = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length > 0 && trimmed !== collection.name) {
        void collection.save({ name: trimmed });
      }
    },
    [collection]
  );

  const fallbackIcon = collection ? (
    <CollectionIcon collection={collection} size={pageIconSize} expanded />
  ) : null;

  const dir = isRTL(collection.name) ? "rtl" : "ltr";

  return (
    <StyledHeading dir={dir} $containsIcon>
      <IconTitleWrapper dir={dir} $above={pageIconSize}>
        {canEdit ? (
          <Suspense fallback={fallbackIcon}>
            <IconPicker
              icon={collection.icon ?? "collection"}
              color={collection.color ?? (first(colorPalette) as string)}
              initial={collection.initial}
              size={pageIconSize}
              popoverPosition="bottom-start"
              onChange={handleIconChange}
              borderOnHover
            >
              {fallbackIcon}
            </IconPicker>
          </Suspense>
        ) : (
          fallbackIcon
        )}
      </IconTitleWrapper>
      {canEdit ? (
        <ContentEditable
          value={collection.name}
          onChange={handleTitleChange}
          maxLength={CollectionValidation.maxNameLength}
          dir="auto"
        />
      ) : (
        collection.name
      )}
    </StyledHeading>
  );
});

const StyledHeading = styled(Heading)<{ $containsIcon: boolean }>`
  display: flex;
  align-items: center;
  position: relative;
  margin-left: 16px;

  ${breakpoint("tablet")`
    margin-left: 0;
  `}

  // galadrim: same title block as a document (big icon above the title, same
  // typography and position), a collection is a page like any other in Notion.
  ${pageTitleStyles}
`;

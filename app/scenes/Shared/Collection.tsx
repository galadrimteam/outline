import { observer } from "mobx-react";
import { EditIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { IconTitleWrapper } from "@shared/components/Icon";
import useShare from "@shared/hooks/useShare";
import type CollectionModel from "~/models/Collection";
import { Action } from "~/components/Actions";
import Button from "~/components/Button";
import CenteredContent from "~/components/CenteredContent";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import CollectionIcon from "~/components/Icons/CollectionIcon";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import Time from "~/components/Time";
import Tooltip from "~/components/Tooltip";
import useMobile from "~/hooks/useMobile";
import usePolicy from "~/hooks/usePolicy";
import { collectionPath } from "~/utils/routeHelpers";
import Overview from "../Collection/components/Overview";
import {
  pageIconSize,
  pageTitleStyles,
} from "../Document/components/pageTitle";
import { AppearanceAction } from "~/components/Sharing/components/Actions";

type Props = {
  collection: CollectionModel;
};

function SharedCollection({ collection }: Props) {
  const { t } = useTranslation();
  const { shareId, showLastUpdated } = useShare();
  const can = usePolicy(collection);
  const isMobile = useMobile();

  const editAction = (
    <Action>
      <Tooltip content={t("Edit collection")} shortcut="e" placement="bottom">
        <Button
          as={Link}
          icon={<EditIcon />}
          to={{
            pathname: collectionPath(collection, "overview"),
          }}
          aria-label={t("Edit collection")}
          neutral
        >
          {isMobile ? null : t("Edit")}
        </Button>
      </Tooltip>
    </Action>
  );

  return (
    <Scene
      centered={false}
      textTitle={collection.name}
      left={<div />}
      title={
        <>
          <CollectionIcon collection={collection} expanded />
          &nbsp;{collection.name}
        </>
      }
      actions={
        <>
          <AppearanceAction />
          {can.update ? editAction : null}
        </>
      }
    >
      <CenteredContent withStickyHeader>
        <Flex column>
          {/* galadrim: the same title block as in the app — a page publicly
              shared has to read like the page it is. */}
          <CollectionHeading $containsIcon>
            <IconTitleWrapper $above={pageIconSize}>
              <CollectionIcon
                collection={collection}
                size={pageIconSize}
                expanded
              />
            </IconTitleWrapper>
            {collection.name}
          </CollectionHeading>
          {!!shareId && showLastUpdated && !!collection.updatedAt ? (
            <SharedMeta type="tertiary">
              {t("Last updated")}{" "}
              <Time dateTime={collection.updatedAt} addSuffix />
            </SharedMeta>
          ) : null}
        </Flex>
        <Overview collection={collection} key={collection.id} readOnly />
      </CenteredContent>
    </Scene>
  );
}

const CollectionHeading = styled(Heading)<{ $containsIcon: boolean }>`
  display: flex;
  align-items: center;
  position: relative;
  margin-left: 16px;

  ${breakpoint("tablet")`
    margin-left: 0;
  `}

  ${pageTitleStyles}
`;

const SharedMeta = styled(Text)`
  margin: -12px 0 2em 0;
  font-size: 14px;
`;

export const Collection = observer(SharedCollection);

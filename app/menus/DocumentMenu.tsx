import { noop } from "es-toolkit/compat";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { s } from "@shared/styles";
import { SubscriptionType, UserPreference } from "@shared/types";
import type Document from "~/models/Document";
import type Template from "~/models/Template";
import { useDocumentContext } from "~/components/DocumentContext";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import { OverflowMenuButton } from "~/components/Menu/OverflowMenuButton";
import Switch from "~/components/Switch";
import Time from "~/components/Time";
import { ActionContextProvider } from "~/hooks/useActionContext";
import useCurrentUser from "~/hooks/useCurrentUser";
import { useDocumentActiveModels } from "~/hooks/useDocumentActiveModels";
import { useFormatNumber } from "~/hooks/useFormatNumber";
import useMobile from "~/hooks/useMobile";
import usePolicy from "~/hooks/usePolicy";
import useRequest from "~/hooks/useRequest";
import useStores from "~/hooks/useStores";
import { MenuSeparator } from "~/components/primitives/components/Menu";
import { useDocumentMenuAction } from "~/hooks/useDocumentMenuAction";

type Props = {
  /** Document for which the menu is to be shown */
  document: Document;
  /** Alignment w.r.t trigger - defaults to start */
  align?: "start" | "end";
  /** Trigger's variant - renders nude variant if unset */
  neutral?: boolean;
  /**
   * Pass true if the document is currently being displayed. galadrim: this is
   * also what makes the menu the "…" of the page, trimmed to Notion's entries
   * (see useDocumentMenuAction); every other caller gets the upstream menu.
   */
  showDisplayOptions?: boolean;
  /** Invoked when the "Find and replace" menu item is clicked */
  onFindAndReplace?: () => void;
  /** Callback when a template is selected to apply its content to the document */
  onSelectTemplate?: (template: Template) => void;
  /** Invoked when the "Rename" menu item is clicked */
  onRename?: () => void;
  /** Invoked when menu is opened */
  onOpen?: () => void;
  /** Invoked when menu is closed */
  onClose?: () => void;
};

function DocumentMenu({
  document,
  align,
  neutral,
  showDisplayOptions,
  onSelectTemplate,
  onRename,
  onOpen,
  onClose,
  onFindAndReplace,
}: Props) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isMobile = useMobile();
  const can = usePolicy(document);

  const { subscriptions, pins } = useStores();
  const activeModels = useDocumentActiveModels(document);

  const {
    loading: auxDataLoading,
    loaded: auxDataLoaded,
    request: auxDataRequest,
  } = useRequest(() =>
    Promise.all([
      subscriptions.fetchOne({
        documentId: document.id,
        event: SubscriptionType.Document,
      }),
      document.collectionId
        ? subscriptions.fetchOne({
            collectionId: document.collectionId,
            event: SubscriptionType.Document,
          })
        : noop,
      pins.fetchOne({
        documentId: document.id,
        collectionId: document.collectionId ?? null,
      }),
    ])
  );

  const handlePointerEnter = React.useCallback(() => {
    if (!auxDataLoading && !auxDataLoaded) {
      void auxDataRequest();
      void document.loadRelations();
    }
  }, [auxDataLoading, auxDataLoaded, auxDataRequest, document]);

  const handleFullWidthToggle = React.useCallback(
    (checked: boolean) => {
      user.setPreference(UserPreference.FullWidthDocuments, checked);
      void user.save();
      document.fullWidth = checked;
      void document.save({ fullWidth: checked });
    },
    [user, document]
  );

  const rootAction = useDocumentMenuAction({
    documentId: document.id,
    isViewing: showDisplayOptions,
    variant: showDisplayOptions ? "page" : "context",
    onFindAndReplace,
    onRename,
    onSelectTemplate,
  });

  // galadrim: of the display options only "Full width" is left, the one a Notion
  // page has. Heading numbering stays in the command bar (Ctrl+K), the "viewer
  // insights" and "embeds" switches have no Notion equivalent. The menu of the
  // document being viewed ends, as in Notion, with its word count and last edit.
  const toggleSwitches = React.useMemo<React.ReactNode>(() => {
    if (!can.update || !showDisplayOptions || isMobile) {
      return;
    }

    return (
      <DisplayOptions>
        <Style>
          <ToggleMenuItem
            width={26}
            height={14}
            label={t("Full width")}
            labelPosition="left"
            checked={document.fullWidth}
            onChange={handleFullWidthToggle}
          />
        </Style>
      </DisplayOptions>
    );
  }, [
    t,
    can.update,
    document.fullWidth,
    isMobile,
    showDisplayOptions,
    handleFullWidthToggle,
  ]);

  // galadrim: a separator is only drawn for a block that actually renders —
  // the display options are hidden on mobile and for anyone who cannot edit,
  // and an empty block would leave a rule hanging over the footer.
  const append = showDisplayOptions ? (
    <>
      {toggleSwitches ? (
        <>
          <MenuSeparator />
          {toggleSwitches}
        </>
      ) : null}
      <MenuSeparator />
      <MenuFooter document={document} />
    </>
  ) : undefined;

  return (
    <ActionContextProvider value={{ activeModels }}>
      <DropdownMenu
        action={rootAction}
        align={align}
        onOpen={onOpen}
        onClose={onClose}
        ariaLabel={t("Document options")}
        append={append}
      >
        <OverflowMenuButton
          neutral={neutral}
          onPointerEnter={handlePointerEnter}
        />
      </DropdownMenu>
    </ActionContextProvider>
  );
}

/**
 * galadrim: the last lines of the menu of the document being viewed, as at the
 * bottom of the menu of a Notion page: word count, who edited last and when. A
 * separate component so that the word count is only computed once the menu is
 * open, it must be rendered within the document context.
 */
const MenuFooter = observer(function MenuFooter_({
  document,
}: {
  document: Document;
}) {
  const { t } = useTranslation();
  const { stats } = useDocumentContext();
  const formatNumber = useFormatNumber();

  return (
    <Footer>
      <div>
        {t(`{{ number }} words`, {
          count: stats.words,
          number: formatNumber(stats.words),
        })}
      </div>
      <div>
        {t("Last edited")}
        {document.updatedBy
          ? ` ${t("by {{ name }}", { name: document.updatedBy.name })}`
          : ""}
      </div>
      <div>
        <Time dateTime={document.updatedAt} addSuffix />
      </div>
    </Footer>
  );
});

const Footer = styled.div`
  padding: 8px 12px 4px;
  font-size: 13px;
  line-height: 1.5;
  color: ${s("textTertiary")};
  user-select: none;
`;

const ToggleMenuItem = styled(Switch)`
  * {
    font-weight: normal;
    color: ${s("textSecondary")};
  }
`;

const DisplayOptions = styled.div`
  padding: 8px 0 0;
`;

const Style = styled.div`
  padding: 12px;

  ${breakpoint("tablet")`
    padding: 4px 12px;
    font-size: 14px;
  `};
`;

export default observer(DocumentMenu);

import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { createCollection } from "~/actions/definitions/collections";
import {
  navigateToArchive,
  navigateToDrafts,
  navigateToProfileSettings,
  navigateToAccountPreferences,
  openKeyboardShortcuts,
  logout,
} from "~/actions/definitions/navigation";
import { changeTheme } from "~/actions/definitions/settings";
import { inviteUser } from "~/actions/definitions/users";
import { ActionSeparator } from "~/actions";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import { useMenuAction } from "~/hooks/useMenuAction";
import usePolicy from "~/hooks/usePolicy";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";

type Props = {
  children?: React.ReactNode;
};

const AccountMenu: React.FC<Props> = ({ children }: Props) => {
  const { t } = useTranslation();
  // The menu is also rendered on a publicly shared page (AuthenticatedIsland),
  // where the signed-in user's team may not have been loaded – hence
  // rejectOnEmpty: false, which would otherwise throw there.
  const team = useCurrentTeam({ rejectOnEmpty: false });
  const can = usePolicy(team);

  const actions = React.useMemo(
    () => [
      // galadrim: the links to the vendor's documentation, API reference,
      // changelog, feedback and bug report forms are left to the command bar.
      openKeyboardShortcuts,
      ActionSeparator,
      // galadrim: entries that Notion's sidebar lacks live here instead.
      // createCollection and inviteUser carry their own policy predicate;
      // the drafts and archive scenes carry none, so they are gated here on
      // the same ability as the sidebar rows they replace.
      ...(can.createDocument ? [navigateToDrafts, navigateToArchive] : []),
      createCollection,
      inviteUser,
      ActionSeparator,
      changeTheme,
      navigateToProfileSettings,
      navigateToAccountPreferences,
      ActionSeparator,
      logout,
    ],
    [can.createDocument]
  );

  const rootAction = useMenuAction(actions);

  return (
    <DropdownMenu action={rootAction} align="end" ariaLabel={t("Account")}>
      {children}
    </DropdownMenu>
  );
};

export default observer(AccountMenu);

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
import { useMenuAction } from "~/hooks/useMenuAction";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";

type Props = {
  children?: React.ReactNode;
};

const AccountMenu: React.FC<Props> = ({ children }: Props) => {
  const { t } = useTranslation();

  const actions = React.useMemo(
    () => [
      // galadrim: the links to the vendor's documentation, API reference,
      // changelog, feedback and bug report forms are left to the command bar.
      openKeyboardShortcuts,
      ActionSeparator,
      // galadrim: entries that Notion's sidebar lacks live here instead. Each
      // action hides itself from users who are not allowed to perform it.
      navigateToDrafts,
      navigateToArchive,
      createCollection,
      inviteUser,
      ActionSeparator,
      changeTheme,
      navigateToProfileSettings,
      navigateToAccountPreferences,
      ActionSeparator,
      logout,
    ],
    []
  );

  const rootAction = useMenuAction(actions);

  return (
    <DropdownMenu action={rootAction} align="end" ariaLabel={t("Account")}>
      {children}
    </DropdownMenu>
  );
};

export default observer(AccountMenu);

import { observer } from "mobx-react";
import * as React from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "react-router-dom";
import styled from "styled-components";
import type { DatabaseFormDefinition } from "@shared/databases/forms";
import { s } from "@shared/styles";
import DelayedMount from "~/components/DelayedMount";
import FullscreenLoading from "~/components/FullscreenLoading";
import useCurrentUser from "~/hooks/useCurrentUser";
import { usePostLoginPath } from "~/hooks/useLastVisitedPath";
import Error404 from "~/scenes/Errors/Error404";
import { databaseRpc } from "~/stores/DatabasesStore";
import { NotFoundError } from "~/utils/errors";
import { changeLanguage, detectLanguage } from "~/utils/language";
import lazyWithRetry from "~/utils/lazyWithRetry";
import { FormPage } from "./FormPage";

const Login = lazyWithRetry(() => import("../Login"));

/**
 * The public page of a database form, `/f/:slug`: anyone with the link fills
 * it in, unless the form asks for a login.
 *
 * @returns the scene.
 */
export const DatabaseFormScene = observer(function DatabaseFormScene_() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const [, setPostLoginPath] = usePostLoginPath();
  const [definition, setDefinition] = React.useState<DatabaseFormDefinition>();
  const [error, setError] = React.useState<Error>();

  React.useEffect(() => {
    if (!user) {
      void changeLanguage(detectLanguage(), i18n);
    }
  }, [user, i18n]);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    databaseRpc<DatabaseFormDefinition>("/databaseForms.info", { slug })
      .then((res) => {
        if (!cancelled) {
          setDefinition(res.data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, user?.id]);

  const needsLogin = !!definition && !definition.canSubmit && !user;
  React.useEffect(() => {
    if (needsLogin) {
      setPostLoginPath(location.pathname);
    }
  }, [needsLogin, location.pathname, setPostLoginPath]);

  if (error) {
    return error instanceof NotFoundError ? (
      <Error404 />
    ) : (
      <Message role="alert">{t("Couldn’t load the form, try again?")}</Message>
    );
  }

  if (!definition) {
    return (
      <DelayedMount>
        <FullscreenLoading />
      </DelayedMount>
    );
  }

  if (needsLogin) {
    return (
      <React.Suspense fallback={null}>
        <Login>
          {() => (
            <Message>
              {t("Sign in to fill in « {{ title }} ».", {
                title: definition.title,
              })}
            </Message>
          )}
        </Login>
      </React.Suspense>
    );
  }

  return (
    <>
      <Helmet>
        <title>{definition.title}</title>
      </Helmet>
      {definition.canSubmit ? (
        <FormPage definition={definition} slug={slug} />
      ) : (
        <Message role="alert">
          {t("This form is only open to the members of its workspace.")}
        </Message>
      )}
    </>
  );
});

const Message = styled.p`
  max-width: 480px;
  margin: 48px auto;
  padding: 0 20px;
  color: ${s("textSecondary")};
  font-size: 15px;
  text-align: center;
`;

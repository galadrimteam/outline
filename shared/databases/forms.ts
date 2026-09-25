import type { DatabaseField } from "./types";

/** A question of a form: a field of the form view, in the view's order. */
export interface DatabaseFormQuestion {
  field: DatabaseField;
  required: boolean;
}

/** What `databaseForms.info` returns: enough to draw and fill a form. */
export interface DatabaseFormDefinition {
  databaseId: string;
  viewId: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  submitLabel: string | null;
  successMessage: string | null;
  requireLogin: boolean;
  /** False when the form requires a login and nobody is signed in: the questions are then withheld. */
  canSubmit: boolean;
  questions: DatabaseFormQuestion[];
}

/** The sharing of a form view, as `databaseForms.share` returns it. */
export interface DatabaseFormSharing {
  viewId: string;
  public: boolean;
  requireLogin: boolean;
  slug: string | null;
  successMessage: string | null;
  /** The app path of the public form, eg "/f/<slug>". */
  url: string | null;
}

/** The honeypot input of public forms: people never see it, robots fill it. */
export const FORM_HONEYPOT_FIELD = "website";

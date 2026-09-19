"use strict";

// galadrim: accent-insensitive full text search in the language of the team.
//
// Upstream indexes and queries documents with the 'english' text search
// configuration and no accent folding: typing "securite" did not find
// "Sécurité", and French words were stemmed with English rules.
//
// This migration creates ONE text search configuration, "outline_search",
// copied from a base language with `unaccent` put in front of the stemmer,
// points the documents trigger at it and rebuilds every search vector. The
// query side uses the same name (server/utils/searchConfiguration.ts).
//
// Base language: SEARCH_LANGUAGE when set (the name of a Postgres text search
// configuration: french, english, simple, german…), otherwise "french" when
// DEFAULT_LANGUAGE is a French locale, otherwise "english". It is only read
// here: to change it later, re-run this migration (undo then migrate) with the
// new value.
//
// Cost: one UPDATE per batch of 500 documents, a few seconds for thousands of
// documents. Every statement is idempotent; nothing runs in a transaction, so
// a failure part way through is simply retried from the start at next boot.
//
// Rollback: deploy the previous image AND undo this migration, because older
// code queries with 'english' while the vectors are built with
// "outline_search". Either `sequelize db:migrate:undo --name <this file>`, or
// by hand in psql:
//   1. re-create documents_search_trigger() from
//      20231227040129-update-tsvector-trigger.js (up),
//   2. UPDATE documents SET title = title;
//   3. DROP TEXT SEARCH CONFIGURATION IF EXISTS outline_search;
//   4. DELETE FROM "SequelizeMeta" WHERE name = '<this file>';
//
// When rebasing on upstream: a later upstream migration that re-creates
// documents_search_trigger() with 'english' must be followed by a copy of this
// one.

// Keep in sync with server/utils/searchConfiguration.ts.
const SEARCH_CONFIGURATION = "outline_search";
const BATCH_SIZE = 500;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function baseLanguage() {
  const explicit = (process.env.SEARCH_LANGUAGE || "").trim().toLowerCase();
  if (explicit) {
    return explicit;
  }
  return /^fr/i.test(process.env.DEFAULT_LANGUAGE || "") ? "french" : "english";
}

function triggerFunction(configuration) {
  return `
    CREATE OR REPLACE FUNCTION documents_search_trigger() RETURNS trigger AS $$
    begin
      new."searchVector" :=
        setweight(to_tsvector('${configuration}', coalesce(new.title, '')),'A') ||
        setweight(to_tsvector('${configuration}', coalesce(array_to_string(new."previousTitles", ' , '),'')),'C') ||
        setweight(to_tsvector('${configuration}', substring(coalesce(new.text, ''), 1, 1000000)), 'D');
      return new;
    end
    $$ LANGUAGE plpgsql;
  `;
}

// Rebuilds every search vector, deleted and archived documents included (the
// permanent deleter looks attachments up in all of them). The vector is
// computed by the trigger, which fires on an update of "title", so that the
// formula lives in one place.
async function rebuildSearchVectors(queryInterface) {
  let lastId = "00000000-0000-0000-0000-000000000000";
  let total = 0;

  for (;;) {
    const [rows] = await queryInterface.sequelize.query(`
WITH batch AS (
  SELECT "id" FROM "documents"
  WHERE "id" > '${lastId}'
  ORDER BY "id"
  LIMIT ${BATCH_SIZE}
)
UPDATE "documents"
SET "title" = "title"
WHERE "id" IN (SELECT "id" FROM batch)
RETURNING "id"
    `);

    if (!rows.length) {
      break;
    }

    lastId = rows
      .map((row) => String(row.id))
      .sort()
      .pop();
    if (!/^[0-9a-f-]{36}$/i.test(lastId)) {
      throw new Error(`Unexpected document id: ${lastId}`);
    }

    total += rows.length;
    console.log(`Rebuilding documents.searchVector… ${total}`);
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const base = baseLanguage();
    if (!IDENTIFIER.test(base)) {
      throw new Error(`SEARCH_LANGUAGE is not a valid name: ${base}`);
    }

    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS "unaccent";'
    );

    // The dictionaries the base configuration uses for words, e.g.
    // "french_stem"; unaccent is a filtering dictionary that goes first.
    const [dictionaries] = await queryInterface.sequelize.query(`
SELECT d.dictname AS name
FROM pg_ts_config c
JOIN pg_ts_config_map m ON m.mapcfg = c.oid
JOIN pg_ts_dict d ON d.oid = m.mapdict
JOIN ts_token_type('default') t ON t.tokid = m.maptokentype
WHERE c.cfgname = '${base}' AND c.cfgnamespace = 'pg_catalog'::regnamespace AND t.alias = 'word'
ORDER BY m.mapseqno
    `);
    const names = dictionaries.map((row) => String(row.name));
    if (!names.length || !names.every((name) => IDENTIFIER.test(name))) {
      throw new Error(
        `SEARCH_LANGUAGE "${base}" is not a text search configuration of this Postgres (see \\dF in psql)`
      );
    }

    await queryInterface.sequelize.query(
      `DROP TEXT SEARCH CONFIGURATION IF EXISTS ${SEARCH_CONFIGURATION};`
    );
    await queryInterface.sequelize.query(
      `CREATE TEXT SEARCH CONFIGURATION ${SEARCH_CONFIGURATION} (COPY = pg_catalog.${base});`
    );
    await queryInterface.sequelize.query(
      `ALTER TEXT SEARCH CONFIGURATION ${SEARCH_CONFIGURATION} ALTER MAPPING FOR hword, hword_part, word WITH unaccent, ${names.join(", ")};`
    );

    await queryInterface.sequelize.query(triggerFunction(SEARCH_CONFIGURATION));
    await rebuildSearchVectors(queryInterface);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(triggerFunction("english"));
    await rebuildSearchVectors(queryInterface);
    await queryInterface.sequelize.query(
      `DROP TEXT SEARCH CONFIGURATION IF EXISTS ${SEARCH_CONFIGURATION};`
    );
  },
};

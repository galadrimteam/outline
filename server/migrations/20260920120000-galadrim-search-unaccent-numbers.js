"use strict";

// galadrim: accent folding for the words that mix letters and digits.
//
// 20260919120000 put `unaccent` in front of the stemmer of the "outline_search"
// text search configuration, but only for the token types "word", "hword" and
// "hword_part". Postgres' parser gives a token that mixes letters and digits
// its own type — "Réunion2024" is a `numword`, "Q1-Été" a `numhword` made of
// `hword_numpart`s — and those were left folding nothing: the vector held
// 'réunion2024' while the query side asked for 'reunion2024', so searching
// "Reunion2024" found nothing. This migration adds `unaccent` to those three
// token types and rebuilds the vectors.
//
// It keeps each token type's own dictionary rather than the one "word" uses:
// the built-in configurations index a word with digits with `simple`, never
// with the language's stemmer, and that is left as it is — only the accents
// change.
//
// It is a second migration and not an edit of 20260919120000 because that one
// has already run on the production database, where editing it would do
// nothing.
//
// Cost: nothing at all when the mapping is already right (one catalogue read),
// otherwise three ALTERs and one rebuild of every search vector, a few seconds
// for thousands of documents. Nothing runs in a transaction, so a failure part
// way through is retried from the start at next boot; an ALTER MAPPING may be
// re-run as often as needed. Unlike 20260919120000 it never drops the
// configuration, so a retry cannot leave the running app without one.
//
// Rollback: `sequelize db:migrate:undo --name <this file>`, which puts the
// three token types back to their dictionary without `unaccent` and rebuilds
// the vectors. Rolling back to an image older than 20260919120000 needs that
// migration undone as well, as its own header says. By hand in psql:
//   1. ALTER TEXT SEARCH CONFIGURATION outline_search
//        ALTER MAPPING FOR numword, numhword, hword_numpart WITH simple;
//   2. UPDATE documents SET title = title;
//   3. DELETE FROM "SequelizeMeta" WHERE name = '<this file>';

// Keep in sync with server/utils/searchConfiguration.ts.
const SEARCH_CONFIGURATION = "outline_search";
// The token types Postgres' parser gives to a word that holds a digit.
const TOKEN_TYPES = ["numword", "numhword", "hword_numpart"];
const UNACCENT = "unaccent";
const BATCH_SIZE = 500;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/**
 * The dictionaries "outline_search" uses for the token types above, in order.
 *
 * @param {import("sequelize").QueryInterface} queryInterface
 * @returns {Promise<Map<string, string[]>>} Empty when the configuration is not
 *   there at all.
 */
async function mappings(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    `
-- "dictname::text", because the driver hands a name[] back as a string.
SELECT t.alias AS alias, array_agg(d.dictname::text ORDER BY m.mapseqno) AS dicts
FROM pg_ts_config c
JOIN pg_ts_config_map m ON m.mapcfg = c.oid
JOIN pg_ts_dict d ON d.oid = m.mapdict
JOIN ts_token_type('default') t ON t.tokid = m.maptokentype
WHERE c.cfgname = '${SEARCH_CONFIGURATION}' AND t.alias IN (${TOKEN_TYPES.map(
      (token) => `'${token}'`
    ).join(", ")})
GROUP BY t.alias
    `
  );

  return new Map(
    rows.map((row) => [
      String(row.alias),
      row.dicts.map((name) => String(name)),
    ])
  );
}

/**
 * Points a token type at the given dictionaries.
 *
 * @param {import("sequelize").QueryInterface} queryInterface
 * @param {string} token One of TOKEN_TYPES.
 * @param {string[]} dictionaries The dictionaries, in order.
 */
async function setMapping(queryInterface, token, dictionaries) {
  if (!dictionaries.length || !dictionaries.every((n) => IDENTIFIER.test(n))) {
    throw new Error(
      `Unexpected dictionaries for ${token}: ${dictionaries.join(", ")}`
    );
  }

  await queryInterface.sequelize.query(
    `ALTER TEXT SEARCH CONFIGURATION ${SEARCH_CONFIGURATION} ALTER MAPPING FOR ${token} WITH ${dictionaries.join(
      ", "
    )};`
  );
}

// Rebuilds every search vector, deleted and archived documents included (the
// permanent deleter looks attachments up in all of them). The vector is
// computed by the trigger, which fires on an update of "title", so that the
// formula lives in one place. Same loop as 20260919120000; a migration does
// not import another, so that removing one never changes what another does.
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
    const current = await mappings(queryInterface);
    if (!current.size) {
      // No "outline_search" here: 20260919120000 was undone and will create it
      // again, with this mapping, before this migration is reached once more.
      console.log(
        `${SEARCH_CONFIGURATION} does not exist, nothing to fold accents in`
      );
      return;
    }

    const todo = [...current].filter(
      ([, dictionaries]) => !dictionaries.includes(UNACCENT)
    );
    if (!todo.length) {
      // Already folded: no vector to rebuild.
      return;
    }

    for (const [token, dictionaries] of todo) {
      await setMapping(queryInterface, token, [UNACCENT, ...dictionaries]);
    }

    await rebuildSearchVectors(queryInterface);
  },

  async down(queryInterface) {
    const current = await mappings(queryInterface);
    const todo = [...current].filter(([, dictionaries]) =>
      dictionaries.includes(UNACCENT)
    );
    if (!todo.length) {
      return;
    }

    for (const [token, dictionaries] of todo) {
      await setMapping(
        queryInterface,
        token,
        dictionaries.filter((name) => name !== UNACCENT)
      );
    }

    await rebuildSearchVectors(queryInterface);
  },
};
